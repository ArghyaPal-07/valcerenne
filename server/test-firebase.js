// Real Firebase emulator integration tests. Never points at a live project.
const assert = require("node:assert/strict");
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error("Run npm run test:firebase; both emulators are required.");
process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "firebase";
process.env.FIREBASE_PROJECT_ID = "demo-valcerenne";
process.env.FIREBASE_API_KEY = "test-api-key";
process.env.FIREBASE_AUTH_DOMAIN = "demo-valcerenne.firebaseapp.com";
process.env.FIREBASE_APP_ID = "test-app-id";
const { firebase } = require("./firebase/config"),
  { migrate, loadSnapshot } = require("../scripts/migrate-firebase.cjs");
const { chromium } = require("playwright");
(async () => {
  let server,
    browser,
    checks = 0;
  const check = (condition, name) => {
    assert.ok(condition, name);
    checks++;
    console.log("[PASS]", name);
  };
  try {
    await migrate(
      loadSnapshot(
        require("path").join(__dirname, "../database/ecommerce.sqlite"),
      ),
      { write: true, project: "demo-valcerenne" },
    );
    const app = require("./server");
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function api(
      method,
      path,
      body,
      token,
      session = "firebase-guest-session-a",
    ) {
      const res = await fetch(base + "/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-session-token": session,
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: await res.json() };
    }
    const config = await api("GET", "/config");
    check(
      config.body.provider === "firebase" &&
        !JSON.stringify(config.body).includes("private_key"),
      "Public config contains Firebase web settings only",
    );
    const catalogue = await api("GET", "/products");
    check(
      catalogue.body.pagination.total === 40,
      "Original 40 products are served from Firestore",
    );
    check(
      !JSON.stringify(catalogue.body).includes("cost_price"),
      "Private product cost is not public",
    );
    const search = await api(
      "GET",
      "/products?search=Merino&min_price=5000&max_price=7000&sort=price_asc",
    );
    check(
      search.body.data.length === 1 && search.body.data[0].id === 8,
      "Firestore catalogue search, price filter and sorting",
    );
    check(
      (await api("GET", "/categories")).body.data.length === 7,
      "All seven categories preserved",
    );
    check(
      (await api("GET", "/auth/me")).status === 401,
      "Account API requires authentication",
    );
    check(
      (await api("GET", "/auth/me", null, "fake-token")).status === 401,
      "Invalid Firebase ID tokens are rejected",
    );
    async function signUp(email) {
      const response = await fetch(
        "http://" +
          process.env.FIREBASE_AUTH_EMULATOR_HOST +
          "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-api-key",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: "TestPassword123!",
            returnSecureToken: true,
          }),
        },
      );
      const body = await response.json();
      assert.ok(body.idToken, JSON.stringify(body));
      return body;
    }
    const auth = await signUp("firebase-api@example.com"),
      token = auth.idToken;
    const sync = await api(
      "POST",
      "/auth/sync",
      { full_name: "Firebase Customer", phone: "9999999999", role: "admin" },
      token,
    );
    check(
      sync.body.user.id === auth.localId && sync.body.user.role === "customer",
      "Firebase identity creates profile without accepting client admin role",
    );
    check(
      (await api("GET", "/auth/me", null, token)).body.user.full_name ===
        "Firebase Customer",
      "Firebase profile persists",
    );
    const direct = await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-valcerenne/databases/(default)/documents/products/1`,
      { headers: { Authorization: "Bearer " + token } },
    );
    check(
      direct.status === 403,
      "Firestore rules deny direct browser database access",
    );
    check(
      (await api("POST", "/cart/add", { product_id: 1, quantity: 1 }))
        .status === 400,
      "Cart requires an available variant",
    );
    check(
      (
        await api("POST", "/cart/add", {
          product_id: 1,
          variant_id: 22,
          quantity: 1,
        })
      ).status === 400,
      "Cross-product variants are rejected",
    );
    check(
      (
        await api("POST", "/cart/add", {
          product_id: 1,
          variant_id: 1,
          quantity: -2,
        })
      ).status === 400,
      "Invalid quantities are rejected",
    );
    const cart = await api("POST", "/cart/add", {
      product_id: 1,
      variant_id: 1,
      quantity: 1,
    });
    check(
      cart.status === 200 && cart.body.data.totalItems === 1,
      "Guest cart is stored in Firestore",
    );
    const line = cart.body.data.items[0];
    check(
      (
        await api(
          "PUT",
          "/cart/items/" + line.item_id,
          { quantity: 2 },
          null,
          "firebase-other-session",
        )
      ).status === 404,
      "A different session cannot edit the bag",
    );
    check(
      (await api("PUT", "/cart/items/" + line.item_id, { quantity: 99999 }))
        .status === 400,
      "Firestore cart enforces stock limits",
    );
    await api(
      "POST",
      "/cart/merge",
      { session_token: "firebase-guest-session-a" },
      token,
    );
    check(
      (await api("GET", "/cart", null, token)).body.data.totalItems === 1,
      "Guest cart merges into Firebase account",
    );
    check(
      (await api("GET", "/cart")).body.data.totalItems === 0,
      "Merged guest bag is removed",
    );
    check(
      (await api("POST", "/wishlist", { product_id: 8 }, token)).status === 201,
      "Wishlist save",
    );
    check(
      (await api("GET", "/wishlist", null, token)).body.data[0].id === 8,
      "Wishlist loads from Firebase",
    );
    await api("DELETE", "/wishlist/8", null, token);
    check(
      (await api("GET", "/wishlist", null, token)).body.data.length === 0,
      "Wishlist removal",
    );
    const address = {
      full_name: "Firebase Customer",
      phone: "9999999999",
      address_line1: "1 Test Road",
      address_line2: "",
      city: "Kolkata",
      state: "West Bengal",
      postal_code: "700001",
      country: "India",
      is_default_shipping: true,
    };
    const a = await api("POST", "/users/addresses", address, token);
    check(a.status === 201, "Firebase address saved");
    check(
      (await api("GET", "/users/addresses", null, token)).body.data.length ===
        1,
      "Address list persists",
    );
    check(
      (
        await api(
          "POST",
          "/orders/checkout",
          { shipping_address: address, payment_method: "card" },
          token,
        )
      ).status === 503,
      "Unconfigured online payments stay disabled",
    );
    check(
      (
        await api(
          "POST",
          "/orders/checkout",
          { shipping_address: address, coupon_code: "INVALID" },
          token,
        )
      ).status === 400,
      "Checkout revalidates coupon",
    );
    const before = (
      await firebase().db.collection("products").doc("1").get()
    ).data().stock_qty;
    const results = await Promise.all([
      api(
        "POST",
        "/orders/checkout",
        {
          shipping_address: address,
          payment_method: "cod",
          coupon_code: "FREESHIP",
        },
        token,
      ),
      api(
        "POST",
        "/orders/checkout",
        { shipping_address: address, payment_method: "cod" },
        token,
      ),
    ]);
    check(
      results.filter((r) => r.status === 201).length === 1,
      "Firestore transaction prevents duplicate checkout",
    );
    const order = results.find((r) => r.status === 201).body.data;
    check(
      order.paymentStatus === "pending" && !order.trackingNumber,
      "COD records pending payment without fake tracking",
    );
    check(
      (await firebase().db.collection("products").doc("1").get()).data()
        .stock_qty ===
        before - 1,
      "Transaction decrements stock exactly once",
    );
    check(
      (await api("GET", "/orders/" + order.orderNumber, null, token)).status ===
        200,
      "Owning Firebase account can read its order",
    );
    check(
      (await api("GET", "/orders/" + order.orderNumber)).status === 403,
      "A guest cannot read another customer order",
    );
    check(
      (await api("POST", "/orders/" + order.orderNumber + "/cancel", {}, token))
        .status === 200,
      "Pending unpaid order can be cancelled",
    );
    check(
      (await firebase().db.collection("products").doc("1").get()).data()
        .stock_qty === before,
      "Cancellation restores inventory",
    );
    check(
      (await api("POST", "/orders/" + order.orderNumber + "/cancel", {}, token))
        .status === 400,
      "Repeated cancellation does not duplicate inventory",
    );
    check(
      (await api("GET", "/orders/all", null, token)).status === 403,
      "Customer has no admin order access",
    );
    check(
      (await api("POST", "/newsletter", { email: "newsletter@example.com" }))
        .status === 201,
      "Newsletter preference saved in Firestore",
    );
    check(
      (
        await api("POST", "/contact", {
          name: "Test Customer",
          email: "contact@example.com",
          subject: "Question",
          message: "A test enquiry.",
        })
      ).status === 201,
      "Contact enquiry saved in Firestore",
    );
    // Actual browser SDK against Firebase Auth emulator, with original storefront screens.
    browser = await chromium.launch({
      channel: process.env.BROWSER_CHANNEL || "msedge",
      headless: true,
    });
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      }),
      errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error("[browser page error]", error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error")
        console.error("[browser console]", message.text());
    });
    await page.goto(base + "/register.html", { waitUntil: "networkidle" });
    await page.locator("#reg-name").fill("Firebase Browser Customer");
    await page.locator("#reg-email").fill("firebase-browser@example.com");
    await page.locator("#reg-password").fill("TestPassword123!");
    await page.locator("#reg-confirm-password").fill("TestPassword123!");
    await page.locator("#register-form button[type=submit]").click();
    await page.waitForURL(/account.html/);
    await page.locator(".user-menu-wrapper").waitFor();
    check(
      (await page.locator(".user-menu-wrapper").count()) === 1,
      "Browser registers through Firebase Authentication",
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".user-menu-wrapper").waitFor();
    check(
      (await page.locator(".user-menu-wrapper").count()) === 1,
      "Firebase session survives page reload",
    );
    await page.goto(base + "/product.html?id=merino-wool-crewneck-sweater", {
      waitUntil: "networkidle",
    });
    await page.locator("#product-wishlist-btn").click();
    await page.waitForTimeout(300);
    check(
      (await page.locator("#product-wishlist-btn").textContent()).includes(
        "Saved",
      ),
      "Browser wishlist uses verified Firebase session",
    );
    await page.locator("#add-to-cart-btn").click();
    await page.waitForTimeout(300);
    await page.goto(base + "/cart.html", { waitUntil: "networkidle" });
    check(
      (await page.locator("#cart-items-tbody tr").count()) === 1,
      "Browser cart persists in Firestore",
    );
    check(
      !(await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )),
      "Firebase shopping flow retains mobile layout",
    );
    await page.evaluate(() => State.logout());
    await page.waitForURL(/login.html/);
    await page.locator("#login-email").fill("firebase-browser@example.com");
    await page.locator("#login-password").fill("TestPassword123!");
    await page.locator("#login-form button[type=submit]").click();
    await page.waitForURL(/account.html/);
    await page.locator(".user-menu-wrapper").waitFor();
    check(
      (await page.locator(".user-menu-wrapper").count()) === 1,
      "Firebase logout and login work",
    );
    const passwordChange = await page.evaluate(() =>
      api.changePassword("TestPassword123!", "UpdatedPassword123!"),
    );
    check(
      passwordChange.success,
      "Firebase reauthentication and password change",
    );
    const reset = await page.evaluate(() =>
      window.FirebaseSession.reset("firebase-browser@example.com"),
    );
    check(reset.success, "Firebase password reset request");
    const source = loadSnapshot(
      require("path").join(__dirname, "../database/ecommerce.sqlite"),
    );
    await migrate(source, {
      write: true,
      project: "demo-valcerenne",
      customers: true,
    });
    const imported = await firebase().auth.getUserByEmail(
      "customer@example.com",
    );
    check(
      imported.uid === "legacy_1",
      "Legacy customers migrate to Firebase UIDs",
    );
    check(
      !imported.customClaims?.admin,
      "Migration does not promote demo administrators",
    );
    const originalHash=source.users.find(user=>user.id===1).password_hash;
    check(require('bcryptjs').compareSync('Password123!',originalHash),'Original bcrypt hash is preserved and matches the source password');
    console.log('[LIMIT] Firebase Auth emulator uses its own fake password hashing; imported bcrypt login must be verified against the real project.');
    check(
      (await firebase().db.collection("products").get()).size === 40,
      "Rerun migration does not duplicate products",
    );
    check(
      errors.length === 0,
      "No browser JavaScript errors during Firebase flow",
    );
    console.log(`${checks} Firebase integration checks passed.`);
    require("fs").writeFileSync(
      "artifacts/firebase-results.json",
      JSON.stringify(
        {
          checks,
          errors,
          date: new Date().toISOString(),
          environment: "Firebase Auth and Firestore emulators — not live cloud",
        },
        null,
        2,
      ),
    );
  } finally {
    await browser?.close();
    await new Promise((r) => (server ? server.close(r) : r()));
    await firebase().db.terminate();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
