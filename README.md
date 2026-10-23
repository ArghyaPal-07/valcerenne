# VALCERENNE

The art of choosing well.

The application now defaults to hosted Cloud Firestore and Firebase Authentication. Normal startup does not open a local database. The existing storefront, catalogue IDs, carts, wishlists, addresses and order screens are retained.

## Set up Firebase



Run `npm ci`, `npm run build`, then `npm start`. The browser SDK is bundled locally. Missing Firebase credentials produce a setup error; there is no automatic SQLite fallback.

## Verification

Run `npm run build`, `npm run check` and `npm run test:firebase`. The Firebase suite uses disposable test emulators, a demo project and headless Edge, never a live Firebase project. Java 21+ is required. These emulators are test infrastructure only.

## Data migration

`npm run migrate:firebase` previews the original data without writing to Firebase. See the guide for the explicit import commands and project safeguards. The source SQLite file remains unchanged. Existing cloud documents and Firebase passwords are not overwritten. Customer migration and administrator access require explicit options.

## Payments

COD remains supported with payment pending. Firebase replaces the database and authentication.