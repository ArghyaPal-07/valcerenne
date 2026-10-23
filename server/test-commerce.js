// Commerce regression tests use an isolated, disposable SQLite database.
const fs = require("fs"),
  os = require("os"),
  path = require("path");
process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "sqlite";
process.env.SQLITE_DB_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "valcerenne-regression-")),
  "test.sqlite",
);
const assert = require("node:assert/strict");
const app = require("./server"),
  db = require("./config/db");
(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let count = 0;
  async function call(method, url, body, session = "guest-a") {
    const response = await fetch(base + "/api" + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-session-token": session,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  }
  function check(condition, name) {
    assert.ok(condition, name);
    count++;
    console.log("[PASS]", name);
  }
  const shipping_address = {
    full_name: "Regression Customer",
    phone: "9999999999",
    address_line1: "1 Test Road",
    city: "Kolkata",
    state: "West Bengal",
    postal_code: "700001",
    country: "India",
  };
  try {
    check(
      (await call("POST", "/cart/add", { product_id: 1, quantity: 1 }))
        .status === 400,
      "Variant selection is required",
    );
    check(
      (
        await call("POST", "/cart/add", {
          product_id: 1,
          variant_id: 22,
          quantity: 1,
        })
      ).status === 400,
      "A variant from another product is rejected",
    );
    check(
      (
        await call("POST", "/cart/add", {
          product_id: 1,
          variant_id: 1,
          quantity: -1,
        })
      ).status === 400,
      "Negative quantities are rejected",
    );
    check(
      (
        await call("POST", "/cart/add", {
          product_id: 1,
          variant_id: 1,
          quantity: 1.5,
        })
      ).status === 400,
      "Fractional quantities are rejected",
    );
    const added = await call("POST", "/cart/add", {
      product_id: 1,
      variant_id: 1,
      quantity: 1,
    });
    check(added.status === 200, "Valid variant can be added");
    const id = added.body.data.items[0].item_id;
    check(
      (await call("PUT", `/cart/items/${id}`, { quantity: 2 }, "guest-b"))
        .status === 404,
      "Cart quantity update requires ownership",
    );
    check(
      (await call("DELETE", `/cart/items/${id}`, null, "guest-b")).status ===
        404,
      "Cart removal requires ownership",
    );
    check(
      (await call("PUT", `/cart/items/${id}`, { quantity: 99999 })).status ===
        400,
      "Stock limits are enforced",
    );
    check(
      (
        await call("POST", "/orders/checkout", {
          shipping_address,
          payment_method: "card",
        })
      ).status === 503,
      "Unconfigured online payment cannot place a paid order",
    );
    check(
      (
        await call("POST", "/orders/checkout", {
          shipping_address: {},
          payment_method: "cod",
        })
      ).status === 400,
      "Incomplete delivery details are rejected",
    );
    check(
      (
        await call("POST", "/orders/checkout", {
          shipping_address,
          coupon_code: "INVALID",
          payment_method: "cod",
        })
      ).status === 400,
      "Checkout revalidates coupon",
    );
    const [[before]] = await db.query(
      "SELECT stock_qty FROM products WHERE id=1",
    );
    const query = db.query.bind(db);
    let injected = false;
    db.query = async (sql, params) => {
      if (!injected && sql.startsWith("INSERT INTO order_items")) {
        injected = true;
        throw Object.assign(new Error("Expected regression failure"), {
          status: 409,
        });
      }
      return query(sql, params);
    };
    const rollback = await call("POST", "/orders/checkout", {
      shipping_address,
      payment_method: "cod",
    });
    db.query = query;
    const [[after]] = await db.query(
      "SELECT stock_qty FROM products WHERE id=1",
    );
    const [[orders]] = await db.query("SELECT COUNT(*) AS count FROM orders");
    check(
      rollback.status === 409 &&
        before.stock_qty === after.stock_qty &&
        orders.count === 0,
      "A failed order rolls back stock and the order record",
    );
    check(
      (await call("GET", "/cart")).body.data.totalItems === 1,
      "Rollback retains the shopping bag",
    );
    const responses = await Promise.all([
      call("POST", "/orders/checkout", {
        shipping_address,
        payment_method: "cod",
        coupon_code: "FREESHIP",
      }),
      call("POST", "/orders/checkout", {
        shipping_address,
        payment_method: "cod",
      }),
    ]);
    check(
      responses.filter((r) => r.status === 201).length === 1,
      "Concurrent checkout cannot duplicate the same bag",
    );
    const order = responses.find((r) => r.status === 201).body.data;
    check(
      order.paymentStatus === "pending" &&
        order.orderStatus === "pending" &&
        order.trackingNumber === null,
      "COD stays unpaid and has no fabricated tracking",
    );
    check(
      order.shippingFee === 0 &&
        order.discountAmount === 0 &&
        order.totalAmount === Number((order.subtotal * 1.08).toFixed(2)),
      "Free shipping does not discount the product twice",
    );
    check(
      (await call("GET", "/orders/" + order.orderNumber)).status === 200,
      "Guest can retrieve confirmation from the originating session",
    );
    check(
      (await call("GET", "/orders/" + order.orderNumber, null, "guest-b"))
        .status === 403,
      "Another session cannot read the guest order",
    );
    check(
      (await call("GET", "/cart")).body.data.totalItems === 0,
      "A committed order empties the bag",
    );
    console.log(`\n${count} commerce regression checks passed.`);
  } finally {
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
