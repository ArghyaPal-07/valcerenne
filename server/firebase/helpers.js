const crypto = require("crypto");
const { firebase } = require("./config");
function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}
function numberId() {
  return Date.now() * 1000 + crypto.randomInt(1000);
}
function data(snapshot) {
  return snapshot.exists ? { ...snapshot.data() } : null;
}
function route(fn) {
  return (req, res, next) =>
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
}
function text(value, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function positive(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1)
    fail("A positive integer is required.");
  return n;
}
async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) {
    req.user = null;
    return next();
  }
  if (!header.startsWith("Bearer "))
    return res
      .status(401)
      .json({ success: false, message: "Invalid authentication header." });
  try {
    const token = await firebase().auth.verifyIdToken(header.slice(7), true);
    req.user = {
      ...token,
      id: token.uid,
      role: token.admin === true ? "admin" : "customer",
    };
    next();
  } catch (error) {
    if (error.status === 503) return next(error);
    if(error.code === "app/invalid-credential" || /default credentials|credential implementation/i.test(error.message||"")) return res.status(503).json({success:false,message:"Firebase server credentials are not configured. Follow docs/FIREBASE.md."});
    return res
      .status(401)
      .json({
        success: false,
        message:
          "Your Firebase session is invalid or expired. Please sign in again.",
      });
  }
}
function required(req, res, next) {
  return req.user
    ? next()
    : res.status(401).json({ success: false, message: "Please sign in." });
}
function admin(req, res, next) {
  return req.user?.role === "admin"
    ? next()
    : res
        .status(403)
        .json({ success: false, message: "Administrator access required." });
}
async function profile(user) {
  const ref = firebase().db.collection("users").doc(user.uid);
  const existing = await ref.get();
  const stored = data(existing) || {};
  const result = {
    id: user.uid,
    full_name:
      stored.full_name || user.name || user.email?.split("@")[0] || "Customer",
    email: user.email || "",
    phone: stored.phone || null,
    avatar_url: stored.avatar_url || user.picture || null,
    role: user.admin === true ? "admin" : "customer",
  };
  if (!existing.exists)
    await ref
      .create({ ...result, created_at: new Date().toISOString() })
      .catch((e) => {
        if (e.code !== 6) throw e;
      });
  return result;
}
function cartRef(req, guestToken) {
  const token = guestToken || req.headers["x-session-token"];
  if (!req.user && !token) fail("A shopping session is required.");
  if (token && !/^[a-zA-Z0-9_-]{10,200}$/.test(token))
    fail("Invalid shopping session.");
  return firebase()
    .db.collection("carts")
    .doc(
      guestToken
        ? "g_" + hash(guestToken)
        : req.user
          ? "u_" + req.user.uid
          : "g_" + hash(token),
    );
}
function summary(cart) {
  const items = cart?.items || [];
  return {
    items,
    subtotal:
      Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) /
      100,
    totalItems: items.reduce((s, i) => s + i.quantity, 0),
  };
}
function lineFor(product, variantId, quantity) {
  let variant = null;
  if (product.variants?.length) {
    if (!variantId) fail("Please choose a product variant.");
    variant = product.variants.find((v) => String(v.id) === String(variantId));
    if (!variant) fail("Invalid product variant.");
  } else if (variantId) fail("Invalid product variant.");
  const available = variant
    ? Math.min(product.stock_qty, variant.stock_qty)
    : product.stock_qty;
  if (quantity > available)
    fail("The selected quantity is no longer available.");
  const price = Number(variant?.price_override ?? product.price);
  return {
    item_id: product.id * 100000 + Number(variant?.id || 0),
    product_id: product.id,
    variant_id: variant?.id || null,
    quantity,
    price,
    subtotal: Math.round(price * quantity * 100) / 100,
    product_title: product.title,
    product_slug: product.slug,
    image_url:
      product.primary_image ||
      product.images?.[0]?.image_url ||
      "/assets/image-unavailable.svg",
    variant_color: variant?.color || null,
    variant_size: variant?.size || null,
    product_stock: product.stock_qty,
    variant_stock: variant?.stock_qty ?? null,
  };
}
function discount(coupon, subtotal) {
  if (!coupon) return { discount: 0, freeShipping: false };
  const today = new Date().toISOString().slice(0, 10);
  if (
    !coupon.is_active ||
    (coupon.start_date && String(coupon.start_date).slice(0, 10) > today) ||
    (coupon.end_date && String(coupon.end_date).slice(0, 10) < today) ||
    (coupon.usage_limit && coupon.times_used >= coupon.usage_limit) ||
    subtotal < Number(coupon.min_order_amount || 0)
  )
    fail("This coupon is not valid for your order.");
  const freeShipping = coupon.code.toUpperCase() === "FREESHIP";
  let amount = freeShipping
    ? 0
    : coupon.discount_type === "percentage"
      ? (subtotal * Number(coupon.discount_value)) / 100
      : Math.min(subtotal, Number(coupon.discount_value));
  if (coupon.max_discount)
    amount = Math.min(amount, Number(coupon.max_discount));
  return { discount: Math.round(amount * 100) / 100, freeShipping };
}
module.exports = {
  fail,
  hash,
  numberId,
  data,
  route,
  text,
  positive,
  auth,
  required,
  admin,
  profile,
  cartRef,
  summary,
  lineFor,
  discount,
};
