const { firebase } = require("./config");
const {
  route,
  fail,
  data,
  text,
  positive,
  required,
  discount,
  numberId,
} = require("./helpers");
async function products() {
  const snap = await firebase().db.collection("products").limit(1001).get();
  if (snap.size > 1000)
    fail(
      "This catalogue needs an indexed search service before expansion beyond 1000 products.",
      503,
    );
  return snap.docs.map((d) => d.data());
}
function cleanProduct(p, detail = false) {
  if (!p) return null;
  const { cost_price, ...publicProduct } = p;
  if (!detail) {
    delete publicProduct.images;
    delete publicProduct.variants;
    delete publicProduct.description;
  }
  return publicProduct;
}
async function findProduct(id) {
  if (/^\d+$/.test(id))
    return data(
      await firebase()
        .db.collection("products")
        .doc(String(Number(id)))
        .get(),
    );
  const s = await firebase()
    .db.collection("products")
    .where("slug", "==", id)
    .limit(1)
    .get();
  return s.empty ? null : s.docs[0].data();
}
function registerCatalog(router) {
  router.get(
    "/categories",
    route(async (req, res) => {
      const [cats, all] = await Promise.all([
        firebase().db.collection("categories").get(),
        products(),
      ]);
      res.json({
        success: true,
        data: cats.docs
          .map((d) => ({
            ...d.data(),
            product_count: all.filter((p) => p.category_id === d.data().id)
              .length,
          }))
          .sort((a, b) => a.sort_order - b.sort_order),
      });
    }),
  );
  router.get(
    "/categories/:slug",
    route(async (req, res) => {
      const s = await firebase()
        .db.collection("categories")
        .where("slug", "==", req.params.slug)
        .limit(1)
        .get();
      if (s.empty) fail("Category not found.", 404);
      res.json({ success: true, data: s.docs[0].data() });
    }),
  );
  router.get(
    "/products",
    route(async (req, res) => {
      const q = req.query;
      let all = await products();
      if (q.category) {
        const alias = {
          electronics: "gadgets",
          tech: "gadgets",
          sneakers: "footwear",
          shoes: "footwear",
        };
        const category = alias[q.category] || q.category;
        all = all.filter(
          (p) =>
            String(p.category_id) === category || p.category_slug === category,
        );
      }
      if (q.search) {
        const term = text(q.search, 100).toLowerCase();
        all = all.filter((p) =>
          [
            p.title,
            p.description,
            p.short_description,
            p.sku,
            p.category_name,
          ].some((v) =>
            String(v || "")
              .toLowerCase()
              .includes(term),
          ),
        );
      }
      for (const [key, compare] of [
        ["min_price", (p, v) => p.price >= v],
        ["max_price", (p, v) => p.price <= v],
        ["rating", (p, v) => p.rating_avg >= v],
      ])
        if (q[key] !== undefined && q[key] !== "") {
          const n = Number(q[key]);
          if (!Number.isFinite(n) || n < 0) fail("Invalid product filter.");
          all = all.filter((p) => compare(p, n));
        }
      for (const [key, field] of [
        ["featured", "is_featured"],
        ["is_new", "is_new"],
        ["in_stock", "stock_qty"],
      ])
        if (["true", "1"].includes(q[key]))
          all = all.filter((p) => Number(p[field]) > 0);
      const sort =
        {
          price_asc: (a, b) => a.price - b.price,
          price_desc: (a, b) => b.price - a.price,
          rating_desc: (a, b) => b.rating_avg - a.rating_avg,
          newest: (a, b) =>
            String(b.created_at || "").localeCompare(
              String(a.created_at || ""),
            ) || b.id - a.id,
          title_asc: (a, b) => a.title.localeCompare(b.title),
        }[q.sort] || ((a, b) => b.is_featured - a.is_featured || a.id - b.id);
      all.sort(sort);
      const total = all.length,
        page = Math.max(1, parseInt(q.page) || 1),
        limit = Math.max(1, Math.min(100, parseInt(q.limit) || 12));
      res.json({
        success: true,
        data: all
          .slice((page - 1) * limit, page * limit)
          .map((p) => cleanProduct(p)),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    }),
  );
  router.get(
    "/products/featured",
    route(async (req, res) =>
      res.json({
        success: true,
        data: (await products())
          .filter((p) => p.is_featured)
          .sort((a, b) => b.rating_avg - a.rating_avg)
          .slice(0, Math.min(100, Number(req.query.limit) || 8))
          .map((p) => cleanProduct(p)),
      }),
    ),
  );
  router.get(
    "/products/related/:id",
    route(async (req, res) => {
      const target = await findProduct(req.params.id);
      res.json({
        success: true,
        data: target
          ? (await products())
              .filter(
                (p) =>
                  p.id !== target.id && p.category_id === target.category_id,
              )
              .slice(0, 4)
              .map((p) => cleanProduct(p))
          : [],
      });
    }),
  );
  router.get(
    "/products/:identifier",
    route(async (req, res) => {
      const product = await findProduct(req.params.identifier);
      if (!product) fail("Product not found.", 404);
      const reviews = await firebase()
        .db.collection("reviews")
        .where("product_id", "==", product.id)
        .get();
      res.json({
        success: true,
        data: {
          ...cleanProduct(product, true),
          reviews: reviews.docs.map((d) => d.data()),
        },
      });
    }),
  );
  router.post(
    "/coupons/validate",
    route(async (req, res) => {
      const code = text(req.body.code, 80).toUpperCase();
      const coupon = data(
        await firebase().db.collection("coupons").doc(code).get(),
      );
      if (!coupon) fail("Invalid coupon.", 404);
      const subtotal = Number(req.body.cart_subtotal);
      if (!Number.isFinite(subtotal) || subtotal < 0) fail("Invalid subtotal.");
      const result = discount(coupon, subtotal);
      res.json({
        success: true,
        message: "Coupon applied.",
        data: { ...coupon, discount_amount: result.discount },
      });
    }),
  );
  router.get(
    "/coupons/available",
    route(async (req, res) =>
      res.json({
        success: true,
        data: (
          await firebase()
            .db.collection("coupons")
            .where("is_active", "==", 1)
            .get()
        ).docs.map((d) => d.data()),
      }),
    ),
  );
  router.get(
    "/reviews/product/:id",
    route(async (req, res) =>
      res.json({
        success: true,
        data: (
          await firebase()
            .db.collection("reviews")
            .where("product_id", "==", positive(req.params.id))
            .get()
        ).docs.map((d) => d.data()),
      }),
    ),
  );
  router.post(
    "/reviews",
    required,
    route(async (req, res) => {
      const productId = positive(req.body.product_id),
        rating = positive(req.body.rating),
        title = text(req.body.title, 150),
        comment = text(req.body.comment, 3000);
      if (rating > 5 || !title || !comment)
        fail("Provide a rating (1–5), title, and review.");
      const db = firebase().db,
        reviewId = numberId(),
        ref = db.collection("reviews").doc(String(reviewId)),
        claim = db
          .collection("review_claims")
          .doc(req.user.uid + "_" + productId),
        productRef = db.collection("products").doc(String(productId));
      const orders = await db
        .collection("orders")
        .where("user_id", "==", req.user.uid)
        .get();
      const verified = orders.docs.some(
        (d) =>
          d.data().order_status === "delivered" &&
          d.data().items.some((i) => i.product_id === productId),
      );
      const result = await db.runTransaction(async (tx) => {
        const [existing, product] = await Promise.all([
          tx.get(claim),
          tx.get(productRef),
        ]);
        if (existing.exists) fail("You have already reviewed this product.");
        if (!product.exists) fail("Product not found.", 404);
        const p = product.data(),
          count = Number(p.review_count || 0);
        const review = {
          id: reviewId,
          product_id: productId,
          user_id: req.user.uid,
          user_name: req.user.name || "Customer",
          rating,
          title,
          comment,
          is_verified_purchase: verified ? 1 : 0,
          helpful_votes: 0,
          created_at: new Date().toISOString(),
        };
        tx.create(claim, { review_id: reviewId });
        tx.create(ref, review);
        tx.update(productRef, {
          review_count: count + 1,
          rating_avg: Number(
            (
              (Number(p.rating_avg || 0) * count + rating) /
              (count + 1)
            ).toFixed(2),
          ),
        });
        return review;
      });
      res
        .status(201)
        .json({ success: true, message: "Review saved.", data: result });
    }),
  );
  router.post(
    "/reviews/:id/helpful",
    required,
    route(async (req, res) => {
      const db = firebase().db,
        ref = db.collection("reviews").doc(req.params.id),
        vote = ref.collection("votes").doc(req.user.uid);
      await db.runTransaction(async (tx) => {
        const [r, v] = await Promise.all([tx.get(ref), tx.get(vote)]);
        if (!r.exists) fail("Review not found.", 404);
        if (!v.exists) {
          tx.create(vote, { created_at: new Date().toISOString() });
          tx.update(ref, {
            helpful_votes: Number(r.data().helpful_votes || 0) + 1,
          });
        }
      });
      res.json({ success: true, message: "Feedback saved." });
    }),
  );
}
module.exports = { registerCatalog, findProduct, cleanProduct };
