# Firebase setup for Valcerenne

The application now defaults to **Cloud Firestore + Firebase Authentication**. Normal application startup does not open, seed or write a local SQLite/MySQL database. The existing SQL adapters remain available solely for compatibility tests and migration. The website and Express API can still be hosted on Render or Vercel; Firebase stores the database and identities online.

## 1. Configure your existing Firebase project

Selected project ID: `valcerinne-ecommerce`. The repository default in `.firebaserc` points to this exact ID; emulator tests always explicitly select `demo-valcerenne` instead.

1. Open https://console.firebase.google.com/ and create or select the project you want to use.
2. In Project settings → General, register a **Web app**. Copy its apiKey, authDomain, projectId and appId values.
3. In Build → Authentication → Sign-in method, enable **Email/Password**. Registration, sign-in, password changes and password-reset emails use this provider.
4. Under Authentication → Settings → Authorized domains, add the website's real hostname. For local frontend testing, add localhost and/or 127.0.0.1 explicitly if needed. The database still runs in Firebase when testing the frontend locally.
5. In Build → Firestore Database, create the default database using **Standard edition / Native mode**, with production/restricted rules. Pick a region near the API host and customers; review that choice before creating the database.
6. Paste the contents of the repository's `firestore.rules` into the Firestore Rules editor and publish. The rules deny direct browser database access. Requests go through the existing Express API, which verifies Firebase ID tokens and enforces ownership. The server's Admin SDK uses IAM and bypasses client rules.

This account creation and console configuration must happen in your own Firebase account. The repository does not create a paid service, select billing, or deploy anything automatically. Consult https://firebase.google.com/pricing for project quotas and costs; Firestore reads/writes can incur usage costs beyond the plan's allowances.

## 2. Add private server credentials

Project settings → Service accounts → Firebase Admin SDK → Generate new private key. Keep the downloaded JSON private, outside `public/` and preferably outside the repository. Do not paste it into chat or commit it.

For local development, set `GOOGLE_APPLICATION_CREDENTIALS` to that file's absolute path. The database remains hosted in Firebase; this file only authorizes your server to connect to it.

For Render/Vercel, set the entire JSON as a private `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable. Alternatively use the host's supported Google Application Default Credentials/workload identity mechanism. Configure only one credentials method. The credential's project must match FIREBASE_PROJECT_ID.

## 3. Configure the app

Copy .env.example to .env if .env does not exist. If it exists, update the values without overwriting other secrets.

```env
DB_CLIENT=firebase
NODE_ENV=development
PORT=3000
FIREBASE_PROJECT_ID=valcerinne-ecommerce
FIREBASE_API_KEY=your-web-api-key
FIREBASE_AUTH_DOMAIN=valcerinne-ecommerce.firebaseapp.com
FIREBASE_APP_ID=your-web-app-id
GOOGLE_APPLICATION_CREDENTIALS=C:/private/your-service-account.json
```

The web app config is public by Firebase's design and is returned by `/api/config`. Admin JSON/private keys are never sent to the browser. JWT_SECRET, DB_HOST, DB_USER, DB_PASSWORD and MySQL TLS configuration are no longer used in Firebase mode.

```powershell
npm ci
npm run build
npm start
```

The browser SDK is bundled locally by esbuild, preserving the existing HTML/JavaScript site. No external Firebase script CDN is required. Startup never falls back to a local database if Firebase is missing; unavailable configuration produces an explicit setup error.

## 4. Preview and import the existing data

The migration reads the original SQLite file in read-only mode. It does not delete, reseed, or modify that file. First preview:

```powershell
npm run migrate:firebase
```

For catalogue-only import, after verifying the target project:

```powershell
node scripts/migrate-firebase.cjs --write --project valcerinne-ecommerce
```

This creates missing categories, products with galleries and variants, coupons, and existing review records. Existing Firestore documents are left unchanged, so reruns do not overwrite inventory or new orders.

To also migrate existing accounts, addresses, saved items, carts, orders, contact messages and newsletter preferences:

```powershell
node scripts/migrate-firebase.cjs --include-customers --write --project valcerinne-ecommerce
```

Use `--source C:/path/to/existing/ecommerce.sqlite` if your original database is elsewhere. The original file contains the retained seed/demo records; inspect it before importing accounts into a real store. Account import preserves bcrypt password hashes using Firebase's BCRYPT import, reuses an existing Firebase account when the email already exists, and maps legacy references to Firebase UIDs. It never overwrites an existing Firebase user's password. Existing SQL JWTs are not accepted as Firebase sessions; customers sign in again after migration.

Imported users do **not** automatically receive administrator privileges, even if the old seed account claimed to be an admin. Grant a trusted administrator explicitly:

```powershell
node scripts/firebase-admin.cjs --uid FIREBASE_USER_UID --project valcerinne-ecommerce
node scripts/firebase-admin.cjs --uid FIREBASE_USER_UID --project valcerinne-ecommerce --write
```

The first command is a preview. The second sets a trusted Firebase custom claim. Sign out and back in afterward. Never grant admin to a public demo account.

Migration is resumable create-only, not one cross-service atomic operation: Auth imports and document imports may partially finish if a network failure occurs. Inspect the result and rerun the same command; keep the original database backup until counts, customer access, order history and stock are verified. Do not accept live traffic against an incomplete migration. Legacy guest orders lacking a session ownership hash need administrative assistance rather than public lookup.

## 5. Deploy

### Vercel: fix a missing Windows credential-file error

Vercel runs on a remote Linux server and cannot access a `C:/Users/...` credential file on your computer. The server already supports credentials supplied through `FIREBASE_SERVICE_ACCOUNT_JSON` and gives that variable priority over file-based credentials.

1. Open your Vercel project → Settings → Environment Variables.
2. Remove `GOOGLE_APPLICATION_CREDENTIALS` from the Vercel environment. Keep the local `.env` setting for development.
3. Add `FIREBASE_SERVICE_ACCOUNT_JSON`. Paste the **entire contents** of your existing Firebase Admin SDK JSON file as the value, from the opening `{` to the closing `}`. Paste JSON directly without wrapping it in quotes or JavaScript. Keep it private; never use a public/browser prefix or paste the key into chat, source code, or an online converter.
4. Select Production, and Preview if you use preview deployments. Verify `DB_CLIENT=firebase`, `FIREBASE_PROJECT_ID=valcerinne-ecommerce`, and the Firebase web configuration variables from section 3 are also set for those environments. Use `NODE_ENV=production`.
5. Redeploy from Deployments → latest deployment → Redeploy. Environment changes apply to a new deployment.
6. Add your deployed website hostname under Firebase Authentication → Settings → Authorized domains.
7. Open `/api/products` on the deployed domain and check that it returns a successful JSON response containing products. `/api/health` alone does not verify Firebase credentials or database access.

Reference: [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables), [Firebase Admin setup](https://firebase.google.com/docs/admin/setup).

Set the same Firebase variables in the hosting dashboard, with `NODE_ENV=production` and private FIREBASE_SERVICE_ACCOUNT_JSON. Build using `npm ci && npm run build`; start with `npm start`. Add the deployed hostname to Firebase Authentication authorized domains. Keep authentication and Firestore in the same project. The updated Render blueprint contains these environment variable names. Existing Vercel static/API rewrites remain.

## Data model and preserved behaviour

- products/{numericId}: catalogue data with embedded gallery and variant records; existing slugs and numeric IDs preserved.
- categories/{numericId}, coupons/{uppercaseCode}, reviews/{id}.
- users/{firebaseUid}: non-sensitive profile data. Passwords live in Firebase Authentication, never in Firestore.
- users/{uid}/addresses/{numericId} and wishlist/{productId}: private customer records.
- carts/u_{uid} and carts/g_{sessionHash}: signed-in/guest bags.
- orders/{orderNumber}: receipt snapshots, owned account/session, history, pending payment and stock-linked items.
- contact_messages, newsletter_subscribers and review_claims: supporting records.

Cart modifications, stock validation, COD checkout, coupon consumption, order creation and cancellations use Firestore transactions. Customers cannot change prices, inventory, another customer's data or administrator roles through the API. Reviews only receive a verified-purchase marker for delivered orders.

Search/filtering currently scans the small catalogue on the server, capped at 1000 products with a clear error beyond that size. This preserves the existing search experience without Firestore compound-index complexity. Read costs grow with catalogue size and traffic; add an indexed search service before expanding. Rules deny direct client Firestore access; no broad public read/write rules are needed.

Firebase does not supply the payment gateway. Existing COD remains pending/unpaid. Razorpay is still a separate future integration; this switch does not mark payments paid or send transactional order emails. Password-reset messages are sent by Firebase Auth using its email template settings.

## Verification

`npm run build` builds the Auth SDK bundle. `npm run check` checks application JavaScript. `npm run test:firebase` runs Firebase Auth and Firestore emulators under a demo project for integration checks, including actual browser registration/sign-in. The emulators are disposable test infrastructure, not the application's normal database. Requires Java 21+ and the included Firebase CLI; first run downloads the emulator.

`npm run test:legacy` exercises the retained SQL code in isolated test databases. `npm run test:browser` remains the previous legacy storefront regression suite and explicitly selects SQLite for that suite; it is not a claim of live Firebase connectivity.

No live project credentials were available during the switch. Emulator verification cannot confirm your cloud IAM permissions, actual email delivery, project billing or deployed configuration. Run the migration and test registration, persisted carts, order submission and access isolation against your configured project before launch.

Official references: https://firebase.google.com/docs/admin/setup · https://firebase.google.com/docs/auth/web/password-auth · https://firebase.google.com/docs/auth/admin/import-users · https://firebase.google.com/docs/firestore/manage-data/transactions

Firebase Auth emulator limitation: its synthetic password hashing does not validate imported bcrypt passwords. The migration uses the official BCRYPT import; account creation and preservation are checked in the emulator, but an imported customer login must be tested against the real project before launch.

Connection verification: after saving the public settings and private credentials, run `npm run firebase:check`. It performs read-only checks against Firestore and Firebase Authentication and reports connection status without printing keys. The current project web configuration was verified reachable; localhost is authorized. The loopback hostname 127.0.0.1 is not authorized in the real project, so use http://localhost:3000 unless you add that hostname explicitly. Analytics has not been enabled.

## Live project connection record — 23 October 2026

The public web configuration is saved in ignored `.env`. Private server credentials were saved by the project owner and verified with read-only access to both Firestore and Firebase Authentication. Email/password sign-in is enabled. The server-only Firestore rules were published; previous rules metadata/source is backed up in ignored `.firebase/previous-firestore-rules.json`. The catalogue-only migration creates missing records and preserves the original source database. This does not deploy the website or import the original demo customer accounts.

Publish updated rules later with `node scripts/deploy-firebase-rules.cjs --project valcerinne-ecommerce --write`. Preview by omitting --write. The migration and rule scripts require an explicit project matching the configured environment.

Completed live migration: 65 missing catalogue/support documents were created (40 products, 7 categories, 4 coupons, 7 existing reviews and 7 review-ownership records). No existing remote document was overwritten. Customer/demo accounts were not imported into live Authentication; the real project starts with its own Firebase accounts. Original source accounts and data remain in the untouched migration backup.

Live storefront verification: `/api/health` reports firebase, the products API reports 40 records, categories reports 7, an unauthenticated account request returns 401, and a direct unauthenticated Firestore request returns 403. The live homepage renders its four curated product cards without JavaScript errors or horizontal overflow. Screenshot: `artifacts/firebase-live-home.png`.
