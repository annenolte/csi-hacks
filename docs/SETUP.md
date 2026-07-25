# Setup

Three things to configure: Anthropic, Supabase, and Google Calendar. The app runs
with only the first two — the calendar connector is optional and degrades to a
"not connected" state on the dashboard rather than breaking anything.

Everything goes in `.env.local`, which is gitignored. Restart `npm run dev` after
editing it; Next reads environment variables at boot.

```bash
cp .env.example .env.local
```

---

## 1. Anthropic API key

Required. The onboarding agent, the website reader, and document synthesis all run
through Claude — without a key, onboarding can't do the thing it exists to do.

Get one at <https://platform.claude.com/settings/keys>, then:

```
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 2. Supabase

I can't create the project for you — it needs your login. Five minutes:

1. Go to <https://supabase.com/dashboard> and **New project**. Any name; pick a
   region near you. Save the database password it asks you to set (you won't need
   it for this app, but losing it is annoying later).
2. Wait for provisioning (~2 minutes).
3. **SQL Editor** → **New query**. Paste the entire contents of
   [`supabase/schema.sql`](../supabase/schema.sql) and hit **Run**. It should
   report success with no rows. The file is idempotent — re-running it after a
   schema change is safe and is how you apply updates.
4. **Project Settings** → **API keys**. Copy three values:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<the anon / publishable key>
SUPABASE_SERVICE_ROLE_KEY=<the service_role / secret key>
```

### About that service role key

It bypasses Row Level Security completely. It is read **only** in server code
(`lib/supabase.js` is marked `server-only`, so importing it from a client component
is a build error rather than a leak). Never prefix it with `NEXT_PUBLIC_` — that
prefix is what tells Next.js to ship a variable to the browser, and shipping this
one hands every visitor full read/write access to every account's data.

The schema enables RLS on every table and defines no policies, so the anon key can
read nothing. That is intentional: this app talks to Supabase only from the server.

---

## 3. Google Calendar (optional)

Gives the business a real, read/write calendar connection — the foundation the
voice agent will book jobs against later. Skip this and the dashboard shows
"Not connected" with a working button that just fails to reach Google.

### Create the OAuth client

1. <https://console.cloud.google.com/> → project dropdown → **New Project**. Name
   it anything; note the project.
2. **APIs & Services** → **Library** → search "Google Calendar API" → **Enable**.
3. **APIs & Services** → **OAuth consent screen**:
   - User type: **External** (unless you have a Google Workspace org, in which
     case Internal is simpler and skips the test-user step).
   - App name, your email for both support and developer contact. Save.
   - **Scopes** → **Add or remove scopes** → paste
     `https://www.googleapis.com/auth/calendar` and
     `https://www.googleapis.com/auth/userinfo.email`. The first is read *and*
     write on calendars; the second is only so the dashboard can show which Google
     account is connected.
   - **Test users** → add your own Google address. While the app is in "Testing",
     only listed users can connect — if you get `Error 403: access_denied`, this is
     almost always why.
4. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client
   ID**:
   - Application type: **Web application**
   - Authorised redirect URI: `http://localhost:3000/api/calendar/google/callback`
   - Create, then copy the client ID and client secret.

The redirect URI has to match **byte for byte** — no trailing slash, right port.
A mismatch gives `Error 400: redirect_uri_mismatch`.

```
GOOGLE_CLIENT_ID=<...>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<...>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/google/callback
```

### When you deploy

Add the production callback (`https://your-domain/api/calendar/google/callback`)
as a second authorised redirect URI in the same OAuth client, and set
`GOOGLE_REDIRECT_URI` to it in the deployed environment. Publishing the consent
screen (moving it out of Testing) requires Google verification for the calendar
scope — plan for that before onboarding anyone who isn't a test user.

---

## 4. Session secret

Signs the session cookie. Any long random string; generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```
SESSION_SECRET=<the output>
```

Changing it later invalidates every existing session — everyone gets signed out,
which is a fine way to force a logout but not something to do casually.

---

## 5. Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, create an account, and go through onboarding.

To start a business over, delete its rows in Supabase (deleting the `accounts` row
cascades to everything else) or just sign up with a different email.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Missing SUPABASE_SERVICE_ROLE_KEY` at boot | `.env.local` not created, or the dev server wasn't restarted after editing it |
| Signup succeeds, dashboard is empty | Schema not applied — re-run `supabase/schema.sql` |
| Onboarding agent replies with an error | `ANTHROPIC_API_KEY` unset or out of credit; the error text in the chat says which |
| `redirect_uri_mismatch` | The URI in Google Cloud doesn't exactly match `GOOGLE_REDIRECT_URI` |
| `access_denied` on the Google consent screen | Your Google account isn't in the OAuth consent screen's test users list |
| The website step can't read a URL | The SSRF guard blocks private/internal addresses on purpose — `localhost` and LAN IPs will never be fetchable |
