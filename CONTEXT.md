# My Suncity Vistaar — Project Context

Residential society management web app. Node.js/Express/SQLite backend + React/Vite frontend,
JWT auth (phone + password), mobile-first responsive web (no native app).

## Build status (updated 2026-07-21)

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
  `approved`. **NOTE (superseded 2026-07-21):** office bearers are no longer auto-seeded — they
  now sign up (account-type dropdown) and are approved by an admin who assigns their permissions
  (see the "Super admin…" section below). `/ob/login` stays for any username-based office-bearer/
  admin accounts. `server/lib/officeBearers.js` + `node server/seed-office-bearers.js`
  (`npm run seed:office-bearers`) remain for optional manual use. Admins can reset any office
  bearer's password from Admin → Users.
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

Residents verify an emailed OTP and are created already `approved` + logged in (no admin
approval). **NOTE (updated 2026-07-21):** the account-type dropdown is back on `/signup` —
residents keep this OTP flow, while Office Bearer / Admin selections go through
`POST /api/auth/signup-staff` (no OTP, created `pending`, admin approves with permissions). See
the "Super admin…" section below.

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
- **Delete an account** — `DELETE /api/users/:id`. **NOTE (expanded 2026-07-21):** now deletes
  ANY non-super-admin account (not just residents), never yourself, and never the last admin
  (unless super_admin). Society-owned content the account posted (notices/events/gallery/
  classifieds) is reassigned to the acting admin; personal records (payments + due_extensions,
  dues, complaints, lost & found, reset tokens) cascade, then the user row. Danger button is at
  the bottom of the Edit sheet for any non-super-admin, non-self account.
- The existing **🔑 Reset Password** (random, shown once) is unchanged and kept alongside Edit.
- Both actions write an `[audit]` log line naming the acting admin and target.

## Super admin, office-bearer permissions, staff signup & activity log (added 2026-07-21)

A new top role plus a granular permission model and a full activity log.

- **`super_admin` role** — a hidden, auto-seeded, all-powerful account. Added to `ROLES` and
  the `users.role` CHECK. Old DBs are migrated by `migrateSuperAdminAndPermissions()` in `db.js`
  (guarded users-table rebuild — the only way SQLite can change a CHECK — which also introduces
  the nullable `permissions` column; verified with `PRAGMA foreign_key_check`). Seeded once by
  `ensureSuperAdmin()` from `SUPER_ADMIN_*` env (defaults: phone `7817834370`, email
  `atharvrs2010@gmail.com`, password `sadmin123` — change via env in prod). **Idempotent: only
  created if no super_admin exists**, so a later password change persists across deploys. It is
  the ONLY auto-generated account. Logs in via normal phone login. **Secret:** hidden from the
  admin Users list and shielded from every user-management route (returns 404 to non-super_admin
  via `getManageableTarget`), and the developer watermark is suppressed for it.
- **Office-bearer permissions** — `OFFICE_BEARER_PERMISSIONS` in `config.js` (mirrored with
  labels in `constants.js`): `manage_notices, manage_events, manage_gallery, manage_classifieds,
  manage_complaints, manage_dues, manage_lostfound`. Stored as a JSON array in `users.permissions`.
  Admin/super_admin implicitly hold all. `middleware/auth.js` gained `hasPermission(user, perm)`,
  `requirePermission(perm)`, `isAdmin(user)`, and now parses `permissions` onto `req.user`;
  `requireRoles` lets `super_admin` through every gate. Module routes (notices/events/gallery/
  classifieds/complaints/dues/lostfound) are now permission-gated instead of blanket
  admin/office_bearer. (Extensions + automations stay admin-only.)
- **Account-type dropdown at signup** — `Signup.jsx` offers **Resident / Office Bearer / Admin**.
  Residents keep the email-OTP → auto-approved flow. Office bearers (pick a committee post) and
  admins use `POST /api/auth/signup-staff`: **no OTP**, created `pending`, and an admin must
  approve. On approval (`/api/approvals/:id/approve`) the admin picks the office bearer's
  permissions via checkboxes; permissions are also editable later in Admin → Users (with role
  demote/promote). Admins are notified of pending staff by email (`sendPendingAccountAdminEmail`).
- **User management expanded** — `PATCH /api/users/:id` now also changes `role` (demote/promote,
  never to/from super_admin, not your own, guarded against removing the last admin),
  `role_detail`, and `permissions`. `DELETE /api/users/:id` now removes **any** non-super-admin
  account (not just residents); society-owned content it posted (notices/events/gallery/
  classifieds) is reassigned to the acting admin, personal records are cascaded.
- **Activity log** — new `audit_log` table + `lib/audit.js` (`logAudit`) writes account/auth/
  approval/payment/content events (actor snapshotted so entries survive deletion). Read via
  `GET /api/audit` (admin + super_admin) and shown in a new **Admin → Activity Log** tab with
  search. Both admins and the super admin can see every log.
- **Office-bearer auto-seed retired** — `seedOfficeBearersAtBoot` is removed from `index.js`; the
  12 accounts now come via signup + approval. `/ob/login` stays (now accepts `office_bearer` and
  `admin` username accounts). `server/lib/officeBearers.js` + the seed script remain for optional
  manual use only.
- **Developer watermark** — `components/Watermark.jsx` renders "Developed by Adarsh Sharma | 25
  Carat Ventures" fixed at the bottom across the whole UI (`.app-watermark` in styles.css),
  **hidden only for the super_admin account**.
- Verified 2026-07-21: fresh-DB boot + old-DB migration (data/FKs preserved) + 21/21 HTTP
  integration checks (super-admin login/secrecy/shield, staff signup→approve-with-permissions,
  permission enforcement, permission edit, delete-with-reassignment, audit log). Client build clean.

## Owner/Resident status, per-house lock, name casing, SN Pro font (added 2026-07-21)

- **Owner vs Resident status** — every resident account is either the flat's
  **Owner** or its living-in **Resident**. Source of truth is `RESIDENT_STATUSES`
  in `server/config.js` (`['owner','resident']`), mirrored with labels in
  `client/src/constants.js`. Stored as the new nullable `users.resident_status`
  column (+ `signup_otps.resident_status`), added by the idempotent
  `migrateResidentStatus()` in `db.js`. Required on manual signup, OAuth
  complete-profile, and validated server-side in `/api/auth/signup`,
  `/verify-signup`, `/oauth/complete`. Shown on the admin Users list (👤 Owner /
  Resident) and editable in Admin → Users.
- **One Owner + one Resident per house (house-slot lock)** — a house holds at most
  one of each status. Enforced by a **partial unique index**
  `idx_users_house_slot ON users(block, house_no, resident_status)
  WHERE role='resident' AND …NOT NULL` (the atomic race backstop; NULLs are
  distinct so legacy statusless residents never collide, and promoting a resident
  away frees the slot). Routes also do a friendly pre-check (`houseSlotTaken` in
  `routes/auth.js`; inline in `routes/users.js` for admin edits, excluding the
  edited user's own slot) returning 409 before insert. **UI**: new public
  `GET /api/meta/house-occupancy` reports which slots are filled (occupancy only,
  no identity); `client/src/houseNumbers.js` `useHouseOccupancy()` fetches it fresh
  (not cached). `BlockHousePicker.jsx` now renders **Resident Status → Block →
  House No.**: House No. is disabled until both a status and block are chosen, and
  houses whose chosen-status slot (or both slots) are taken are shown but greyed
  out. Admin edit passes `ignore` (the account's own slot) so an unchanged re-save
  passes, and `statusRequired={false}` so unrelated edits of legacy residents
  aren't blocked. Signup staged reveal now gates on status+block+house.
- **Live name title-casing** — `capitalizeName()` in `constants.js` capitalizes the
  first letter of every word as the user types (length-preserving, so the caret
  never jumps; intentional caps like "McArthur" survive). Applied to the full-name
  inputs on Signup, OAuth complete-profile, Admin → Users edit, and Settings.
- **Watermark** — `components/Watermark.jsx` text is now **"Designed & Developed by
  Adarsh Sharma | 25 Carat Ventures"** (still hidden for the super_admin).
- **Global font → SN Pro** — the Google-Fonts `<link>` in `client/index.html` and
  the `body` `font-family` in `styles.css` now load **SN Pro** (variable weights
  400–800) in place of Inter. It's a genuine Google Fonts family
  (`fonts.google.com/specimen/SN+Pro`).
- Verified 2026-07-21: fresh migration on the existing DB (columns + slot index,
  0 FK violations); unique-index rejects a 2nd owner/2nd resident while allowing one
  of each; occupancy endpoint + server boot OK; client build clean; SN Pro CSS
  returns 200. Sections 1–5 of the request (dependent House No., staged signup,
  disposable-email/MX OTP, complaint image upload, Lost & Found) were already built
  earlier and were re-confirmed present, not rebuilt.

## Installable PWA — standalone home-screen launch (added 2026-07-21)

Added to the home screen on mobile, the app now launches **standalone** (no browser
address bar / chrome), like a native app.

- `client/public/manifest.webmanifest` — `display: standalone`, `start_url`/`scope`
  `/`, name/short_name, theme+background `#eaf1ff`, and PNG icons (192, 512, plus a
  512 **maskable** with safe-zone padding for Android's adaptive shapes). Linked from
  `client/index.html`.
- **iOS** ignores the manifest's display mode, so `index.html` also carries
  `apple-mobile-web-app-capable` / `mobile-web-app-capable` = yes, a status-bar-style,
  an `apple-mobile-web-app-title`, and an opaque 180×180 `apple-touch-icon.png`.
- **Icons**: generated from `imgs/logo.png` (2048², 5.2 MB — far too heavy to ship as
  an icon) into `client/public/imgs/icon-{192,512}.png`, `icon-maskable-512.png`,
  `apple-touch-icon.png` (all ≤ ~470 KB). The favicon + apple-touch links now point at
  these instead of the giant logo. logo.png is still used for the in-app brand/auth
  headers (unchanged). Icons were produced with `sharp` run transiently from the
  scratchpad — it is NOT a project dependency; re-run only if the logo changes.
- Served by the existing `express.static(client/dist)` (before the SPA catch-all), so
  `/manifest.webmanifest` (Content-Type `application/manifest+json`) and `/imgs/*`
  resolve directly. Verified 2026-07-21: build emits all assets, endpoints return 200
  with correct types.

## Key invariants (enforce on any change)

- **RBAC lives on the API**, not just the UI. Roles: super_admin (hidden, all-powerful),
  admin, office_bearer (12 named slots, each with a granted `permissions` set), supervisor
  (maintenance | cleaning), resident. `super_admin` passes every `requireRoles` gate;
  admin/super_admin implicitly hold every office-bearer permission.
  - Module actions (notices, events, gallery, classifieds, complaints, dues, lost & found
    moderation) are gated by `requirePermission(...)` — office bearers act only where granted;
    admins/super_admin always pass. Classifieds still 403s for anyone without `manage_classifieds`.
  - Approvals + Admin + user management + automations + extensions: admin + super_admin only.
  - The super_admin account is secret: hidden from the Users list and unmanageable (404) by
    anyone who isn't the super_admin.
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

- Audit-log pagination + date filtering (currently caps at 250 newest, text search only)
- Complaint comments/updates thread; notice editing
- Pagination for large lists (dues admin list currently caps at 500)
- PWA offline support (service worker / caching) — the manifest + standalone launch
  are done; there's no service worker yet, so no offline mode or install prompt event.
