# Cloudflare migration

Updated October 18, 2026. `https://aiasbsr.com` now uses Cloudflare Workers for hosting and APIs, D1 for structured data, and R2 for file bytes. The www hostname redirects to the apex. GitHub Pages is disabled.

## Migrated resources

- Account: `basrah@aias.org`, ID `896722b97bdd64d08fe1100378af1e3c`.
- Domain: `aiasbsr.com`, zone `e19e56b1e6b9b8c6273186f3016e5302`. Hostinger nameservers changed to `alec.ns.cloudflare.com` and `ariadne.ns.cloudflare.com`; public DNS confirms both. Registration remains at Hostinger.
- D1: `aias-basra`, ID `465dda01-b114-46e0-ba36-f0b35ae01b99`. Four migrations, 1,595 imported records, 41 trusted Google-to-existing-user mappings, nine attachment links. Identity mappings come from Firebase Auth, not editable profile email fields.
- R2: `aias-basra-media`, direct public bucket access disabled. All 266 unique objects were downloaded and compared by SHA-256 with their originals; zero failures. Includes 219 Firebase Storage files, extracted database attachments, website assets and Android downloads.
- Existing AI provider credentials and Google OAuth secret transferred directly into Worker secrets. No credential values enter browser code or Git. Native Web Push uses a separate generated key pair.
- Existing OAuth client now authorizes `https://aiasbsr.com/api/auth/callback`; old callbacks remain during verification.

## Application changes

Current deployed Community frontend and 49 backend handlers were recovered and ported, preserving each handler's deployed source version. Community, Market, business and portfolio pages call the same-origin Cloudflare API. Two existing frontend syntax errors were repaired.

The Worker enforces document and media permissions. Private attachments are served through authenticated requests, and Google identities retain their old user IDs. Cookies are HttpOnly. Content mutations verify the request origin and record an audit trail. Transactions use atomic version checks.

Uploads store bytes in R2 and metadata in D1. Main-site base64 chunk storage and upload-failure fallbacks were removed. The new `/admin-storage.html` library supports uploads, filtering, previews, links and pagination. Verified binaries were removed from Git tracking; local copies and Git history remain available. No Git history rewrite was performed.

Legacy Firebase hosting helpers and GitHub Pages CNAME were removed from this branch. One-time export/port scripts retain references to the original services to document recovery; normal builds do not run them. Private exports, archives, inventories and verification evidence remain ignored in `.migration/`.

## Development and validation

```powershell
npm install
npm run db:local
npm run build
npm test
npm run dev
```

The build uses an explicit public-file allowlist and excludes credentials, migration exports, backups, server code and binary media. Local and remote D1/R2 data are separate.

Twenty automated checks passed in the real Workers/D1/R2 runtime, including scoped permissions, private threads/media, registration, session revocation, upload/download/ranges and transaction rollback. Syntax and SDK imports were checked in 161 frontend scripts. The final domain serves migrated content and R2 files; Google sign-in successfully mapped the existing administrator to its original account and opened the Super Admin dashboard. The Community feed loads existing connections and posts. A fresh source snapshot immediately before cutover found no added, removed or changed source records.

## Cutover verification

Publish the Worker, verify public pages and R2 assets, attach apex and www custom domains, check HTTPS and Google sign-in, and then disable GitHub Pages. The Worker redirects www to the apex. GitHub remains the source repository; uploaded media lives in R2.

Do not delete Firebase production projects or data during cutover. Existing Android APKs were copied intact and may retain compiled settings for old services; rebuilding them requires Android source. Existing browser push subscriptions must be renewed for Web Push on the new origin. AI providers should not be called solely to test credential migration.


## Product release and account sharing (2026-10-18)

The public products are the main website (`aiasbsr.com`), BASRA Professional
(`professional.aiasbsr.com`), and Market (`market.aiasbsr.com`). Legacy product
HTML links redirect with their query strings preserved. Community remains intact
at `community.aiasbsr.com`, accessible through the admin dashboard overview.
The Worker checks administrator permissions for Community pages, posts, spaces,
functions, and uploads. Anonymous and ordinary signed-in users cannot enter.
Private direct conversations used inside Professional retain participant checks.
Existing role permissions still determine which moderation actions an admin may perform.

Google OAuth uses the existing apex callback. A Secure, HttpOnly session cookie
named `__Secure-aias_session` is shared only across `aiasbsr.com` subdomains.
Existing host-only sessions are promoted when the apex session endpoint is visited.
Return addresses use an exact host allowlist; state-changing APIs still require
same-origin requests. Logout revokes the server session for every product, and
open tabs refresh their account state when focused. Admin and Community HTML is
private and not cached. Market's old development password screen is removed.
