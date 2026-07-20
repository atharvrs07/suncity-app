# My Suncity Vistaar — Project Context

Residential society management web app. Node.js/Express/SQLite backend + React/Vite frontend,
JWT auth (phone + password), mobile-first responsive web (no native app).

## Build status (updated 2026-07-19)

All four phases from the spec are **built and smoke-tested**:

1. ✅ DB schema for all 4 roles + auth + approval chain (incl. admin signup + fallback seed admin)
2. ✅ Hamburger drawer nav shell + iOS 26 "Liquid Glass" design system (Inter, frosted glass, Framer Motion)
3. ✅ Core modules: complaints (supervisor category scoping), dues + UPI QR + UTR verification,
   notices (incl. admin-only), automated dues engine (node-cron + Run Now), extension requests
   (5-day cap enforced server-side), Overdue Watch (admin, tel: CTA + mark paid)
4. ✅ New modules: classifieds (admin/OB only), lost & found, society events, photo gallery

Deferred by design (do not build): AI chatbot, AI summaries, push notifications, trending news,
real payment gateway.

## Running it

```
npm install && npm --prefix client install   # once
npm run build                                # builds client/dist
npm start                                    # serves API + SPA on PORT (default 4000)
```

Dev mode with hot reload: `npm run dev` (server) + `npm run dev:client` (Vite on 5173, proxies /api and /uploads to 4000).

`.env` holds JWT_SECRET, PORT, SOCIETY_UPI_VPA, SOCIETY_UPI_PAYEE_NAME, ADMIN_SEED_*, plus
GMAIL_USER / GMAIL_APP_PASSWORD (password-reset emails; blank app password → links logged to
console) and optional APP_BASE_URL for emailed links (see .env.example).
SQLite DB + uploads live in `data/` (override with DATA_DIR for persistent hosting).

**⚠️ Data persistence (see `DEPLOYMENT.md`):** all data (accounts + every module) is the
single SQLite file at `$DATA_DIR/suncity.db`, plus `$DATA_DIR/uploads/`. `DATA_DIR` MUST point
at a persistent volume on the host, or every redeploy starts from an empty DB and all data is
lost. Deploys are otherwise non-destructive (schema is `CREATE IF NOT EXISTS`, migrations are
idempotent, seed admin only created when zero approved admins exist). `.dockerignore` keeps the
local `data/` out of any built image. `server/reset-data.js` (`npm run reset-data`, dry-run
unless `--yes`; `--wipe-users` to also clear accounts) gives a clean launch slate on the host.

### Local dev accounts (created during smoke tests)

- Admin (seeded): phone `9999999999` / `admin123`
- Resident: `9000000001` / `test123` (Ravi Resident, A-101)
- Cleaning Supervisor: `9000000002` / `test123`

## Architecture

```
server/
  index.js         Express app; mounts routes; serves client/dist + /uploads; error handler
  config.js        env + role/category constants (single source of truth for RBAC lists)
  db.js            better-sqlite3 schema (CREATE IF NOT EXISTS) + ensureSeedAdmin()
  cron.js          daily 01:10 job: overdue sweep + automation runner (also runs at boot; idempotent)
  middleware/auth.js  sign / authRequired (re-checks status=approved per request) / requireRoles
  lib/uploads.js   multer disk storage → DATA_DIR/uploads, images only, 5 MB cap
  lib/dates.js     localDateStr / addDays (local-time date strings, YYYY-MM-DD)
  lib/passwords.js genPassword() — shared secure random password generator
  lib/mailer.js    nodemailer Gmail SMTP (app password); console fallback when unconfigured
  routes/          auth, approvals, users, complaints, notices, dues (incl. payments +
                   overdue-watch), extensions, automations, classifieds, lostfound, events, gallery
client/src/
  api.js           fetch wrapper (JWT header, 401 → logout), fmtMoney/fmtDate helpers
  auth.jsx         AuthProvider context (login/logout/me)
  constants.js     categories w/ emoji, statuses w/ chip tones, MENU with role visibility
  hooks.js         useFetch(path) with reload()
  components/
    Layout.jsx     topbar + hamburger + Liquid Glass drawer (framer-motion spring) + page transitions
    Glass.jsx      GlassCard/Btn/Chip/Field/Toggle/Segmented/Sheet(bottom sheet)/Empty/Stagger*
  pages/           Login, Signup, ForgotPassword, ResetPassword, Home, Complaints, Dues,
                   Notices, Classifieds, Approvals, Admin, LostFound, Events, Gallery, Settings
```

## Office-bearer login (added 2026-07-20)

Office bearers sign in with **username + password** at the hidden route **`/ob/login`**
(POST `/api/auth/ob-login`) — intentionally NOT linked from any page, menu, or the main
login screen; reachable only by typing the URL. Same JWT as everyone else, so all existing
RBAC middleware applies unchanged. Phone login for admin/resident/supervisor is untouched.

- Schema: `users.phone` is now nullable, `users.username` added (both UNIQUE, nullable).
  Migration for pre-existing DBs is a users-table rebuild in `db.js` (`migrateUsersUsername`),
  idempotent, verified with `PRAGMA foreign_key_check`.
- Seed: the 12 title accounts (usernames are lowercase slugs: `chairman`, `vice-chairman-1`,
  … `member-6`), each with a distinct random 12-char password, bcrypt-hashed, status
  `approved`. **Now auto-seeded at boot** (`server/lib/officeBearers.js`, called from
  `index.js`) so a fresh DB — e.g. the first start on a newly-persistent DATA_DIR, on a host
  with no shell — always has them; idempotent (skips existing usernames, so it only fills the
  gaps and never touches changed passwords). New credentials are appended to
  `office-bearer-credentials.txt` **inside DATA_DIR** (persistent, retrievable via the host's
  File Manager) and printed to the boot logs. `node server/seed-office-bearers.js`
  (`npm run seed:office-bearers`) still runs the same seeding on demand. Admins can also reset
  any office bearer's password from Admin → Users.
- Security: single generic "Invalid username or password" for every failure (no username
  enumeration), dummy bcrypt compare for unknown usernames (timing), in-memory rate limit
  (10 attempts / 15 min / IP → 429; resets on server restart).
- Follow-ups (not built): force password change on first OB login (OBs can already change
  passwords voluntarily in Settings); admin UI to create/reset office-bearer accounts.

## Password reset & recovery (added 2026-07-20)

- **Admin reset**: `POST /api/users/:id/reset-password` (admin-only via the router-level guard)
  generates a fresh 12-char password (shared `lib/passwords.js` generator, same one the OB seed
  uses), returns it exactly once, and logs an `[audit] Admin X reset the password of Y` line.
  Works on any account incl. other admins and self. UI: 🔑 Reset Password on each card in
  Admin → Users; the new password shows in a bottom sheet with a copy button.
- **Self-service forgot password**: users.email added (nullable UNIQUE, `migrateUsersEmail`
  ALTER + partial unique index; captured optionally at signup and editable in Settings).
  `POST /api/auth/forgot-password` (5 req / 15 min / IP) always answers the same generic
  message; for an approved account with that email it stores a SHA-256-hashed single-use token
  in `password_reset_tokens` (30-min expiry, previous unused tokens invalidated) and emails
  `APP_BASE_URL/reset-password?token=…`. `POST /api/auth/reset-password` validates hash +
  expiry + single-use inside a transaction. Admin reset also wipes outstanding tokens.
- **Email**: nodemailer via Gmail SMTP from suncityvistaar2000@gmail.com using a Google App
  Password (GMAIL_APP_PASSWORD in .env — NOT the account password). With it blank (local dev),
  `lib/mailer.js` logs the full mail incl. reset link to the console so the loop stays testable.
- **Show/hide password**: `PasswordInput` in Glass.jsx (eye toggle, `.pwd-wrap`/`.pwd-eye` CSS)
  used on Login, OB Login, Signup, Settings (both fields), and Reset Password.
- Smoke-tested 2026-07-20: 26/26 checks — admin reset for resident/OB/self (+403 for
  non-admin), forgot→email-link→reset→login loop, token single-use/expiry/bogus rejection,
  email uniqueness (409), generic-message parity for unknown emails. Dev passwords restored.

## Resident signup via email OTP (added 2026-07-20)

Public signup at `/signup` is now **residents only** — the role/account-type dropdown is
gone. Instead of parking accounts in `pending` for admin approval, residents verify an
emailed OTP and are created already `approved` + logged in. Other roles are still
provisioned outside this flow (office bearers via `seed-office-bearers.js` + hidden `/ob/login`;
admins via the env seed / `ensureSeedAdmin`) — that path is untouched, and the Approvals
screen + approval chain remain for it.

- **Flow**: `POST /api/auth/signup` (name, phone, email, flat_no, block, password — all now
  required; see the mandatory-fields section below) validates + checks phone/email uniqueness,
  then stashes the details (password bcrypt-hashed) and a SHA-256-hashed 6-digit code in the
  new `signup_otps` table (10-min expiry) and emails the code. **No user row is created yet.** `POST /api/auth/verify-signup`
  (email + otp) checks the code, creates the approved resident inside a transaction (re-guards
  uniqueness), consumes the OTP row, notifies admins, and returns `{ token, user }` — the
  client logs straight in. `POST /api/auth/resend-otp` regenerates the code.
- **Abuse controls**: per-record 10-min expiry, max 5 wrong attempts (then burned), max 5
  resends, 60-second resend cooldown; plus in-memory per-IP limiters on signup (10/15min),
  verify (20/15min), resend (10/15min). Resend gives a generic reply for unknown/completed
  emails (no enumeration).
- **Admin notification**: no in-app notification system exists, so each approved admin with an
  email on file is emailed (name + email + phone + flat) when a resident joins
  (`sendNewResidentAdminEmail`). Admins without an email are skipped (logged).
- **Email**: `lib/mailer.js` gained `sendSignupOtpEmail` (code prominently shown, expiry note)
  and `sendNewResidentAdminEmail`, reusing the existing Gmail-SMTP transport / console fallback.
- **Frontend**: `Signup.jsx` is a two-step form (details → OTP entry with resend + live
  cooldown timer); `auth.jsx` gained `completeSignup(token, user)` to adopt the returned
  session. `.otp-input` style added.
- Smoke-tested 2026-07-20: 21/21 — full loop (signup→console OTP→verify→approved resident+JWT→
  phone login works→admin emailed), wrong-code attempts-left, resend cooldown 429, expired-code
  rejection+cleanup, replay/duplicate-email/short-password/missing-email rejection, generic
  resend for unknown email.

## Mandatory signup fields, resident block & OAuth sign-in (added 2026-07-20)

- **All resident signup fields are now mandatory.** `flat_no` (previously
  optional) is required, and a new required **block** field is added. Enforced
  both client-side (`required` inputs/select in `Signup.jsx`) and server-side in
  `POST /api/auth/signup` (and again in `/verify-signup` via the stashed row).
- **Block**: one of 9 society blocks — `Aastha, Abhilasha, Avantika E,
  Avantika G, Club Premier, Executive, Royal, Vaibhav, Vatika` (order is fixed).
  Single source of truth is `BLOCKS` in `server/config.js`, mirrored in
  `client/src/constants.js`. Stored as `users.block` (nullable column +
  `signup_otps.block`, added by the idempotent `migrateBlockAndOAuth()` in
  `db.js`). Server rejects any block not in the list. Surfaced on the admin
  **Users** list: each card shows 🏢 block and there's a **filter-by-block**
  dropdown.
- **OAuth sign-in (Google, Microsoft, Apple)** — server-side Authorization Code
  flow, no browser SDKs, **no new npm dependencies** (ID tokens verified with
  Node `crypto` JWK import + the existing `jsonwebtoken`; requires Node 18+).
  - `server/lib/oauth.js`: provider metadata, in-memory CSRF `state`+`nonce`
    store, authorize-URL builder, code→token exchange, JWKS cache + ID-token
    verification (iss/aud/exp/nonce; Microsoft issuer validated against the
    token's `tid`), Apple client-secret JWT (ES256, signed from the `.p8`).
  - Routes on `/api/auth` (in `routes/auth.js`): `GET /oauth/providers`
    (which are enabled → client renders only those buttons), `GET
    /oauth/:provider/start` (redirects to provider), `GET`+`POST
    /oauth/:provider/callback` (Apple uses `form_post`), `POST /oauth/complete`.
  - Callback bounces the browser to the SPA route `/oauth/callback` with the
    result in the URL **fragment**: `#token=<jwt>` (existing/linked account →
    straight in) or `#pending=<jwt>&email=&name=` (new account) or
    `#error=<msg>`. New accounts hit a **"Complete your profile"** step
    (`OAuthCallback.jsx`) that collects the mandatory fields OAuth can't supply
    (phone, flat, block) before creating the **approved** resident. OAuth users
    get a random unusable password (they can set one via forgot-password for
    phone login). Accounts are matched by `(oauth_provider, oauth_sub)` — unique
    partial index `idx_users_oauth` — then linked by verified email.
  - Config/env: `OAUTH` in `config.js` reads `GOOGLE_OAUTH_*`,
    `MICROSOFT_OAUTH_*` (+ `MICROSOFT_OAUTH_TENANT`, default `common`),
    `APPLE_OAUTH_*`. All blank by default (provider off, button hidden).
    `APP_BASE_URL` must be the public origin (redirect URIs are built from it).
    **See `OAUTH_SETUP.md`** for what to register in each provider's console
    (redirect URIs, Services ID/keys, tenant). Apple can't use localhost/http —
    needs a deployed HTTPS host.

## Loading screen, logo, dependent House No., staged signup, disposable-email guard (added 2026-07-20)

- **App loading screen**: `client/src/components/SplashScreen.jsx` — full-viewport
  image shown for **3s** on first app load then fades out (framer-motion). `<picture>`
  serves the 9:16 image on mobile and the 16:9 image on desktop (`min-width:768px`).
  No skip button — instead a **pixel-art loading bar** (chunky white frame + hard
  drop-shadow, segmented "blocky" fill, blinking `LOADING…` label; `.splash-bar*` in
  styles.css) animates 0→100% over the 3s to match the pixel-art splash art. Wired via
  a `SplashGate` in `App.jsx` that overlays the splash while the app mounts underneath.
  Assets live in `client/public/imgs/` (Vite copies `public/` → `dist/`, so the
  single-process server serves them).
- **Logo**: the provided 1:1 `logo.png` replaces the old 🏙️ emoji placeholders —
  favicon + apple-touch-icon (`client/index.html`), drawer brand (`Layout.jsx`),
  and the auth-screen headers on Login / Signup / OAuth complete-profile
  (`.auth-logo-img`, `.drawer-brand .brand-logo` in styles.css). NOTE: the source
  PNGs are large (~5–6 MB each); fine functionally but worth optimizing later.
- **Dependent House No. dropdown**: source of truth is project-root
  `block-house-numbers.json` (block → house-number list). Server reads it via
  `server/lib/houseNumbers.js` (`isValidHouseNo`); the client fetches the same map
  from the new public `GET /api/meta/house-numbers` (`server/routes/meta.js`) and
  caches it (`client/src/houseNumbers.js`). `client/src/components/BlockHousePicker.jsx`
  renders Block + House No. selects — House No. is disabled until a Block is chosen,
  lists only that block's numbers, and clears when the Block changes. Used by both
  Signup and the OAuth complete-profile step. New nullable column `users.house_no`
  (+ `signup_otps.house_no`), added by idempotent `migrateHouseNo()`. On signup the
  selected house number is stored in `house_no` **and** mirrored into `flat_no` so
  every existing `flat_no` display (admin Users list, complaint/lost-found cards)
  keeps working. The free-text flat field is gone from both signup forms. Server
  validates `house_no ∈ block`.
- **Staged signup form** (`Signup.jsx`): fields reveal progressively — Name →
  (Block + House No.) → (email, phone, password). Purely presentational; all fields
  remain required client- and server-side (`/api/auth/signup` re-validates every one).
- **Disposable-email guard + MX check** (manual signup only; OAuth emails are
  provider-verified and skip it): `server/lib/emailValidation.js` uses the maintained
  npm `disposable-email-domains` list (refresh via `npm update`) — a temp-mail domain
  is rejected with "Please use a permanent email address" **before any OTP is sent**;
  then the domain must publish MX records (`dns.resolveMx`) or it's rejected. A
  transient resolver failure returns 503 (can't verify right now). Reuses the existing
  `signup_otps` OTP infra + Gmail mailer. Rate limiting: existing per-IP limiters plus
  a per-email resend cooldown on `/signup`. (Offline/dev note: with no DNS the MX step
  returns 503, so a full happy-path signup needs a network-connected host.)
- **Complaint image upload**: already present (server `upload.single('photo')`,
  `complaints.photo`, file input on the form, image shown in the shared detail sheet
  for residents and managers) — verified, no change needed.
- **Lost & Found**: already existed; its post form was reordered to the requested
  flow — photo (optional) → item name (required) → description (**now required**,
  enforced server-side) → then type/location/contact.

## Admin account management (added 2026-07-20)

Admins can edit and delete accounts from **Admin → Users** (`client/src/pages/Admin.jsx`,
`UsersTab`). Both routes are admin-only (the whole `server/routes/users.js` router is gated
by `requireRoles('admin')`).

- **Edit any account** — `PATCH /api/users/:id`. Each field is optional (only keys present
  in the body are touched); everything is validated up front, then applied in one transaction.
  Editable: `name`, `phone` (10 digits, unique; can't be cleared on a phone-login account),
  `email` (valid + unique, or blank to clear), `block`+`house_no` (re-validated as a pair via
  `isValidHouseNo`, and `flat_no` re-mirrored), and an optional new `password` (≥6 chars — set
  directly, and it invalidates any outstanding self-service reset tokens). The client "✏️ Edit"
  button opens a Sheet that sends only changed fields; the Block/House picker shows only for
  residents.
- **Delete a resident** — `DELETE /api/users/:id`. **Residents only** (office-bearer / admin /
  supervisor accounts are provisioned outside signup and can't be deleted here → 400); can't
  delete yourself → 400. Cascades in one transaction: the resident's payments + due_extensions
  (by user_id and by their dues' ids), dues, complaints, lost & found posts, and password-reset
  tokens, then the user row. Danger button lives at the bottom of the Edit sheet (residents only).
- The existing **🔑 Reset Password** (random, shown once) is unchanged and kept alongside Edit.
- Both actions write an `[audit]` log line naming the acting admin and target.

## Key invariants (enforce on any change)

- **RBAC lives on the API**, not just the UI. Roles: admin, office_bearer (12 named slots),
  supervisor (maintenance | cleaning), resident.
  - Classifieds: admin + office_bearer ONLY (residents/supervisors get 403 and no menu item).
  - Approvals + Admin + user management + automations + payment verification: admin only.
  - Cleaning supervisor sees ONLY `park_cleaning`, `drainage_cleaning`, `road_garbage_pickup`
    complaints; maintenance supervisor sees everything EXCEPT those (see CLEANING_CATEGORIES
    in server/config.js).
- **Approval chain**: applies to every path EXCEPT resident signup — those now self-activate via
  email OTP (see the OTP section above) and are created `approved`. Any other pending account
  (created outside the public signup) still starts `pending` and cannot log in until an admin
  approves; self-approval is blocked; `ensureSeedAdmin()` promotes/creates the env-seeded admin
  whenever zero approved admins exist, so the chain can never dead-lock. Approvals screen shows
  filled office-bearer/supervisor slots (informational, not hard-capped).
- **Dues**: UPI QR is client-generated (`upi://pay?pa=&pn=&am=&tr=DUE{id}&cu=INR` via qrcode pkg);
  resident submits UTR → admin verifies/rejects. Automation dedupe via partial unique index on
  (automation_id, user_id, period_key). Extensions max 5 days total per due, summed over
  pending+approved requests, enforced server-side; approval pushes dues.due_date.
- Notices with `admin_only=1` are visible to admins only; only admins can set the flag.

## Nice-to-have next steps (not started)

- Office-bearer permission depth refinement (spec allows refining later)
- Complaint comments/updates thread; notice editing
- Pagination for large lists (dues admin list currently caps at 500)
- PWA manifest + installability polish
