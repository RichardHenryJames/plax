# Plax — Supabase Setup / Recovery Runbook

> **Status on 10 October 2026: the account service is down, and it is not an app bug.** The Supabase project
> the website and the app use, `dushouwvwnuxdfumnxzf` (created 10 July 2026), no longer resolves in DNS, and
> `/news/api/keep-alive` answers `500 fetch failed`. `bueyaovwrntyfvnlxdlz`, an earlier project named further
> down, does not resolve either. Until a project is restored or recreated, **Continue with Google** shows
> "Sign-in is temporarily unavailable" on the website and in the Android app (every version, 1.3.1 included).
> Public reading is unaffected: the website and the app both work signed out.
>
> **No app update and no code change brings it back.** The app asks the website where the accounts live
> (step 1 under *The Android app's optional sign-in*), so once a working project is behind the website, installed
> apps sign in without being updated.

## Why it most likely happened

A free Supabase project pauses after 7 days without activity, and a paused project's address stops resolving.
`vercel.json` runs a daily cron against `/news/api/keep-alive` to prevent that. From the commit and deployment history
(the dashboard itself is not visible from the repository): when the site moved under `/news` on 31 July the cron kept
calling `/api/keep-alive` and got a 404; its fix (`638d2cc`) could not be deployed until 9 October because
`vercel.json` carried a key Vercel rejects, and in between the project went idle and paused. The cron is correct now.
It keeps a *working* project awake; it cannot wake a paused one.

## What to do

> I cannot do this part for you: it needs your Supabase dashboard (and, for a new project, your Google Cloud console).
> Option A takes about a minute if the project is still restorable; Option B about ten minutes. Afterwards run the
> check at the end of this file. It tells you exactly what is still wrong, if anything is.

---

## Option A — Restore the project the website points to (about a minute)
1. Go to https://supabase.com/dashboard/project/dushouwvwnuxdfumnxzf. That is the project named in the website's
   environment variables (its address is `NEXT_PUBLIC_SUPABASE_URL`).
2. Click **Restore project**. A paused free project can be restored for 90 days after it paused; the dashboard's
   "No backups found" is normal on the free plan (it has no scheduled backups) and does not stop a paused project from
   being restored. If it says the project cannot be restored, or it no longer exists, do Option B.
3. Wait a few minutes until the project is healthy. The address and keys are unchanged, so nothing changes on Vercel.
4. Open **SQL Editor**, paste all of [`supabase-schema.sql`](./supabase-schema.sql) and run it again. It is safe to repeat,
   and the current version closes a hole in the reading-streak function that the old one had (see *Schema fix of
   10 October 2026* below).
5. Run `.\scripts\check-accounts.ps1` (see *Check that it works*).

If the dashboard only has `bueyaovwrntyfvnlxdlz`: restoring it gives a different address and different keys, so
after step 4 do Option B's steps 3, 6 and 7 with that project's keys and redeploy.

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
- A new project may show a **publishable** key (`sb_publishable_…`) and a **secret** key (`sb_secret_…`) instead.
  Use them for the same variables: the Android app's key check accepts both shapes and the website only passes the
  value on. I could not try a real publishable key, so if sign-in fails with one, use the legacy anon key if your
  project still offers it, and run the check at the end of this file.

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
  - Redeploy (`NEXT_PUBLIC_*` values are built into the site, so a redeploy is what makes them live).
- **Local** → `.env.local` (gitignored) — same three vars for `npm run dev`.

### 8. Check it
- Run `.\scripts\check-accounts.ps1` (see *Check that it works*), then sign in once from the app.

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
   The `…/news/auth/app**` entry in step 6 is what lets Supabase send the browser back to that page; without it
   Supabase falls back to the Site URL and the sign-in never reaches the app.
4. `/news/auth/app` (`src/app/auth/app/route.ts`) answers with a redirect to
   `<scheme>://auth-callback?code=…`, for the two known app schemes only
   (`com.plaxlabs.news`, `com.plaxlabs.news.preview`) and forwarding only the standard
   `code` / `error*` fields.
5. The app exchanges the code with `POST <url>/auth/v1/token?grant_type=pkce` using its
   private verifier, and keeps the session sealed by the Android Keystore.

## Check that it works

```powershell
.\scripts\check-accounts.ps1
```

It reads `/news/api/auth-config` from the live website, as the app does, then checks that project and prints a fix next
to anything that fails: the address resolves, the auth service answers, Google sign-in is on, new readers may sign up,
the sign-in address leads to Google with a client id, the tables exist and are invisible to anyone who is not signed
in, the reading-streak function is closed to strangers, and the website's keep-alive reaches the database. It stops
at the first problem that makes the rest meaningless (today: the address does not resolve). Exit code 0 means every
check passed.

What it cannot check, because it needs a browser and your Google account, you do once by hand:
- In the app: **⋮ → Account → Continue with Google**, choose an account, and you land back in Plax signed in. If Google
  shows `redirect_uri_mismatch`, the callback address the script printed is missing from the Google client's Authorized
  redirect URIs (step 5); if you end on the website instead of in the app, the `…/news/auth/app**` entry in step 6 is
  missing.
- Choose topics in the app and confirm `user_profiles.selected_topics` changes; save a story and confirm a row in
  `bookmarks` (it keeps only the id, title, category and the first 500 characters, so a story restored on another phone
  has no link or picture).

## Schema fix of 10 October 2026

`update_reading_streak(p_user_id)` is `SECURITY DEFINER`, which bypasses row-level security, and the old version never
checked who was calling. On a real database anyone holding only the public anon key (it is in the website and in
`/news/api/auth-config`) could change another reader's `reading_streak` and `last_read_at` by passing their id. The
function now refuses any caller who is not that reader and is no longer executable by the anonymous role. **A restored
project still has the old function until `supabase-schema.sql` is run again**, which is why Option A includes that
step. The check above fails until it has been done.

## Testing without the live project

`scripts/auth-stack` starts the real Supabase services on this machine (Postgres, GoTrue, PostgREST, Kong and a mail
catcher; needs Docker), loads `supabase-schema.sql` into it and keeps everything on `127.0.0.1`:

```powershell
.\scripts\auth-stack\up.ps1          # about two minutes the first time
.\scripts\check-accounts.ps1 -Url http://127.0.0.1:54321 -AnonKey <ANON_KEY from scripts\auth-stack\.env> -SkipSite
$env:PLAX_LOCAL_STACK = "$PWD\scripts\auth-stack\.env"      # then the Android test in android\README.md runs against it
.\scripts\auth-stack\down.ps1        # removes containers, volume and the generated secrets
```

Setting `$env:GOOGLE_ENABLED = 'false'` or `$env:DISABLE_SIGNUP = 'true'` before `up.ps1` (or before re-creating the
`auth` container) shows how the check reports a half-configured project. The only thing this cannot run is Google's own
consent screen.

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
- **"Sign-in is temporarily unavailable" in the app** → the app shows this for any failure before it opens the browser:
  the project address does not resolve, the service answers with an error, or Google sign-in is switched off in the
  project. Run `.\scripts\check-accounts.ps1`; it says which.
- **`ERR_NAME_NOT_RESOLVED` / redirect to a dead `*.supabase.co`** → the project is paused or deleted, or the env vars
  still point at an old one. See the top of this file, then re-check step 7 and redeploy.
- **"redirect_uri_mismatch"** → the Supabase callback URL isn't in the Google client's
  Authorized redirect URIs (step 5), or Site/Redirect URLs missing (step 6).
- **Signed in but no profile row** → the `handle_new_user` trigger didn't run; re-run
  `supabase-schema.sql` (step 2) — it's idempotent.
- **Sign-in button never appears** → fixed in code: the app now degrades to signed-out mode
  if Supabase is unreachable (previously it hung on a loading state).

The app fully works signed-out (feed, topics, bookmarks, activity are stored locally); sign-in
only adds cross-device cloud sync.
