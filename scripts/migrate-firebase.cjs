// Read-only source export. No records or SQL files are modified.
const fs = require("fs"),
  path = require("path");
function loadSnapshot(filename) {
  const { DatabaseSync } = require("node:sqlite");
  if (!fs.existsSync(filename))
    throw new Error(
      "Source database not found. Set LEGACY_SQLITE_PATH to your existing SQLite file.",
    );
  const db = new DatabaseSync(filename, { readOnly: true });
  const all = (table) =>
    db
      .prepare("SELECT * FROM " + table)
      .all()
      .map((row) => ({ ...row }));
  const tables = {};
  for (const table of [
    "products",
    "categories",
    "product_images",
    "product_variants",
    "coupons",
    "users",
    "reviews",
    "addresses",
    "wishlists",
    "carts",
    "cart_items",
    "orders",
    "order_items",
    "order_history",
    "contact_messages",
    "newsletter_subscribers",
  ])
    tables[table] = all(table);
  db.close();
  return tables;
}
function catalogue(snapshot) {
  return snapshot.products.map((p) => {
    const cat = snapshot.categories.find((c) => c.id === p.category_id);
    const { cost_price, ...product } = p;
    const images = snapshot.product_images
      .filter((i) => i.product_id === p.id)
      .sort(
        (a, b) => b.is_primary - a.is_primary || a.sort_order - b.sort_order,
      );
    return {
      ...product,
      category_name: cat?.name || "",
      category_slug: cat?.slug || "",
      images,
      variants: snapshot.product_variants.filter((v) => v.product_id === p.id),
      primary_image: images[0]?.image_url || "/assets/image-unavailable.svg",
    };
  });
}
async function migrate(
  snapshot,
  { project, write = false, customers = false } = {},
) {
  const { firebase } = require("../server/firebase/config");
  const { hash } = require("../server/firebase/helpers");
  console.log(
    JSON.stringify(
      {
        project:
          project || process.env.FIREBASE_PROJECT_ID || "(not configured)",
        mode: write
          ? "CREATE MISSING DOCUMENTS"
          : "DRY RUN — no Firebase writes",
        products: snapshot.products.length,
        categories: snapshot.categories.length,
        reviews: snapshot.reviews.length,
        customerAccounts: customers ? snapshot.users.length : 0,
        orders: customers ? snapshot.orders.length : 0,
      },
      null,
      2,
    ),
  );
  if (!write) return;
  if (!project || project !== process.env.FIREBASE_PROJECT_ID)
    throw new Error("Write requires --project matching FIREBASE_PROJECT_ID.");
  const { db, auth } = firebase();
  let created = 0,
    skipped = 0;
  const create = async (collection, id, value) => {
    try {
      await db.collection(collection).doc(String(id)).create(value);
      created++;
    } catch (error) {
      if (error.code === 6) skipped++;
      else throw error;
    }
  };
  for (const c of snapshot.categories) await create("categories", c.id, c);
  for (const p of catalogue(snapshot)) await create("products", p.id, p);
  for (const c of snapshot.coupons)
    await create("coupons", c.code.toUpperCase(), c);
  const uidMap = new Map(snapshot.users.map((u) => [u.id, "legacy_" + u.id]));
  if (customers) {
    for (const u of snapshot.users) {
      let existing;
      try {
        existing = await auth.getUserByEmail(u.email);
      } catch (e) {
        if (e.code !== "auth/user-not-found") throw e;
      }
      if (existing) uidMap.set(u.id, existing.uid);
      else {
        const result = await auth.importUsers(
          [
            {
              uid: "legacy_" + u.id,
              email: u.email,
              displayName: u.full_name,
              passwordHash: Buffer.from(u.password_hash),
            },
          ],
          { hash: { algorithm: "BCRYPT" } },
        );
        if (result.failureCount) throw result.errors[0].error;
      }
      const uid = uidMap.get(u.id);
      await create("users", uid, {
        id: uid,
        full_name: u.full_name,
        email: u.email,
        phone: u.phone,
        avatar_url: u.avatar_url,
        role: "customer",
        legacy_id: u.id,
        created_at: u.created_at,
      });
      // Do not grant administrator claims automatically, especially to seeded demo accounts.
    }
  }
  for (const r of snapshot.reviews) {
    const u = snapshot.users.find((u) => u.id === r.user_id);
    await create("reviews", r.id, {
      ...r,
      user_id: uidMap.get(r.user_id) || null,
      user_name: u?.full_name || "Customer",
      user_avatar: u?.avatar_url || null,
    });
    if (uidMap.get(r.user_id))
      await create(
        "review_claims",
        uidMap.get(r.user_id) + "_" + r.product_id,
        { review_id: r.id },
      );
  }
  if (customers) {
    for (const a of snapshot.addresses) {
      const uid = uidMap.get(a.user_id);
      if (uid)
        await create("users/" + uid + "/addresses", a.id, {
          ...a,
          user_id: uid,
        });
    }
    for (const w of snapshot.wishlists) {
      const uid = uidMap.get(w.user_id);
      if (uid)
        await create("users/" + uid + "/wishlist", w.product_id, {
          product_id: w.product_id,
          created_at: w.created_at || new Date().toISOString(),
        });
    }
    const products = catalogue(snapshot);
    for (const cart of snapshot.carts) {
      const uid = uidMap.get(cart.user_id),
        id = uid
          ? "u_" + uid
          : cart.session_token
            ? "g_" + hash(cart.session_token)
            : null;
      if (!id) continue;
      const items = snapshot.cart_items
        .filter((i) => i.cart_id === cart.id)
        .map((i) => {
          const p = products.find((p) => p.id === i.product_id);
          if (!p)
            throw new Error("A legacy cart references a missing product.");
          const v = p.variants.find((v) => v.id === i.variant_id);
          return {
            item_id: p.id * 100000 + Number(i.variant_id || 0),
            product_id: p.id,
            variant_id: i.variant_id || null,
            quantity: i.quantity,
            price: i.price,
            subtotal: Number((i.price * i.quantity).toFixed(2)),
            product_title: p.title,
            product_slug: p.slug,
            image_url: p.primary_image,
            variant_color: v?.color || null,
            variant_size: v?.size || null,
            product_stock: p.stock_qty,
            variant_stock: v?.stock_qty ?? null,
          };
        });
      await create("carts", id, { user_id: uid || null, items });
    }
    for (const o of snapshot.orders) {
      let metadata;
      try {
        metadata = JSON.parse(o.notes || "{}");
      } catch {}
      const parse = (value) =>
        typeof value === "string" ? JSON.parse(value) : value;
      const items = snapshot.order_items
        .filter((i) => i.order_id === o.id)
        .map((i) => {
          const p = products.find((p) => p.id === i.product_id);
          return {
            ...i,
            product_slug: p?.slug || "",
            product_image: p?.primary_image || "/assets/image-unavailable.svg",
          };
        });
      await create("orders", o.order_number, {
        ...o,
        user_id: uidMap.get(o.user_id) || null,
        guest_session_hash: metadata?.guestSessionHash || null,
        notes: metadata?.guestSessionHash ? (metadata.customerNotes || null) : (o.notes || null),
        shipping_address: parse(o.shipping_address),
        billing_address: parse(o.billing_address),
        items,
        history: snapshot.order_history.filter((h) => h.order_id === o.id),
        total_items: items.reduce((sum, i) => sum + i.quantity, 0),
      });
    }
    for (const m of snapshot.contact_messages)
      await create("contact_messages", "legacy_" + m.id, m);
    for (const n of snapshot.newsletter_subscribers)
      await create("newsletter_subscribers", hash(n.email.toLowerCase()), n);
  }
  console.log(
    `Migration complete: ${created} documents created; ${skipped} existing documents left unchanged. Original SQL data preserved.`,
  );
}
if (require.main === module) {
  require("dotenv").config();
  const args = process.argv.slice(2),
    option = (name) =>
      args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const source =
    option("--source") ||
    process.env.LEGACY_SQLITE_PATH ||
    path.join(__dirname, "../database/ecommerce.sqlite");
  migrate(loadSnapshot(source), {
    project: option("--project"),
    write: args.includes("--write"),
    customers: args.includes("--include-customers"),
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { loadSnapshot, catalogue, migrate };
