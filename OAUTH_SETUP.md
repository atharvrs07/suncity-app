# OAuth sign-in setup (Google, Microsoft, Apple)

My Suncity Vistaar supports social sign-in for **Google**, **Microsoft (Entra
ID)**, and **Apple**, in addition to the existing phone/password and email-OTP
flows. It uses a **server-side OAuth 2.0 Authorization Code flow**: the browser
is redirected to the provider, the provider redirects back to the Express
server, the server verifies the provider's ID token and issues the app's own JWT
— the same session token everything else uses, so all RBAC is unchanged.

Because this is a **web app** (not a native/Expo mobile app), you register a
**Web** application and a **redirect URI / JavaScript origin** with each
provider — there are no iOS/Android bundle IDs to configure.

## How it behaves before you add credentials

Nothing to do to keep things working: every provider is **off** until its
environment variables are filled in. A provider with blank credentials shows no
button and its endpoints return 404. Add one provider at a time as you get its
credentials.

## The one redirect URI you register everywhere

For each provider, register exactly this callback (substitute your real origin,
i.e. your `APP_BASE_URL`):

```
<APP_BASE_URL>/api/auth/oauth/<provider>/callback
```

Examples (production):

- `https://your-domain.example/api/auth/oauth/google/callback`
- `https://your-domain.example/api/auth/oauth/microsoft/callback`
- `https://your-domain.example/api/auth/oauth/apple/callback`

For local testing (Google & Microsoft only — see the Apple note):

- `http://localhost:4000/api/auth/oauth/google/callback`
- `http://localhost:4000/api/auth/oauth/microsoft/callback`

> **Important:** `APP_BASE_URL` in `.env` must be the exact public origin that
> serves the app, because the login-complete redirect and the provider redirect
> URI are built from it. Test OAuth against a build (`npm run build && npm start`
> on `http://localhost:4000`) rather than the split Vite dev origin (`:5173`),
> since the flow finishes by redirecting to `APP_BASE_URL/oauth/callback`.

After the redirect returns, brand-new accounts are sent to a **"Complete your
profile"** step that collects the mandatory fields OAuth can't supply — **phone,
flat/house number, and block** — before the resident account is created. (Name
and email come from the provider; email is used to link to an existing account
if one already has that address.)

---

## 1. Google

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) → create
   or pick a project.
2. **APIs & Services → OAuth consent screen**: configure it (External), add your
   app name, support email, and the scopes `openid`, `email`, `profile`. Add
   yourself as a test user while it's unverified.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized redirect URIs**: add
     `<APP_BASE_URL>/api/auth/oauth/google/callback` (and the localhost one for
     dev).
4. Copy the **Client ID** and **Client secret** into `.env`:
   ```
   GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=...
   ```

## 2. Microsoft (Azure / Entra ID)

1. Go to the [Entra admin center](https://entra.microsoft.com/) or Azure Portal
   → **App registrations → New registration**.
2. **Redirect URI**: platform **Web**, value
   `<APP_BASE_URL>/api/auth/oauth/microsoft/callback`.
3. **Supported account types**: choose "Accounts in any organizational directory
   and personal Microsoft accounts" if you want to keep `MICROSOFT_OAUTH_TENANT`
   as `common`; choose single-tenant and set `MICROSOFT_OAUTH_TENANT` to your
   directory (tenant) GUID to restrict sign-in to your organization.
4. **Certificates & secrets → New client secret**: copy the secret **Value**
   (not the ID).
5. From the app's **Overview**, copy the **Application (client) ID**.
6. Fill `.env`:
   ```
   MICROSOFT_OAUTH_CLIENT_ID=<application-client-id>
   MICROSOFT_OAUTH_CLIENT_SECRET=<secret-value>
   MICROSOFT_OAUTH_TENANT=common        # or your tenant GUID
   ```
   (The app requests `openid email profile`; no admin consent is needed for
   those.)

## 3. Apple

Apple is the most involved and **cannot be tested on localhost/http** — it
requires a registered **HTTPS domain**. You'll need an Apple Developer Program
membership.

1. **Certificates, Identifiers & Profiles → Identifiers**:
   - Create/confirm an **App ID** (or Services ID grouping) and enable **Sign in
     with Apple**.
   - Create a **Services ID** (this is your OAuth `client_id`). Under its **Sign
     in with Apple → Configure**:
     - **Domains and Subdomains**: your domain (e.g. `your-domain.example`).
     - **Return URLs**: `https://your-domain.example/api/auth/oauth/apple/callback`
       (must be HTTPS).
2. **Keys → Create a key**, enable **Sign in with Apple**, download the `.p8`
   file (you can only download it once). Note its **Key ID**.
3. Find your **Team ID** (top-right of the developer portal / membership page).
4. Fill `.env`:
   ```
   APPLE_OAUTH_SERVICES_ID=com.your-domain.suncity.web   # the Services ID
   APPLE_OAUTH_TEAM_ID=XXXXXXXXXX
   APPLE_OAUTH_KEY_ID=YYYYYYYYYY
   APPLE_OAUTH_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
   ```
   The server signs Apple's required client-secret JWT (ES256) from this key
   automatically — you don't generate the secret yourself. Newlines in the key
   can be real newlines or escaped as `\n`.

> Apple returns the user's **name only on the first authorization**, so if you
> revoke and re-test, the name may come back blank — that's expected, and the
> "Complete your profile" step lets the user (re)enter it.

---

## Testing checklist

Run a build so the API and SPA share one origin:

```
npm run build && npm start        # http://localhost:4000
```

- [ ] Google/Microsoft button appears on **/login** and **/signup** once its
      env vars are set (restart the server after editing `.env`).
- [ ] Clicking it redirects to the provider, then back; a **new** email lands on
      "Complete your profile" (phone + flat + block required) and cannot finish
      until all are filled.
- [ ] Finishing creates an **approved** resident and logs straight in; the admin
      Users list shows them with their block.
- [ ] Signing in again with the same provider account logs straight in (no
      profile step).
- [ ] An OAuth email that matches an existing password account links to it and
      signs in.
- [ ] Apple: same flow on the deployed HTTPS host.
