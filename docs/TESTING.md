Latest live verification: the running app uses Firebase; 40 products and 7 categories are served from Cloud Firestore. Unauthenticated account access returns 401 and direct Firestore access returns 403. The cloud-backed homepage renders without JavaScript page errors or overflow. The live catalogue migration completed with 65 create-only documents; customer/demo accounts were left in the original source backup.

## Firebase switch verification — 23 October 2026

- 49 Firebase integration checks passed against the Auth and Firestore emulators, including browser registration, session restoration, login/logout, password change/reset requests, wishlist, cart, transactional checkout/cancellation, ownership, migration and direct-client rules denial.
- Live `valcerinne-ecommerce` Firestore and Firebase Authentication connections verified with private server credentials; public web project configuration verified reachable; Email/Password provider confirmed enabled.
- Server-only Firestore rules published to the live project after a backup of the previous rules.
- Original catalogue migration is create-only; the original local source file remains unchanged. Real-project customer registration and email delivery require user testing; the automated suite uses emulators, not real customer identities.
- The Auth emulator uses synthetic password hashing and cannot validate imported BCRYPT logins. The original bcrypt hash/fixture is checked and the SDK import is exercised; imported customer passwords need a real-project sign-in check before launch.
- Legacy compatibility suites still pass: 22 API checks and 19 commerce regressions in isolated databases.

Detailed machine-readable result: `artifacts/firebase-results.json`. Normal runtime uses hosted Firebase; emulators and SQLite are explicit verification/migration tools only.

> Firebase update: the app now defaults to hosted Cloud Firestore and Firebase Authentication. See [FIREBASE.md](FIREBASE.md) for current setup. The SQL architecture/results below are historical.

# Verification record

Verified locally on 23 October 2026 using Node 22.14.0, native SQLite, Playwright and headless Microsoft Edge.

| Check | Result |
|---|---|
| Existing API suite | 22 passed, 0 failed |
| New commerce integrity regression suite | 19 passed, 0 failed |
| Browser suite | 82 checks passed, no JavaScript page errors |
| JavaScript syntax checks | 44 files passed |

The browser suite verifies shared branding and horizontal layout at 1440px and 390px for home, catalogue, product, brand story, contact, policy, login, register, cart, wishlist, orders, account, addresses, receipt and 404 pages. It also verifies mobile menu/Escape, search, category filtering, price sorting, invalid and valid colour/size combinations, cart drawer/Escape, cart persistence, populated mobile cart/checkout layout, COD selection, full guest order submission, backend-backed receipt, pending payment, invalid-order rejection, customer login, wishlist save/removal, new arrivals and customer registration.

API checks cover categories, the preserved 40-product catalogue, search, details, featured products, customer/admin login, profile, coupons, cart quantity updates, guest merge, wishlist, checkout, order details/history, addresses, reviews, contact and newsletter persistence.

Commerce regressions specifically verify missing/wrong variants, negative/fractional quantity, stock limits, cart ownership, unavailable payment-method rejection, delivery validation, coupon revalidation, transaction rollback after an injected item-write failure, inventory restoration, cart preservation, duplicate concurrent checkout protection, pending COD status, no fabricated tracking, free-shipping arithmetic, guest confirmation access, guest-order privacy and cart clearing only after commit.

Expected negative test responses print 400/409 errors in server logs; they are deliberate regression scenarios, not failed checks.

Screenshots: home-desktop.png, home-mobile.png, shop-desktop.png, product-desktop.png and cart-mobile.png under artifacts/. Browser machine-readable result: artifacts/browser-results.json.

No framework build, TypeScript or lint task existed. The app serves static files directly; `npm run check` checks syntax rather than claiming a nonexistent compilation step passed. Tests use separate temporary databases, leaving development/customer data untouched.

Not verified: real card/wallet payments, live email delivery, carrier tracking/rates, MySQL credentials/TLS/deployment, sql.js fallback runtime, load at production scale, screen-reader audit, Safari/iOS/Android devices, and formal trademark/domain availability. Browser widths were tested in Edge; layout rules also include tablet and large-screen breakpoints, but this is not a claim of cross-device certification. Remote fonts, icon CDN and existing catalogue photos remain network dependencies. Existing seed photograph/product mismatches remain a merchandising issue for the owner; catalogue data was not silently replaced.

Run `npm test`, `npm run check` and `npm run test:browser` to reproduce the documented checks. New playwright is development-only. Browser executable is selected with BROWSER_CHANNEL (msedge by default).
