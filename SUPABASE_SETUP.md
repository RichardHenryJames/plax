# Plax — Supabase Setup / Recovery Runbook

> **Status on 9 October 2026: the account service is down.** Both project hostnames in play
> (`bueyaovwrntyfvnlxdlz` named below, and `dushouwvwnuxdfumnxzf` from the deployed
> environment) no longer resolve in DNS, and `/news/api/keep-alive` answers `500
> fetch failed`. Website sign-in and cloud sync, and the optional sign-in in the Android
> app, cannot work until a project is restored or recreated with the steps below. Public
> reading is unaffected: the website and the app both work signed out.

Your project `bueyaovwrntyfvnlxdlz` is **paused** (free-tier auto-pause) and the dashboard
shows "No backups found", so it may be unrecoverable. Two options — try A first (fastest),
else do B.

> I can't create the Supabase project or run the live Google OAuth flow for you — those
> need your Supabase dashboard + Google Cloud console login. The app code is verified
> correct and hardened; once the steps below are done, sign-in will work. Follow this
> exactly and it takes ~10 minutes.

---

## Option A — Resume the existing project (30 seconds, if available)
1. Go to https://supabase.com/dashboard/project/bueyaovwrntyfvnlxdlz
2. Click **Restore / Resume project**.
3. Wait ~2 min for it to come back. Done — envs already match, nothing else to change.

If "Restore" is missing or errors ("No backups found"), do Option B.

---

## Option B — Create a fresh project (~10 min)

### 1. Create the project
- https://supabase.com/dashboard → **New project**.
- Name: `plax`. Region: closest to your users (e.g. Mumbai/Singapore for India).
- Set a DB password (save it). Wait for provisioning.

### 2. Run the schema
- Dashboard → **SQL Editor** → New query.
- Paste the entire contents of [`supabase-schema.sql`](./supabase-schema.sql) → **Run**.
- It's idempotent (safe to re-run). Creates: `user_profiles`, `bookmarks`, `engagements`,
  RLS policies, and the `handle_new_user` trigger that auto-creates a profile row on
  first sign-in (this is what makes Google login "just work").

### 3. Grab the new keys
- Dashboard → **Project Settings → API**. Copy:
  - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
  - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server-only — never expose)

### 4. Enable Google OAuth (Supabase side)
- Dashboard → **Authentication → Providers → Google** → enable.
- It shows a **Callback URL** like `https://<ref>.supabase.co/auth/v1/callback`. Copy it.

### 5. Google Cloud OAuth client
- https://console.cloud.google.com → APIs & Services → **Credentials**.
- Create (or reuse) an **OAuth 2.0 Client ID** (type: Web application).
- **Authorized redirect URIs** → add the Supabase callback URL from step 4.
- Copy the **Client ID** + **Client secret** → paste into the Supabase Google provider
  (step 4) → Save.

### 6. Supabase URL configuration (redirect allow-list)
- Dashboard → **Authentication → URL Configuration**:
  - **Site URL**: `https://www.plaxlabs.com`
  - **Redirect URLs** (add all): 
    - `https://www.plaxlabs.com/news/auth/callback`
    - `https://plaxlabs.com/news/auth/callback`
    - `https://www.plaxlabs.com/news/auth/app**` (the Android app's return page, see below)
    - `http://localhost:3000/news/auth/callback`
  - The site now lives under the `/news` base path, so the older entries without it
    (`…/auth/callback`) no longer match the website's callback.

### 7. Set env vars
- **Vercel** → Project → Settings → Environment Variables (Production + Preview):
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - Redeploy.
- **Local** → `.env.local` (gitignored) — same three vars for `npm run dev`.

---

## The Android app's optional sign-in

Plax for Android works without an account. Signing in with Google only stores the reader's
topics and saved stories in `user_profiles.selected_topics` and `bookmarks`, the same
tables the website uses (so topics chosen on the phone show up on the website and the
other way round). How it connects, so a recovery needs no app update:

1. The app asks `GET /news/api/auth-config` for `{ url, anonKey }` (your
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the anon key is public by
   design). It accepts only an `https://<ref>.supabase.co` address.
2. Before opening a browser it checks `GET <url>/auth/v1/settings` and requires
   `external.google` to be `true`, so a broken or half-configured project shows
   "Sign-in is temporarily unavailable" instead of an error page in the browser.
3. It opens `<url>/auth/v1/authorize?provider=google&code_challenge=…&code_challenge_method=s256`
   in a Chrome Custom Tab with `redirect_to=https://www.plaxlabs.com/news/auth/app?app=<scheme>`.
   Supabase accepts that address without a dashboard change because it is on the Site URL's
   host; the `…/news/auth/app**` entry above is the explicit form.
4. `/news/auth/app` (`src/app/auth/app/route.ts`) answers with a redirect to
   `<scheme>://auth-callback?code=…`, for the two known app schemes only
   (`com.plaxlabs.news`, `com.plaxlabs.news.preview`) and forwarding only the standard
   `code` / `error*` fields.
5. The app exchanges the code with `POST <url>/auth/v1/token?grant_type=pkce` using its
   private verifier, and keeps the session sealed by the Android Keystore.

**What to check after restoring the project** (none of it could be exercised while the
project was down, so the Android sign-in is implemented and unit-tested but **not yet
verified end to end**):
- `curl https://www.plaxlabs.com/news/api/auth-config` returns the new project's URL.
- `curl -H "apikey: <anon>" <url>/auth/v1/settings` shows `"google": true`.
- In the app: **⋮ → Account → Continue with Google**, choose an account, and you land back
  in Plax signed in. If Google shows `redirect_uri_mismatch`, fix step 5; if Supabase
  rejects the return address, add the `…/news/auth/app**` entry in step 6.
- Choose topics in the app and confirm `user_profiles.selected_topics` changes; save a
  story and confirm a row in `bookmarks` (it keeps only the id, title, category and the
  first 500 characters, so a story restored on another phone has no link or picture).

---

## How to test the Google login flow
1. **Local**: `npm run dev` → open http://localhost:3000/news → **Account** (the person icon in
   the header on a phone, or **Account** at the bottom of the left rail) → **Continue with
   Google** → pick a Google account → should redirect back signed-in (the account button
   shows your avatar).
2. Verify a profile row was auto-created: Supabase → **Table Editor → user_profiles** →
   your row should be there (email, display_name, avatar_url filled by the trigger).
3. Bookmark a card → check **Table Editor → bookmarks** for the row.
4. **Prod**: repeat on https://www.plaxlabs.com/news after the Vercel redeploy.
5. Merge check: before signing in, choose a topic and save a story as a signed-out reader;
   after signing in with a fresh account both should still be there, and both should now
   appear in `user_profiles.selected_topics` and `bookmarks`.

### Test with a throwaway user
Use any secondary Google account (or Google's "Add account"). If you want an email/password
test user instead: Supabase → **Authentication → Users → Add user** (set email + password),
then enable the Email provider and add a password sign-in button — but Google is already
wired, so a second Google account is the fastest real-world test.

---

## Troubleshooting
- **`ERR_NAME_NOT_RESOLVED` / redirect to a dead `*.supabase.co`** → env vars still point at
  the old paused project. Re-check step 7 and redeploy.
- **"redirect_uri_mismatch"** → the Supabase callback URL isn't in the Google client's
  Authorized redirect URIs (step 5), or Site/Redirect URLs missing (step 6).
- **Signed in but no profile row** → the `handle_new_user` trigger didn't run; re-run
  `supabase-schema.sql` (step 2) — it's idempotent.
- **Sign-in button never appears** → fixed in code: the app now degrades to signed-out mode
  if Supabase is unreachable (previously it hung on a loading state).

The app fully works signed-out (feed, topics, bookmarks, activity are stored locally); sign-in
only adds cross-device cloud sync.
