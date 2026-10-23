> Firebase update: the app now defaults to hosted Cloud Firestore and Firebase Authentication. See [FIREBASE.md](FIREBASE.md) for current setup. The SQL architecture/results below are historical.

# Integration audit and launch setup

Existing integrations were retained. Local verification used SQLite and same-origin REST endpoints. External services are not claimed to be connected.

| Capability | Current state | Required next setup |
|---|---|---|
| Catalogue, inventory, users, orders | Existing SQLite/MySQL adapters, schema and REST controllers | Local SQLite works. For production, provide an existing MySQL database and verify its schema and connection. No new database vendor is necessary. |
| Authentication | Existing bcrypt passwords and JWT sessions | Configure a strong private JWT_SECRET. Production refuses a missing/example secret. No OAuth callbacks are used. Password reset and email verification are not implemented. |
| Payments | COD order persistence with pending payment; online payment methods disabled | If online payments are needed, recommend Razorpay for the existing INR context. Requires merchant onboarding, sandbox keys, signature verification, idempotent webhook processing and refund handling before enabling payments. |
| Images | Generated local hero and logo; existing remote Unsplash catalogue imagery | No upload/storage service needed for current read-only catalogue. Before merchant uploads are added, choose managed object storage and validate ownership, MIME types and image optimization. |
| Shipping | Existing ₹149 / complimentary ₹999 threshold; no carrier API | Confirm COD service areas and fulfilment operations. Keep tracking blank until a real carrier assigns it. A carrier integration is optional until automated shipping is required. |
| Email | Newsletter preferences and contact messages stored in DB | No newsletter or transactional email is sent. Resend is a suitable future transactional provider: verified sender domain, DNS records, API key, templates and failure handling required. |
| Search | Existing SQL search, category, price filters, sort and pagination | No paid hosted search needed for 40 records. |
| Analytics | None added | Choose only after measurement and consent requirements are defined. |
| Hosting | Express static app; Vercel rewrites; updated Render blueprint | Supply production secrets and durable MySQL. Deploy and verify using the chosen account. No hosting account was accessed or deployment performed. |

## Configuration

Active variables are documented in `.env.example`: PORT, NODE_ENV, DB_CLIENT, SQLITE_DB_PATH, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET. None is embedded as a private credential in browser code. Retained local-storage session key names preserve existing sign-ins and bags.

Future payment placeholders are commented and intentionally not consumed by the app: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET. A proposed webhook URL is `https://your-domain.example/api/payments/razorpay/webhook`; **this route is not implemented**. Enabling payments requires server-side order creation, amount/currency validation, signed webhook processing and success/failure/replay tests. No payment callback should mark an order paid based only on a browser redirect.

Future email placeholders: RESEND_API_KEY, EMAIL_FROM and APP_URL. The current app does not use them. Newsletter unsubscribe automation and delivery/bounce processing must accompany real marketing email; preferences currently require administrative handling.

Provider costs vary by country, payment type, volume, tax and contract. See [Razorpay official pricing](https://razorpay.com/pricing/) for the current merchant quote rather than treating a generic transaction rate as guaranteed. [Resend pricing](https://resend.com/pricing) currently includes a free tier with a 100-email daily limit; paid limits and plans are listed there. Both pages were checked on 23 October 2026. Database, host, domain and carrier costs depend on the user's selected accounts and are not provisioned.

Render's default filesystem is ephemeral and local database files are lost across redeploys; persistent disks are offered on paid services. The new blueprint uses an external database to avoid presenting ephemeral SQLite as durable production storage. [Official Render disk documentation](https://render.com/docs/disks).

## Limits that remain

- No external API credentials were available or requested in chat. Online payments, email sending, carrier rates/tracking and MySQL deployment were not tested.
- The inherited 8% estimated tax is retained as a development calculation. Confirm actual tax rules before commerce launch.
- Confirm actual returns, dispatch commitments, business contact details and commercial policies. The site now describes available functionality without invented headquarters, phone numbers or SLA promises.
- The existing catalogue contains demo accounts, review records and stock photography. It has been preserved rather than silently replaced or deleted. Merchandising accuracy, licensed imagery and readiness as live stock need owner review.
- Existing admin API capability remains; no new administration interface, password-reset flow, payment gateway, carrier dashboard or database migration was invented.
- Production load/concurrency testing across separate MySQL connections, cancellation/refund provider workflows, rate limiting and a full security review are separate launch work. Local transaction and ownership regressions cover the flows changed here.
