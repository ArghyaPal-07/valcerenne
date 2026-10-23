const { firebase } = require("./config");
const {
  route,
  required,
  admin,
  fail,
  data,
  text,
  positive,
  cartRef,
  summary,
  lineFor,
  discount,
  hash,
  numberId,
} = require("./helpers");
const round = (v) => Math.round(v * 100) / 100;
function registerCommerce(router) {
  router.get(
    "/cart",
    route(async (req, res) => {
      if (!req.user && !req.headers["x-session-token"])
        return res.json({ success: true, data: summary(null) });
      res.json({
        success: true,
        data: summary(data(await cartRef(req).get())),
      });
    }),
  );
  async function changeCart(req, res, action) {
    const db = firebase().db,
      ref = cartRef(req);
    const result = await db.runTransaction(async (tx) => {
      let items = data(await tx.get(ref))?.items || [];
      if (action === "add") {
        if (items.length >= 100) fail("Shopping bag limit reached.");
        const id = positive(req.body.product_id || req.body.productId),
          variant = req.body.variant_id || req.body.variantId || null,
          qty = positive(req.body.quantity ?? 1);
        const product = data(
          await tx.get(db.collection("products").doc(String(id))),
        );
        if (!product) fail("Product not found.", 404);
        const existing = items.find(
          (i) =>
            i.product_id === id &&
            String(i.variant_id || "") === String(variant || ""),
        );
        const line = lineFor(product, variant, (existing?.quantity || 0) + qty);
        items = items.filter((i) => i.item_id !== line.item_id);
        items.push(line);
      } else {
        const id = positive(req.params.id),
          item = items.find((i) => i.item_id === id);
        if (!item) fail("Cart item not found.", 404);
        const qty = action === "remove" ? 0 : Number(req.body.quantity);
        if (!Number.isSafeInteger(qty) || qty < 0)
          fail("Quantity must be a non-negative integer.");
        if (qty) {
          const product = data(
            await tx.get(
              db.collection("products").doc(String(item.product_id)),
            ),
          );
          if (!product) fail("Product no longer available.");
          const line = lineFor(product, item.variant_id, qty);
          items = items.map((i) => (i.item_id === id ? line : i));
        } else items = items.filter((i) => i.item_id !== id);
      }
      tx.set(ref, {
        user_id: req.user?.uid || null,
        items,
        updated_at: new Date().toISOString(),
      });
      return summary({ items });
    });
    res.json({ success: true, data: result });
  }
  router.post(
    "/cart/add",
    route((req, res) => changeCart(req, res, "add")),
  );
  router.put(
    "/cart/items/:id",
    route((req, res) => changeCart(req, res, "update")),
  );
  router.delete(
    "/cart/items/:id",
    route((req, res) => changeCart(req, res, "remove")),
  );
  router.delete(
    "/cart/clear",
    route(async (req, res) => {
      await cartRef(req).delete();
      res.json({ success: true, data: summary(null) });
    }),
  );
  router.post(
    "/cart/merge",
    required,
    route(async (req, res) => {
      const db = firebase().db,
        guest = cartRef(
          req,
          req.body.session_token || req.headers["x-session-token"],
        ),
        target = cartRef(req);
      const result = await db.runTransaction(async (tx) => {
        const [g, u] = await Promise.all([tx.get(guest), tx.get(target)]);
        const old = [...(data(u)?.items || []), ...(data(g)?.items || [])];
        const refs = [...new Set(old.map((i) => i.product_id))].map((id) =>
          db.collection("products").doc(String(id)),
        );
        const snapshots = refs.length ? await tx.getAll(...refs) : [];
        const products = new Map(
          snapshots.filter((d) => d.exists).map((d) => [d.data().id, d.data()]),
        );
        const merged = new Map();
        for (const item of old) {
          const p = products.get(item.product_id);
          if (!p) fail("An item in your bag is no longer available.");
          const current = merged.get(item.item_id);
          merged.set(
            item.item_id,
            lineFor(
              p,
              item.variant_id,
              (current?.quantity || 0) + item.quantity,
            ),
          );
        }
        const items = [...merged.values()];
        if (items.length > 100) fail("Shopping bag limit reached.");
        tx.set(target, { user_id: req.user.uid, items });
        tx.delete(guest);
        return summary({ items });
      });
      res.json({ success: true, data: result });
    }),
  );
  router.post(
    "/orders/checkout",
    route(async (req, res) => {
      if ((req.body.payment_method || "cod") !== "cod")
        fail(
          "Online payments are not configured. Choose cash on delivery.",
          503,
        );
      const address = require("./customers").addressFields(
        req.body.shipping_address || {},
      );
      address.email = text(req.body.shipping_address?.email, 254);
      const db = firebase().db,
        bag = cartRef(req),
        orderNumber = `VC-${new Date().getFullYear()}-${require("crypto").randomBytes(8).toString("hex").toUpperCase()}`,
        orderRef = db.collection("orders").doc(orderNumber),
        id = numberId(),
        created = new Date().toISOString(),
        code = text(req.body.coupon_code, 80).toUpperCase();
      const result = await db.runTransaction(async (tx) => {
        const items = data(await tx.get(bag))?.items || [];
        if (!items.length) fail("Your cart is empty.");
        const refs = [...new Set(items.map((i) => i.product_id))].map((id) =>
          db.collection("products").doc(String(id)),
        );
        const snapshots = await tx.getAll(...refs);
        const products = new Map(
          snapshots.filter((d) => d.exists).map((d) => [d.data().id, d.data()]),
        );
        const couponRef = code ? db.collection("coupons").doc(code) : null,
          coupon = couponRef ? data(await tx.get(couponRef)) : null;
        if (code && !coupon) fail("Invalid coupon.");
        const lines = [];
        for (const item of items) {
          const p = products.get(item.product_id);
          if (!p) fail("A product is no longer available.");
          const line = lineFor(p, item.variant_id, positive(item.quantity));
          p.stock_qty -= line.quantity;
          if (line.variant_id) {
            const v = p.variants.find((v) => v.id === line.variant_id);
            v.stock_qty -= line.quantity;
          }
          lines.push(line);
        }
        const subtotal = round(lines.reduce((sum, i) => sum + i.subtotal, 0)),
          promo = discount(coupon, subtotal),
          tax = round((subtotal - promo.discount) * 0.08),
          shipping = subtotal >= 999 || promo.freeShipping ? 0 : 149,
          total = round(subtotal - promo.discount + tax + shipping);
        const order = {
          id,
          order_number: orderNumber,
          user_id: req.user?.uid || null,
          guest_session_hash: req.user
            ? null
            : hash(req.headers["x-session-token"]),
          subtotal,
          discount_amount: promo.discount,
          tax_amount: tax,
          shipping_fee: shipping,
          total_amount: total,
          order_status: "pending",
          payment_status: "pending",
          payment_method: "cod",
          shipping_address: address,
          billing_address: address,
          notes: text(req.body.notes, 1000) || null,
          tracking_number: null,
          created_at: created,
          total_items: lines.reduce((s, i) => s + i.quantity, 0),
          items: lines.map((i) => ({
            ...i,
            id: i.item_id,
            unit_price: i.price,
            variant_info: [i.variant_color, i.variant_size]
              .filter(Boolean)
              .join(" / "),
            product_image: i.image_url,
          })),
          history: [
            {
              status: "pending",
              notes: "Order received. Payment due on delivery.",
              created_at: created,
            },
          ],
        };
        for (const snap of snapshots) {
          const p = products.get(snap.data().id);
          tx.update(snap.ref, {
            stock_qty: p.stock_qty,
            variants: p.variants || [],
          });
        }
        if (couponRef)
          tx.update(couponRef, {
            times_used: Number(coupon.times_used || 0) + 1,
          });
        tx.create(orderRef, order);
        tx.delete(bag);
        return {
          orderId: id,
          orderNumber,
          trackingNumber: null,
          subtotal,
          discountAmount: promo.discount,
          taxAmount: tax,
          shippingFee: shipping,
          totalAmount: total,
          orderStatus: "pending",
          paymentStatus: "pending",
        };
      });
      res
        .status(201)
        .json({
          success: true,
          message: "Order received. Payment is due on delivery.",
          data: result,
        });
    }),
  );
  router.get(
    "/orders/my-orders",
    required,
    route(async (req, res) => {
      const s = await firebase()
        .db.collection("orders")
        .where("user_id", "==", req.user.uid)
        .get();
      res.json({
        success: true,
        data: s.docs
          .map((d) => publicOrder(d.data()))
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      });
    }),
  );
  router.get(
    "/orders/all",
    required,
    admin,
    route(async (req, res) =>
      res.json({
        success: true,
        data: (
          await firebase().db.collection("orders").limit(100).get()
        ).docs.map((d) => publicOrder(d.data())),
      }),
    ),
  );
  router.get(
    "/orders/:identifier",
    route(async (req, res) => {
      const snap = await getOrder(req.params.identifier);
      if (!snap) fail("Order not found.", 404);
      const order = snap.data();
      authorizeOrder(req, order);
      res.json({ success: true, data: publicOrder(order) });
    }),
  );
  router.post(
    "/orders/:identifier/cancel",
    required,
    route(async (req, res) => {
      const db = firebase().db,
        snapshot = await getOrder(req.params.identifier);
      if (!snapshot) fail("Order not found.", 404);
      await db.runTransaction(async (tx) => {
        const s = await tx.get(snapshot.ref),
          o = s.data();
        authorizeOrder(req, o);
        if (!["pending", "processing"].includes(o.order_status))
          fail("This order cannot be cancelled.");
        if (o.payment_status === "paid")
          fail("Paid orders require a verified payment-provider refund.", 409);
        const ids = [...new Set(o.items.map((i) => i.product_id))],
          products = await tx.getAll(
            ...ids.map((id) => db.collection("products").doc(String(id))),
          );
        for (const p of products) {
          if (!p.exists) fail("Cannot restore an unavailable product.", 409);
          const row = p.data();
          for (const i of o.items.filter((i) => i.product_id === row.id)) {
            row.stock_qty += i.quantity;
            if (i.variant_id) {
              const v = row.variants.find((v) => v.id === i.variant_id);
              if (!v) fail("Cannot restore a missing variant.", 409);
              v.stock_qty += i.quantity;
            }
          }
          tx.update(p.ref, {
            stock_qty: row.stock_qty,
            variants: row.variants || [],
          });
        }
        tx.update(s.ref, {
          order_status: "cancelled",
          history: [
            ...o.history,
            {
              status: "cancelled",
              notes: "Order cancelled; no payment was collected.",
              created_at: new Date().toISOString(),
            },
          ],
        });
      });
      res.json({ success: true, message: "Order cancelled." });
    }),
  );
  router.put(
    "/orders/status/:identifier",
    required,
    admin,
    route(async (req, res) => {
      const status = req.body.status || req.body.order_status;
      if (!["processing", "shipped", "delivered"].includes(status))
        fail("Use the cancellation endpoint for cancellation.");
      const snap = await getOrder(req.params.identifier);
      if (!snap) fail("Order not found.", 404);
      await firebase().db.runTransaction(async (tx) => {
        const s = await tx.get(snap.ref),
          o = s.data();
        const sequence = ["pending", "processing", "shipped", "delivered"];
        if (sequence.indexOf(status) !== sequence.indexOf(o.order_status) + 1)
          fail("Invalid order status transition.");
        tx.update(s.ref, {
          order_status: status,
          history: [
            ...o.history,
            {
              status,
              created_at: new Date().toISOString(),
              notes: "Order status updated by client services.",
            },
          ],
          ...(req.body.tracking_number
            ? { tracking_number: text(req.body.tracking_number, 100) }
            : {}),
        });
      });
      res.json({ success: true, message: "Order updated." });
    }),
  );
}
function publicOrder(order) {
  const { guest_session_hash, ...out } = order;
  return { ...out, timeline: out.history };
}
function authorizeOrder(req, order) {
  if (req.user?.role === "admin") return;
  if (order.user_id) {
    if (order.user_id !== req.user?.uid)
      fail("Unauthorized to view this order.", 403);
  } else if (
    !req.headers["x-session-token"] ||
    order.guest_session_hash !== hash(req.headers["x-session-token"])
  )
    fail("Use the shopping session that placed this order.", 403);
}
async function getOrder(identifier) {
  const db = firebase().db;
  if (/^[A-Z]{2}-/.test(identifier)) {
    const s = await db.collection("orders").doc(identifier).get();
    return s.exists ? s : null;
  }
  if (!/^\d+$/.test(identifier)) return null;
  const s = await db
    .collection("orders")
    .where("id", "==", Number(identifier))
    .limit(1)
    .get();
  return s.empty ? null : s.docs[0];
}
module.exports = { registerCommerce };
