> Firebase update: the app now defaults to hosted Cloud Firestore and Firebase Authentication. See [FIREBASE.md](FIREBASE.md) for current setup. The SQL architecture/results below are historical.

# Architecture and implementation

## Initial inspection

The repository contains a multi-page HTML frontend in public/, custom stylesheets and vanilla global JavaScript controllers. Express 4 serves static pages and modular REST routes. Runtime packages are bcryptjs, cors, dotenv, express, jsonwebtoken, morgan, mysql2, and sql.js. Node 22 native SQLite is preferred locally, with the existing sql.js fallback and MySQL adapter retained.

Routes cover authentication, users/addresses, categories, products/galleries/variants, carts and guest migration, wishlists, reviews, coupons, contact messages, newsletter preferences, and orders/history. The database includes catalogue, customer and commerce tables. API_BASE remains /api. Original product IDs, slugs, INR prices and client session-storage key names are retained.

Deployment configuration existed for Render and Vercel. The previous Render build seeded a local SQLite file on an ephemeral filesystem. MySQL startup replayed demo inserts and did not consistently respect the configured database. These have been corrected without executing any production migration.

Design limitations: a sneaker-first identity despite seven existing categories, gradients, emoji controls, promotional pills, a rolling artificial countdown, and duplicated page chrome. Some pages contained invented commercial metrics and guarantees. Checkout exposed mock card inputs, recorded every order as paid without a gateway and showed receipt success from URL/session data. Variant selection could silently fall back to the first record. These findings set the implementation order: shared identity, editorial homepage, global design system, shopping integrity and verification.

## Implemented behaviour

- Original generated logo and architectural-V companion vector set; local campaign photograph; new browser metadata, favicon and app icon.
- Editorial homepage with cinematic campaign, philosophy strip, collection stories, API-backed selected pieces, wardrobe feature, brand story, database-backed newsletter signup and service links.
- Consistent header, desktop/mobile navigation, search, account, wishlist and shopping-bag entry points throughout all pages.
- Existing catalogue search, category/price filtering, sorting, pagination and list/grid controls retained; refined product grids, linked imagery and detail-first discovery for variant selection.
- Large product gallery retained; invalid variant combinations disable purchase, stock and variant pricing update, buy-now redirects only after successful cart addition.
- Cart quantity/removal ownership and positive/integer stock validation; responsive populated cart and checkout.
- Honest COD checkout: current product prices, coupon validity, stock checks and order creation occur inside a transaction; rollback preserves the bag and inventory after a failure; duplicate SQLite checkouts serialize.
- Pending payment and no fabricated tracking; receipt requires a successful backend retrieval. Guest order details require the originating session. Customer order access and account flows preserved.
- Policy/help pages describe actual capabilities. Old hype/countdown, invented performance metrics, mock card fields and unsupported authentication/returns/security claims removed from redesigned surfaces.
- Keyboard focus styles, skip links, labelled forms, mobile expanded state, Escape controls, drawer focus management and reduced-motion support.
- Production JWT-secret validation, MySQL startup without demo inserts, safe configured-database initialization and durable-database Render setup.

## File manifest

All existing public HTML pages were updated for shared identity, navigation, footer, fonts, icon, metadata and form labels: 404, about, account, addresses, cart, checkout, contact, index, login, order-success, orders, product, register, shop, wishlist. `policies.html` is new.

New visual assets: `public/assets/campaign.jpg`; `public/assets/image-unavailable.svg`; `public/assets/brand/{logo-generated.png,logo-primary.png,logo-light.svg,logo-dark.svg,logo-monochrome.svg,monogram.svg,favicon.svg,app-icon.png}`.

CSS: `public/css/luxury.css` is the responsive design-system layer; `public/css/style.css` removes the old font import. Other existing stylesheets remain for structural compatibility.

Frontend JavaScript: home.js rebuilds API-backed editorial rendering; main.js adds shared controls and keyboard handling; shop.js refines discovery; product.js validates combinations and purchase outcomes; cart.js and checkout.js align shipping/coupon/payment behaviour; auth.js and wishlist.js update language; other controllers retain their APIs with minor branding/fallback cleanup.

Backend: `server/controllers/{cartController,orderController,couponController,contactController}.js`, `server/config/db.js`, `server/middleware/auth.js`, `server/server.js`, `database/init-db.js`. No product seed records or schema tables were changed.

Verification: `server/test-api.js` now isolates its database and expects valid variants/COD; `server/test-commerce.js` adds transaction and ownership regressions; `scripts/test-browser.cjs` exercises browser flows; `scripts/check-syntax.cjs` checks all JavaScript files. Screenshots and results are in artifacts/.

Configuration and documentation: package.json, package-lock.json, .env.example, render.yaml, README.md, docs/BRAND.md, docs/INTEGRATIONS.md, docs/IMPLEMENTATION.md, docs/TESTING.md. Vercel rewrites are retained.

Only added dependency: **playwright**, development-only, to run browser verification. No frontend framework, runtime payment SDK or new runtime package was introduced.
