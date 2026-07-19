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

`.env` holds JWT_SECRET, PORT, SOCIETY_UPI_VPA, SOCIETY_UPI_PAYEE_NAME, ADMIN_SEED_* (see .env.example).
SQLite DB + uploads live in `data/` (override with DATA_DIR for persistent hosting).

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
  pages/           Login, Signup, Home, Complaints, Dues, Notices, Classifieds, Approvals,
                   Admin, LostFound, Events, Gallery, Settings
```

## Key invariants (enforce on any change)

- **RBAC lives on the API**, not just the UI. Roles: admin, office_bearer (12 named slots),
  supervisor (maintenance | cleaning), resident.
  - Classifieds: admin + office_bearer ONLY (residents/supervisors get 403 and no menu item).
  - Approvals + Admin + user management + automations + payment verification: admin only.
  - Cleaning supervisor sees ONLY `park_cleaning`, `drainage_cleaning`, `road_garbage_pickup`
    complaints; maintenance supervisor sees everything EXCEPT those (see CLEANING_CATEGORIES
    in server/config.js).
- **Approval chain**: every signup (any role, admin included) starts `pending` and cannot log in.
  Only admins approve; self-approval is blocked; `ensureSeedAdmin()` promotes/creates the env-seeded
  admin whenever zero approved admins exist, so the chain can never dead-lock.
  Approvals screen shows filled office-bearer/supervisor slots (informational, not hard-capped).
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
