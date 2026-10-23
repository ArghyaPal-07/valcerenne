const { firebase } = require("./config");
const {
  route,
  required,
  fail,
  data,
  text,
  positive,
  profile,
  hash,
  numberId,
} = require("./helpers");
function addressFields(body) {
  const keys = [
    "full_name",
    "phone",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "postal_code",
    "country",
  ];
  const out = Object.fromEntries(keys.map((k) => [k, text(body[k], 200)]));
  for (const k of keys.filter((k) => k !== "address_line2"))
    if (!out[k]) fail("Complete all required address fields.");
  return {
    ...out,
    is_default_shipping: body.is_default_shipping ? 1 : 0,
    is_default_billing: body.is_default_billing ? 1 : 0,
  };
}
function registerCustomers(router) {
  router.get(
    "/auth/me",
    required,
    route(async (req, res) =>
      res.json({ success: true, user: await profile(req.user) }),
    ),
  );
  router.post(
    "/auth/sync",
    required,
    route(async (req, res) => {
      const current = await profile(req.user),
        full_name = text(req.body.full_name, 100),
        phone = text(req.body.phone, 40);
      const user = {
        ...current,
        ...(full_name ? { full_name } : {}),
        ...(phone ? { phone } : {}),
      };
      await firebase()
        .db.collection("users")
        .doc(req.user.uid)
        .set(user, { merge: true });
      res.json({ success: true, user });
    }),
  );
  for (const endpoint of [
    "/auth/login",
    "/auth/register",
    "/users/change-password",
  ])
    router.post(
      endpoint,
      route(async () =>
        fail(
          "Use Firebase Authentication in the browser for this action.",
          400,
        ),
      ),
    );
  router.put(
    "/users/change-password",
    required,
    route(async () =>
      fail("Use Firebase reauthentication and password update in the browser."),
    ),
  );
  router.put(
    "/users/profile",
    required,
    route(async (req, res) => {
      const full_name = text(req.body.full_name, 100),
        phone = text(req.body.phone, 40);
      if (!full_name) fail("Full name is required.");
      await firebase()
        .db.collection("users")
        .doc(req.user.uid)
        .set(
          { full_name, phone, updated_at: new Date().toISOString() },
          { merge: true },
        );
      res.json({
        success: true,
        message: "Profile updated.",
        user: await profile(req.user),
      });
    }),
  );
  router.get(
    "/users/addresses",
    required,
    route(async (req, res) =>
      res.json({
        success: true,
        data: (
          await firebase()
            .db.collection("users")
            .doc(req.user.uid)
            .collection("addresses")
            .get()
        ).docs
          .map((d) => d.data())
          .sort((a, b) => b.is_default_shipping - a.is_default_shipping),
      }),
    ),
  );
  async function saveAddress(req, res, editing) {
    const fields = addressFields(req.body),
      col = firebase()
        .db.collection("users")
        .doc(req.user.uid)
        .collection("addresses"),
      id = editing ? positive(req.params.id) : numberId(),
      ref = col.doc(String(id));
    await firebase().db.runTransaction(async (tx) => {
      const old = editing ? await tx.get(ref) : null;
      if (editing && !old.exists) fail("Address not found.", 404);
      const all = await tx.get(col);
      if (all.size >= 30 && !editing) fail("Address limit reached.");
      all.docs.forEach((d) => {
        if (d.id !== String(id)) {
          const updates = {};
          if (fields.is_default_shipping) updates.is_default_shipping = 0;
          if (fields.is_default_billing) updates.is_default_billing = 0;
          if (Object.keys(updates).length) tx.update(d.ref, updates);
        }
      });
      tx.set(ref, { id, user_id: req.user.uid, ...fields });
    });
    res
      .status(editing ? 200 : 201)
      .json({
        success: true,
        message: "Address saved.",
        data: { id, ...fields },
      });
  }
  router.post(
    "/users/addresses",
    required,
    route((req, res) => saveAddress(req, res, false)),
  );
  router.put(
    "/users/addresses/:id",
    required,
    route((req, res) => saveAddress(req, res, true)),
  );
  router.delete(
    "/users/addresses/:id",
    required,
    route(async (req, res) => {
      await firebase()
        .db.collection("users")
        .doc(req.user.uid)
        .collection("addresses")
        .doc(String(positive(req.params.id)))
        .delete();
      res.json({ success: true, message: "Address removed." });
    }),
  );
  const wishlist = (req) =>
    firebase().db.collection("users").doc(req.user.uid).collection("wishlist");
  router.get(
    "/wishlist",
    required,
    route(async (req, res) => {
      const saved = await wishlist(req).get();
      const products = saved.empty
        ? []
        : await firebase().db.getAll(
            ...saved.docs.map((d) =>
              firebase()
                .db.collection("products")
                .doc(String(d.data().product_id)),
            ),
          );
      res.json({
        success: true,
        data: products
          .filter((d) => d.exists)
          .map((d) => require("./catalog").cleanProduct(d.data())),
      });
    }),
  );
  for (const path of ["/wishlist", "/wishlist/add"])
    router.post(
      path,
      required,
      route(async (req, res) => {
        const id = positive(req.body.product_id || req.body.productId),
          p = await firebase().db.collection("products").doc(String(id)).get();
        if (!p.exists) fail("Product not found.", 404);
        await wishlist(req)
          .doc(String(id))
          .set({ product_id: id, created_at: new Date().toISOString() });
        res.status(201).json({ success: true, message: "Saved to wishlist." });
      }),
    );
  router.get(
    "/wishlist/check/:id",
    route(async (req, res) => {
      const saved = req.user
        ? (
            await wishlist(req)
              .doc(String(positive(req.params.id)))
              .get()
          ).exists
        : false;
      res.json({
        success: true,
        data: { inWishlist: saved, isInWishlist: saved },
      });
    }),
  );
  router.delete(
    "/wishlist/:id",
    required,
    route(async (req, res) => {
      await wishlist(req)
        .doc(String(positive(req.params.id)))
        .delete();
      res.json({ success: true, message: "Removed from wishlist." });
    }),
  );
  router.post(
    "/contact",
    route(async (req, res) => {
      const name = text(req.body.name, 100),
        email = text(req.body.email, 254).toLowerCase(),
        subject = text(req.body.subject, 150),
        message = text(req.body.message, 5000);
      if (!name || !email.includes("@") || !subject || !message)
        fail("Complete the contact form.");
      await firebase()
        .db.collection("contact_messages")
        .add({
          name,
          email,
          subject,
          message,
          status: "unread",
          created_at: new Date().toISOString(),
        });
      res
        .status(201)
        .json({ success: true, message: "Your enquiry has been saved." });
    }),
  );
  router.post(
    "/newsletter",
    route(async (req, res) => {
      const email = text(req.body.email, 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        fail("Enter a valid email address.");
      await firebase()
        .db.collection("newsletter_subscribers")
        .doc(hash(email))
        .set(
          { email, status: "active", created_at: new Date().toISOString() },
          { merge: true },
        );
      res
        .status(201)
        .json({
          success: true,
          message: "Your newsletter preference has been saved.",
        });
    }),
  );
}
module.exports = { registerCustomers, addressFields };
