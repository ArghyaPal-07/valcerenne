// Browser QA on an isolated store; no development data is modified.
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  assert = require("node:assert/strict");
process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "sqlite";
process.env.SQLITE_DB_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "valcerenne-browser-")),
  "test.sqlite",
);
const { chromium } = require("playwright");
const app = require("../server/server");
(async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || "msedge",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  let checks = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  const check = (value, label) => {
    assert.ok(value, label);
    checks++;
    console.log("[PASS]", label);
  };
  fs.mkdirSync("artifacts", { recursive: true });
  try {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const url of [
        "/",
        "/shop.html",
        "/product.html?id=merino-wool-crewneck-sweater",
        "/about.html",
        "/contact.html",
        "/policies.html",
        "/login.html",
        "/register.html",
        "/cart.html",
        "/wishlist.html",
        "/orders.html",
        "/account.html",
        "/addresses.html",
        "/order-success.html",
        "/404.html",
      ]) {
        await page.goto(base + url, { waitUntil: "networkidle" });
        check(
          !(await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          )),
          `${width}px layout: ${url}`,
        );
        check(
          (await page.locator(".site-header").count()) === 1 &&
            (await page.locator(".site-footer").count()) === 1,
          `${width}px shared branding: ${url}`,
        );
        if (url === "/") {
          await page.locator("footer").scrollIntoViewIfNeeded();
          await page.waitForTimeout(350);
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({
            path: `artifacts/home-${width === 390 ? "mobile" : "desktop"}.png`,
            fullPage: true,
          });
        }
      }
    }
    await page.goto(base + "/");
    await page.locator("#mobile-menu-toggle").click();
    check(
      (await page
        .locator("#mobile-menu-toggle")
        .getAttribute("aria-expanded")) === "true",
      "Mobile navigation opens",
    );
    await page.keyboard.press("Escape");
    check(
      (await page
        .locator("#mobile-menu-toggle")
        .getAttribute("aria-expanded")) === "false",
      "Escape closes mobile navigation",
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + "/shop.html", { waitUntil: "networkidle" });
    await page.locator("#search-toggle").click();
    await page.locator("#shop-search-input").fill("Merino");
    await page.waitForTimeout(700);
    check(
      (await page.locator("#shop-products-grid .product-card").count()) === 1,
      "Catalogue search filters products",
    );
    await page.locator("#shop-search-input").fill("");
    await page.waitForTimeout(650);
    await page
      .locator(".category-pill")
      .filter({ hasText: "Women's Fashion" })
      .click();
    await page.waitForTimeout(400);
    check(
      (
        await page
          .locator("#shop-products-grid .product-category")
          .allTextContents()
      ).every((t) => t.includes("Women")),
      "Category filtering",
    );
    await page.locator("#shop-sort-select").selectOption("price_asc");
    await page.waitForTimeout(400);
    const prices = await page
      .locator("#shop-products-grid .product-price")
      .allTextContents();
    const numbers = prices.map((t) => Number(t.replace(/[^0-9.]/g, "")));
    check(
      numbers.every((v, i) => i === 0 || v >= numbers[i - 1]),
      "Price sorting",
    );
    await page.screenshot({
      path: "artifacts/shop-desktop.png",
      fullPage: true,
    });
    await page.goto(base + "/product.html?id=merino-wool-crewneck-sweater", {
      waitUntil: "networkidle",
    });
    await page.getByRole("button", { name: "Navy Blue", exact: true }).click();
    check(
      await page.locator("#add-to-cart-btn").isDisabled(),
      "Unavailable colour/size combination disables purchase",
    );
    await page.getByRole("button", { name: "Medium", exact: true }).click();
    check(
      await page.locator("#add-to-cart-btn").isEnabled(),
      "Available variant enables purchase",
    );
    await page.screenshot({
      path: "artifacts/product-desktop.png",
      fullPage: true,
    });
    await page.locator("#add-to-cart-btn").click();
    await page.waitForTimeout(400);
    await page.locator(".open-cart-drawer").click();
    check(
      await page
        .locator("#cart-drawer-overlay")
        .evaluate((e) => e.classList.contains("active")),
      "Shopping bag drawer opens",
    );
    await page.keyboard.press("Escape");
    check(
      !(await page
        .locator("#cart-drawer-overlay")
        .evaluate((e) => e.classList.contains("active"))),
      "Escape closes bag drawer",
    );
    await page.goto(base + "/cart.html", { waitUntil: "networkidle" });
    check(
      (await page.locator("#cart-items-tbody tr").count()) === 1,
      "Added variant persists in cart",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "artifacts/cart-mobile.png",
      fullPage: true,
    });
    check(
      !(await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )),
      "Populated mobile cart fits viewport",
    );
    await page.goto(base + "/checkout.html", { waitUntil: "networkidle" });
    check(
      (await page.locator('[data-method="cod"]').count()) === 1 &&
        (await page.locator("#credit-card-form").count()) === 0,
      "Checkout collects no unconfigured card details",
    );
    check(
      !(await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )),
      "Populated mobile checkout fits viewport",
    );
    for (const [id, value] of Object.entries({
      "cust-email": "browser@example.com",
      "ship-name": "Browser Test",
      "ship-phone": "9999999999",
      "ship-addr1": "1 Test Road",
      "ship-city": "Kolkata",
      "ship-state": "West Bengal",
      "ship-zip": "700001",
    }))
      await page.locator("#" + id).fill(value);
    await page.locator("#place-order-btn").click();
    await page.waitForURL(/order-success/);
    await page.waitForTimeout(500);
    check(
      (await page.locator(".order-success-card h1").textContent()).includes(
        "received",
      ),
      "Checkout shows server-backed order confirmation",
    );
    check(
      (await page.locator(".order-receipt-box .badge").textContent()).includes(
        "pending",
      ),
      "Confirmation accurately reports pending payment",
    );
    await page.goto(base + "/order-success.html?order=FAKE", {
      waitUntil: "networkidle",
    });
    check(
      (await page.locator(".order-success-card h1").textContent()).includes(
        "not confirmed",
      ),
      "Invalid order URL cannot fabricate success",
    );
    await page.goto(base + "/login.html", { waitUntil: "networkidle" });
    await page.locator("#login-email").fill("customer@example.com");
    await page.locator("#login-password").fill("Password123!");
    await page.locator("#login-form button[type=submit]").click();
    await page.waitForURL(/account.html/);
    await page.waitForTimeout(400);
    check(
      (await page.locator(".user-menu-wrapper").count()) === 1,
      "Customer login restores account navigation",
    );
    await page.goto(base + "/product.html?id=merino-wool-crewneck-sweater", {
      waitUntil: "networkidle",
    });
    await page.locator("#product-wishlist-btn").click();
    await page.waitForTimeout(400);
    check(
      (await page.locator("#product-wishlist-btn").textContent()).includes(
        "Saved",
      ),
      "Authenticated wishlist save",
    );
    await page.locator("#product-wishlist-btn").click();
    await page.waitForTimeout(400);
    check(
      !(await page.locator("#product-wishlist-btn").textContent()).includes(
        "Saved",
      ),
      "Authenticated wishlist removal",
    );
    await page.goto(base + "/");
    await page
      .getByRole("button", { name: "New arrivals", exact: true })
      .click();
    check(
      (await page
        .locator("[data-selection=new]")
        .getAttribute("aria-pressed")) === "true" &&
        (await page.locator("#featured-products-grid .product-card").count()) >
          0,
      "Homepage new arrivals uses catalogue records",
    );
    await page.goto(base + "/register.html");
    await page.locator("#reg-name").fill("New Browser Customer");
    await page.locator("#reg-email").fill(`browser-${Date.now()}@example.com`);
    await page.locator("#reg-password").fill("TestPassword123!");
    await page.locator("#reg-confirm-password").fill("TestPassword123!");
    await page.locator("#register-form button[type=submit]").click();
    await page.waitForURL(/account.html/);
    check(
      (await page.locator(".user-menu-wrapper").count()) === 1,
      "Customer registration signs into account",
    );
    check(errors.length === 0, "No JavaScript page errors");
    fs.writeFileSync(
      "artifacts/browser-results.json",
      JSON.stringify(
        { checks, errors, date: new Date().toISOString() },
        null,
        2,
      ),
    );
    console.log(`${checks} browser checks passed.`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
