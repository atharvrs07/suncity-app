# Deployment & data persistence

**The one rule that matters:** the SQLite database and uploaded photos live in a
single directory (`DATA_DIR`). That directory **must be a persistent volume that
survives redeploys**. If it isn't, every deploy starts from an empty database and
all accounts, complaints, dues, Lost & Found, classifieds, etc. are lost.

The app writes everything to:

```
$DATA_DIR/suncity.db        # all data (accounts + every module)
$DATA_DIR/uploads/          # uploaded images
```

`DATA_DIR` defaults to `./data` **inside the app folder** (see `server/config.js`).
On most hosts the app folder is wiped and rebuilt on every deploy, so the default
is only safe for local development. In production you MUST set `DATA_DIR` to a
mounted persistent disk.

Nothing about a normal deploy is destructive on its own: the schema is created
with `CREATE TABLE IF NOT EXISTS`, migrations are guarded/idempotent, and the seed
admin is only (re)created when zero approved admins exist. Data is lost *only* when
the underlying files disappear — i.e. when `DATA_DIR` is not persistent.

---

On boot the server prints where it's storing data and whether that location is
safe, e.g.:

```
Data directory (DATA_DIR): /home/u123456789/suncity_data
✓ DATA_DIR is outside the app folder — data will persist across deploys.
```

If instead you see `⚠️ DATA_DIR is INSIDE the app folder …`, the fix below isn't
applied yet.

---

## Set up a persistent `DATA_DIR` on your platform

### Hostinger — managed Node.js hosting (hPanel, not VPS)  ← your setup

On Hostinger's managed Node.js hosting the disk itself is persistent, but your
**app directory is replaced when you redeploy** (re-upload / Git deploy), and a
`.env` file sitting inside it can be wiped along with it. That's why accounts
disappear on each roll-out — the database lives in `app/data/`, which gets
replaced. Two changes fix it permanently:

1. **Create a data folder OUTSIDE the app directory**, in your account's home.
   Use hPanel → **File Manager** (or the Terminal if your plan has one) to make a
   folder like `suncity_data` at the top of your home directory (the same level as
   `domains/`, not inside your site folder). If you have terminal access,
   `echo $HOME` shows your home path (e.g. `/home/u123456789`).
2. **Set environment variables in the Node.js app settings**, NOT in a `.env`
   file inside the app. In hPanel open your website → **Node.js** ("Setup Node.js
   App") → **Environment variables**, and add:
   - `DATA_DIR` = `/home/uXXXXXXXXX/suncity_data`  (the folder from step 1, full path)
   - `JWT_SECRET` = a long random string
   - `ADMIN_SEED_PHONE`, `ADMIN_SEED_PASSWORD`, `ADMIN_SEED_NAME`
   - `APP_BASE_URL` = `https://your-domain`
   - `GMAIL_USER`, `GMAIL_APP_PASSWORD` (if using email/OTP)
   - `SOCIETY_UPI_VPA`, `SOCIETY_UPI_PAYEE_NAME`

   Variables set here persist across redeploys; a `.env` file in the app folder
   may not, so prefer the panel.
3. **Restart the app** and check the logs for the `✓ DATA_DIR is outside the app
   folder` line. Done — data now survives every future deploy.

Because the new `DATA_DIR` starts as an empty folder, the app initialises a fresh
database there (no complaints, just the fallback admin). Run
`npm run seed:office-bearers` once to recreate the 12 office-bearer logins. If you
instead want to carry over the current database, copy its `suncity.db` into the
new folder (File Manager) before starting the app.

### Render
1. Dashboard → your service → **Disks** → **Add Disk**.
   - Name: `data`  ·  Mount Path: `/var/data`  ·  Size: 1 GB is plenty to start.
2. **Environment** → add `DATA_DIR=/var/data`.
3. Redeploy. The disk (and your data) now persists across every future deploy.

### Railway
1. Service → **Variables** → add `DATA_DIR=/data`.
2. Service → **Settings → Volumes** → **New Volume**, mount path `/data`.
3. Redeploy.

### Fly.io
1. `fly volumes create suncity_data --size 1` (creates a persistent volume).
2. In `fly.toml`:
   ```toml
   [env]
     DATA_DIR = "/data"

   [[mounts]]
     source = "suncity_data"
     destination = "/data"
   ```
3. `fly deploy`.

### Docker / VPS (docker run or compose)
Mount a host directory (or named volume) and point `DATA_DIR` at it:
```bash
docker run -d \
  -e DATA_DIR=/data \
  -e JWT_SECRET=... -e APP_BASE_URL=https://your-domain \
  -v suncity_data:/data \
  -p 4000:4000 your-image
```
The included `.dockerignore` ensures the local `data/` folder is **not** baked into
the image (which would otherwise overwrite the live database on each deploy).

### Bare metal / PM2 / systemd
Just set `DATA_DIR` to a stable path outside the deploy directory, e.g.
`DATA_DIR=/srv/suncity/data`, and deploy new code beside it without touching that
folder.

---

## Migrating data you already have

If real accounts/data were created before the disk was attached, that data was on
the old ephemeral filesystem and is unfortunately already gone. Once the persistent
disk is in place, data created from then on is safe. To copy an existing
`suncity.db` onto a new disk, use your platform's shell/SFTP to place the file at
`$DATA_DIR/suncity.db` before starting the app.

---

## Starting from a clean slate (fresh launch)

To clear leftover test data (e.g. demo complaints) once persistence is set up, run
the reset script **on the host, with the same `DATA_DIR` the app uses**:

```bash
npm run reset-data                             # DRY RUN — just prints current counts
npm run reset-data -- --yes --complaints-only  # remove ONLY complaints, keep the rest
npm run reset-data -- --yes                    # clear all content, KEEP accounts
npm run reset-data -- --yes --wipe-users       # also delete every account
```

- Content = complaints, notices, dues, payments, extensions, classifieds, lost &
  found, events, gallery, in-flight signup OTPs / reset tokens, and their uploaded
  images.
- Keeping accounts preserves the admin, the 12 office-bearer logins, and residents.
- After `--wipe-users`, the fallback admin is recreated automatically; re-run
  `npm run seed:office-bearers` to recreate the 12 office-bearer logins.

The script does nothing unless you pass `--yes`, and it can't be undone — take a
copy of `suncity.db` first if in doubt.
