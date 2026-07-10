# Plax — Supabase Setup / Recovery Runbook

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
    - `https://www.plaxlabs.com/auth/callback`
    - `https://plaxlabs.com/auth/callback`
    - `http://localhost:3000/auth/callback`

### 7. Set env vars
- **Vercel** → Project → Settings → Environment Variables (Production + Preview):
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - Redeploy.
- **Local** → `.env.local` (gitignored) — same three vars for `npm run dev`.

---

## How to test the Google login flow
1. **Local**: `npm run dev` → open http://localhost:3000 → Sign in → Sign in with Google →
   pick a Google account → should redirect back signed-in (avatar shows in the header).
2. Verify a profile row was auto-created: Supabase → **Table Editor → user_profiles** →
   your row should be there (email, display_name, avatar_url filled by the trigger).
3. Bookmark a card → check **Table Editor → bookmarks** for the row.
4. **Prod**: repeat on https://www.plaxlabs.com after the Vercel redeploy.

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
