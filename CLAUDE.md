# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"My Suncity Vistaar" — residential society management web app. Express + better-sqlite3 API (root package, CommonJS) with a React 18 + Vite SPA in `client/` (ESM). Single-process deployment: the server serves the built SPA from `client/dist` plus `/uploads`, and everything under `/api/*` is the JSON API.

`CONTEXT.md` is the living project doc — build status, feature history, dev account credentials, and planned next steps. Read it before starting work and update it when features land. Features listed there as "deferred by design" (AI chatbot, push notifications, real payment gateway, etc.) must not be built.

## Commands

```
npm install && npm --prefix client install   # once
npm run build            # vite-build the client into client/dist
npm start                # serve API + built SPA on PORT (default 4000)

# Dev with hot reload (two terminals):
npm run dev              # server on 4000
npm run dev:client       # Vite on 5173, proxies /api and /uploads to 4000

node server/seed-office-bearers.js   # one-time seed of the 12 office-bearer accounts
```

There is no test framework or linter configured. `.env` (see `.env.example`) holds `JWT_SECRET`, `PORT`, `SOCIETY_UPI_*`, `ADMIN_SEED_*`. SQLite DB and uploads live in `data/` (override with `DATA_DIR`).

## Architecture

- `server/config.js` — env + the single source of truth for role/category constants (`ROLES`, `OFFICE_BEARER_ROLES`, `CLEANING_CATEGORIES`, complaint/notice categories). `client/src/constants.js` mirrors these for UI display (emoji, chip tones, role-gated `MENU`); keep the two in sync when adding categories.
- `server/db.js` — schema as idempotent `CREATE TABLE IF NOT EXISTS` statements, migrations (e.g. `migrateUsersUsername` users-table rebuild), and `ensureSeedAdmin()`. better-sqlite3 is synchronous — DB calls are plain, no async/await.
- `server/middleware/auth.js` — `sign` (7-day JWT), `authRequired` (re-fetches the user and re-checks `status = 'approved'` on every request, so revocation is immediate), `requireRoles(...)`.
- `server/routes/*` — one file per module: auth, approvals, users, complaints, notices, dues (incl. payments + overdue watch), extensions, automations, classifieds, lostfound, events, gallery. Mounted in `server/index.js`.
- `server/cron.js` — daily 01:10 job (overdue sweep + dues automation runner); also runs at boot and is idempotent.
- `server/lib/uploads.js` — multer disk storage to `DATA_DIR/uploads`, images only, 5 MB cap (the global error handler in `index.js` maps MulterError to 400).
- `server/lib/dates.js` — local-time `YYYY-MM-DD` date strings. Note: SQLite `datetime('now')` timestamps are UTC; the client's `fmtDateTime` compensates by appending `Z`.
- `client/src/api.js` — fetch wrapper: attaches the JWT from localStorage, on 401 clears it and redirects to `/login`. `client/src/auth.jsx` is the AuthProvider context; `client/src/hooks.js` has `useFetch(path)`.
- `client/src/components/Glass.jsx` + `Layout.jsx` — the "Liquid Glass" design system (GlassCard/Btn/Chip/Field/Sheet, framer-motion drawer). New pages should compose these, not invent new styling.

## Auth model (two login paths)

1. Phone + password at `/login` (`POST /api/auth/login`) — admin, residents, supervisors.
2. Office bearers: username + password at the **hidden** route `/ob/login` (`POST /api/auth/ob-login`). Intentionally not linked from any page or menu — keep it that way. Both paths issue the same JWT, so all RBAC middleware applies unchanged. The OB login returns a single generic error for all failures (no username enumeration), does a dummy bcrypt compare for unknown usernames, and rate-limits in memory (10 attempts / 15 min / IP).

`users.phone` and `users.username` are both nullable + UNIQUE — a user has one or the other.

## Invariants (enforce on any change)

- **RBAC lives on the API**, not just the UI. Hiding a menu item is never sufficient; the route must check roles. Roles: `admin`, `office_bearer` (12 named slots), `supervisor` (`maintenance` | `cleaning`), `resident`.
  - Classifieds: admin + office_bearer only (others get 403).
  - Approvals, Admin page, user management, automations, payment verification: admin only.
  - Cleaning supervisors see only the `CLEANING_CATEGORIES` complaints; maintenance supervisors see everything except those.
  - Notices with `admin_only=1` are visible to admins only; only admins can set the flag.
- **Approval chain**: every signup (any role, including admin) starts `pending` and cannot log in. Only admins approve; self-approval is blocked. `ensureSeedAdmin()` promotes/creates the env-seeded admin whenever zero approved admins exist, so the chain can never dead-lock.
- **Dues**: UPI QR is generated client-side (`upi://pay?...&tr=DUE{id}`); resident submits a UTR, admin verifies/rejects. Automation dedupe relies on the partial unique index on `(automation_id, user_id, period_key)`. Extension requests are capped at 5 days total per due (summed over pending + approved), enforced server-side.
