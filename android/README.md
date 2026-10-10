# Plax for Android

Standalone native Android news/reading app. This is not a WebView wrapper, and
it does not depend on Vanishr or its signing keys, relay, account data or code.
It reads the Plax public feed (`https://www.plaxlabs.com/news`) and, for the
optional AI brief, the summarize endpoint. It works without an account; signing in
with Google is optional and only syncs your topics and saved stories (see
*Optional sign-in*). About once a day it also asks the website whether a newer build
exists (see *Updates from inside the app*). Apart from sign-in and that update check,
which need the two small routes and the one small file listed under *Backend changes*,
the app works against the backend as it was before this version.

## What is in 1.4.1 (preview, versionCode 7)

A fix to 1.4.0's Share, found by testing the installed, OTA-updated 1.4.0 against the real site.

- **What went wrong.** 1.4.0 waited at most 4 seconds for the site to make a story's page. On the emulator
  the share sheet opened after 4.4 s carrying the *publisher's* link: the app had asked, given up, and fallen
  back, which is the safe outcome but a silent loss of the feature. The site needs 0.3-2.2 s from the
  development machine for a story it has not seen (0.5 s typical for a warm server, more when a sleeping serverless
  instance has to start), plus the phone's own network. Four seconds is not enough for that, and the cases that
  are slow are the ones that lost their page.
- **Waits as long as it takes to be realistic**: 7 seconds (connect 5 s). The "Preparing link..." hint still appears
  after 0.7 s.
- **A reader is never stuck.** Tapping Share again on the same story while it waits means "do not wait": the request
  is abandoned and the publisher's link goes out at once. Tapping Share on a *different* story abandons the first
  and makes the second's link. A request that was given up on is never obeyed if it answers later (each request is
  numbered, and the screen acts only on the current one).
- **The site got faster in the same release.** Saving a page is now one database write that leaves an existing page
  alone, instead of a read and then a write (`share-store.ts`; PostgREST's `ignore-duplicates` answers 201 for a
  duplicate and keeps the original, checked against the real service). The website also waits up to 6 s, shows a
  spinner on Share or Copy, and a second click gives up waiting there too.
- Nothing else changed: no new permission, library or data. 1.4.0 is not altered (a published version never is);
  a phone on 1.4.0 is offered 1.4.1 by the updater.

## What is in 1.4.0 (preview, versionCode 6)

Share a story as a page on Plax, and the same look as the website.

- **Share sends Plax's own page for the story**, not the publisher's article:
  `https://www.plaxlabs.com/news/s/<slug>-<id>`. Pasted into WhatsApp (or anything else that makes link
  previews) it shows a card with the story's headline and a picture Plax draws, and the page itself
  shows a short summary with its source, sends the reader to the publisher for the full report, and
  can be found through the site's sitemap. The message is the headline with the link on its own line.
- **How the app gets the link.** Every story the feed serves now carries `sig`, a signature the server
  made over the story. Share sends the story, exactly as served, to `POST /api/share`; the server
  accepts it only if the signature matches, stores the page and answers with its address. The app
  checks that the answer is a story page of *this* story on the Plax site before using it. The story
  is the only thing sent: nothing about the reader. The design, limits and fallbacks are in
  [TECH.md](../TECH.md#shared-story-pages).
- **Sharing still always works.** A story without a signature (one cached or saved by 1.3.x, or a
  quote), one with no publisher link, a slow or failing server, or a missing network all end the
  same way: the publisher's link is shared, as in 1.3.1. After tapping Share the app waits at most
  4 seconds for the link, says "Preparing link…" if that takes more than 0.7 s, ignores a second tap
  meanwhile, and opens nothing if the screen was left or the app went to the background.
- **Cache and saved format** gained an optional `sig`; an unsigned story writes none, and older
  versions ignore the field, so nothing needs migrating and a downgrade is safe. Stories saved or
  cached by 1.3.x are shared by their publisher's link until the feed hands the app a fresh copy.
- **No new permission, library, tracker or account requirement.**
- **The website now matches the app**, which is the reference: the same header, section chips, card,
  action row, typography (serif headlines, sans text) and theme choice (System by default). The
  differences are deliberate and listed in [TECH.md](../TECH.md#navigation--bottomnavtsx-leftrailtsx-navbartsx-headermenutsx-brandmarktsx).

Needs on the website side: `POST /api/share` and the story pages, deployed with the same push as this
version; an app that cannot reach them falls back as above.

New tests: `ShareLinksTest` (9 JVM tests, including a golden vector shared with the website's unit
tests so the two sides cannot drift apart), and `ShareDeviceTest` (6 tests on the real screen: the
site is asked only for signed stories, the share sheet opens only once the link is made, the
fallback opens it too, a second tap is not a second share, closing the screen abandons the request,
and a link that arrives while the app is in the background opens nothing).

## What is in 1.3.1 (preview, versionCode 5)

One crash fix, found because a run of the device suite that was checking the 1.3.0 updater
died once ("Process crashed" in `appNeedsNoLoginAndSupportsTopicsSavedAndRotation`). It was in
1.2.0 and 1.3.0 too.

- **Leaving a screen while pictures were still loading could close the whole app.** Rotating the
  phone, changing the theme or language, or backing out destroys the screen, and its picture
  loader then interrupts its worker threads. A thread that was still connecting to a picture's
  host got an `InterruptedException` thrown out of OkHttp (written in Kotlin, which does not
  declare it, so the Java code never expected it); nothing caught it and Android ended the
  process. It needs a picture in flight at that moment, so it looked random.
- **How it was shown**: on the emulator, 150 times in a row, three real downloads were started and
  the loader closed up to 40 ms later. Before the fix, 166 uncaught `InterruptedException`s were
  recorded on the `plax-image` threads; after it, none. A picture that is interrupted is now just
  missing, as when the network fails.
- The regression test `aPictureCutOffByAnInterruptIsMissingNotACrash` gives the loader a client that
  throws the same exception: without the fix the loader never answers (and the thread dies), with
  it the picture is reported missing. `ImageLoader` gained a constructor taking the client; the
  app never passes one.

1.3.0 was online for a short while before this and is replaced by 1.3.1 (a published version is
never changed). A phone that installed 1.3.0 is offered 1.3.1 by the updater.

## What is in 1.3.0 (preview, versionCode 4)

Updates from inside the app
- When a newer build is published, the app tells you, so nobody has to hunt for a link.
  The design follows the update flow of the Vanishr app in this workspace, but it is
  Plax's own code, feed and signing key: nothing is shared with Vanishr.
- About once a day while the app comes to the front, and whenever you choose **More
  options > Check for updates**, the app reads one small file,
  `https://www.plaxlabs.com/news/updates.json`, and compares its `versionCode` with the
  installed one. If the website has a newer build that this phone can run, **Update
  available** offers **Later** or **Download**. **Download** opens the APK in the
  browser, which saves it; opening the file makes Android ask you to confirm the install
  (the first time it also asks you to allow installs from that browser). The update
  installs over the current copy because it is signed with the same key, so saved
  stories, the seen history and topics stay on the phone. **Plax never installs
  anything by itself.**
- **Expect warnings from Android and Google Play Protect.** The preview is not distributed
  through Google Play and its signing key is unknown to Google, so a phone with Play Protect
  on can stop the installation with **App blocked to protect your device: Play Protect hasn't
  seen an app from this developer before**. It is not final: **More details > Install anyway**
  completes the update (this is what happened on the test emulator, see *Verification*). The
  app cannot skip these screens and its dialog does not describe them, so anyone asked to
  update should be told about them. Whether a different signing key or a Google Play release
  removes the warning has not been tried.
- **Later** (or dismissing the dialog) hides that version for 24 hours; **Check for
  updates** still shows it. A newer version than the one dismissed is offered at once.
- The dialog never appears over an open sheet, dialog or a sign-in that is waiting; it
  waits for the next time you return to the app. Rotating the phone does not lose it. A
  tap on **Check for updates** says *Plax is up to date* or *Cannot check for updates
  right now* when there is nothing to offer, and **a check that fails counts as the
  day's check** (opening the app offline does not retry until tomorrow; the manual item
  always works).
- **The feed is treated as untrusted input.** It has exactly seven fields
  (`schemaVersion`, `versionCode`, `versionName`, `minSdk`, `apkUrl`, `sha256`, `size`) and at most 4,096 bytes;
  anything unknown, repeated, missing, mistyped or out of range is ignored. The APK address
  must be exactly `https://www.plaxlabs.com/news/plax-<versionName>.apk` (so the file can
  only live on the Plax website), the size is capped at 95 MiB and a build whose
  `minSdk` is above this phone's is not offered. The request is HTTPS only, follows no
  redirect, keeps no cookie or cache, is not retried and sends no identifier; like any
  HTTPS request it exposes your IP address and OkHttp's default User-Agent.
- **What guards the installation**: the HTTPS connection to `plaxlabs.com` and Android's
  rule that an update must carry the signature of the installed app. As in Vanishr, the
  checksum in the feed is **not** checked inside the app (the download happens in the
  browser); it is for people and for `verify-update.ps1`.
- A **store build** (the `release` build type, or `-PplayStore=true`) has no updater at
  all: the menu item says **Open Google Play** and opens the store page instead. The
  preview build (website installs) has `PLAY_STORE=false`.
- Only the preview package is ever offered an update; the `release` package is the store
  build and updates through Google Play.

How an update reaches people is described under *Publishing an update*. **1.2.0 and
earlier cannot update themselves**: install the current build (1.3.1) by hand once (it installs
over 1.2.0 because the debug key is the same); every later version arrives through the app.

## What was in 1.2.0 (versionCode 3)

No repeats
- **Stories you have looked at do not come back** when you reopen the app, and one
  event reported by several outlets is shown once. A story counts as seen after
  about a second on screen (half a second if you swipe on). The history (at most
  1,500 stories; news kept 30 days, everything else 7) lives on the phone as, per
  story, its id, a lower-case headline key of at most 160 characters and two times,
  never the story text.
- The rules are shared with the website: `src/lib/story-engine.ts` in the Plax
  repository is a port of `Similarity`, `SeenStore` and `FeedMerge` here, with the
  same constants. One event worded differently by two outlets is recognised from its
  distinctive headline words and publish times; identical headlines count as one
  event only when they are timely or exactly equal.
- When everything new has been seen, a **You're all caught up** card offers **Check
  for new stories** and **Read N earlier stories**. Reaching the end first asks the
  server for older pages (up to three, excluding what is loaded or recent) before it
  says there is nothing new.
- Newer stories found while you read appear behind **New stories** instead of
  moving the card; away for 2 minutes, the feed quietly looks for newer ones; away
  for 30 minutes, it starts again from the newest.

For you
- Four tabs: **Feed**, **For you**, **Topics**, **Saved**. For you mixes the topics
  you choose (a card on that tab, or More options > Your topics). Nothing has to be
  chosen first: the app opens on public news. The wording and layout match the
  website.

Optional sign-in
- More options > **Account** > **Continue with Google**. The system browser (a
  Chrome Custom Tab) signs in with Google through the Plax account service using
  PKCE, returns through the website's `/news/auth/app` page into the app
  (`com.plaxlabs.news.preview://auth-callback`; the release package uses
  `com.plaxlabs.news://auth-callback`), and the app exchanges the one-time code. The
  app learns where the accounts live from `/news/api/auth-config`, so no address or
  key is compiled in.
- The session is sealed with an AES-256-GCM key held in the Android Keystore and
  stored in the app's no-backup directory; signing out removes it.
- An account holds only your chosen topics and your saved stories (per story: id,
  title, category and at most 500 characters of text). Signing in **merges**: the
  account's topics win when it has any, otherwise yours are kept and uploaded; saved
  stories are a union. A different account never has this phone's data uploaded to it.
- **Status: the account service is unreachable today, and that is why sign-in says it is
  unavailable.** The Supabase project behind Plax accounts no longer resolves, so no app
  version can sign in until the project is restored or replaced (`../SUPABASE_SETUP.md`
  has the one-minute restore and the check that proves it worked). The app says "Sign-in
  is temporarily unavailable. Plax keeps working without it" and works as before. Once a
  working project is behind the website, installed apps sign in without an update: the
  app learns the address from `/news/api/auth-config`. Sign-in is covered by unit and
  device tests against fakes and, since 10 October, by an opt-in test that runs the app's
  real account code against a real GoTrue, PostgREST and Postgres (see *Tests*). **Not
  verified end to end**: Google's consent screen, and the redirect into the app as the
  real flow performs it (see *Sign-in against a real Supabase stack*), which need a Google
  account and a real project.

Also
- A body that merely starts with the headline is no longer cut mid-sentence ("Evolution"
  over "Evolution is the change in..." showed "is the change in..."); the headline is
  dropped only when a separator (colon, full stop, bar, dash, ellipsis, danda) follows it.

## What was in 1.1.0 (versionCode 2)

Speed
- **Cache-first start.** The last page of every topic and language is kept on the
  phone. The first frame already contains stories; the network refresh runs in the
  background. If the network is unreachable, the last stories and their pictures
  are still shown with a retry banner. A refresh that finds nothing new changes
  nothing; one that finds new stories while you are reading shows a **New stories**
  button instead of moving the card under your thumb.
- **Instant return.** Switching topic, language or tab keeps each place; going back
  to a topic read in the last two minutes needs no request.
- **Pictures.** A 50 MB on-disk cache (with a seven-day lifetime for publishers that
  send none), decoding at screen size on worker threads, a shared in-memory cache,
  and the next two pictures are fetched ahead. Low-resolution BBC thumbnails are
  upgraded to the 976 px rendition (falling back to the original).
- **Nothing heavy on the main thread**: feed parsing, cache and bookmark I/O, image
  decoding and even HTTP client construction run on workers. Paging no longer
  re-renders the screen.
- Smaller and quicker to install: R8-shrunk preview APK is about 1.8 MB (1.0.0 was a
  debug build of 8.7 MB); a baseline profile is included.

Experience
- Redesigned cards (picture or poster, category, source and age, serif headline,
  body without the repeated headline, one-tap **Read full story**, AI brief, bookmark,
  share), skeleton loading, bottom navigation with icons, topic tiles, light/dark/
  system theme, large-text and tablet-width handling, and light haptics.
- **English and Hindi** (`EN | हिन्दी` in the header): the native Hindi feed plus a
  fully translated interface (the interface follows the Android per-app language).
- **AI brief** (sparkle button): a bottom sheet with an AI-written brief of the story
  and an English/Hindi switch, with a loading state, retry and a "can contain
  mistakes" notice. The story text is sent to Plax Labs, which uses AI services.
- Publisher links open in Chrome Custom Tabs, falling back to the browser.

Fixes found while auditing
- Switching Feed, Topics and Feed used to lose the reading place.
- A server `{"cards":[],"error":…}` was reported as "unreadable response".
- Stories whose text repeated the headline showed it twice (about 1 in 8 cards).
- HTML-escaped `&#038;` in image and source URLs (about 1 in 40) is now decoded.

Unchanged since 1.1.0: no ads, no analytics SDK, HTTPS only, backups disabled, up
to 200 locally saved stories readable offline.

## Backend changes (1.2.0 and 1.3.0)

The app works with either backend; sign-in and the update check need the routes and the
file listed last. The Plax repository's web code, deployed from the same push, adds:

- **A faster AI layer** for `POST /news/api/summarize`: `src/lib/llm.ts` (staggered
  Groq `qwen3.8-27b` → Gemini `3.5-flash-lite` → `gpt-oss` chain, cool-downs for
  exhausted models, JSON validation), `src/lib/translate.ts` (Gemini-first Hindi with
  Azure/MyMemory racing behind it), `src/lib/staggered.ts`, `src/lib/tidy.ts`, Hindi
  sources summarised directly in Hindi, and shared-cache headers for the plain feed
  request. Before it, on 9 October 2026, an uncached English brief took about 6.6 s
  and an English-to-Hindi brief about 14.5 s, because the default model chain had
  gone stale (`gemini-2.5-flash` answered 429 or took 3.6 s, `gemini-2.5-flash-lite`
  returned 404, and the OpenRouter defaults were no longer free). Against a local
  `next dev` server using the production keys: English brief 0.5-0.7 s, English to
  Hindi 1.8-2.2 s, repeats 10-20 ms, and the chain kept working with Groq or every
  model disabled.
- **A time limit per content source** (`src/lib/deadline.ts`, 8 s). A cold topic pool
  used to wait for its slowest source: `space` took over 90 s on one production
  request and 30-90 s on others. On a local production build with cold caches `space`
  now answers in 5.3 s, `finance` 0.9 s, `health` 2.1 s and `philosophy` 1.0 s; `art`
  and `books` were cut at the 8 s limit when one source (a Wikipedia search, Open
  Library) was slow, and warm requests take about 10 ms. A source that is late or
  fails is replaced by what it last returned (up to 30 minutes old), and what it
  returns after the limit is kept for the next pool.
- Wikipedia disambiguation pages ("X may refer to:") are no longer offered as stories.
- The two small routes used by sign-in, `/news/api/auth-config` and `/news/auth/app`.
- **The update feed (1.3.0)**: `public/updates.json` and the one advertised APK,
  `public/plax-<version>.apk`, served at `/news/updates.json` and `/news/plax-<version>.apk`
  by the same deployment. `next.config.js` gives the feed `application/json`, `no-store` and
  `nosniff`, and the APK `application/vnd.android.package-archive`, `Content-Disposition:
  attachment` and **`no-store`** too (the file name carries the version, so a new build never
  reuses an old address). Both are marked `noindex`. The APK was first cacheable and that
  broke it once: see *Never send a Range request to the production APK* below. An older
  client or a deployment without the file just gets a 404 and reports that it cannot check.

`npm test` (83 tests), `tsc` and `next build` pass.

**Checked on the live site on 9 October 2026** (from the development machine, after
deployment `b7a3e62`; the two earlier pushes, `638d2cc` and the 1.2 release, had not
deployed because `vercel.json` carried a key Vercel rejects, see `../TECH.md`):

- Uncached English brief **1.1-1.5 s** (6.6 s before), English to Hindi **2.6-2.9 s**
  with Devanagari output (14.5 s before), repeats 0.08-0.10 s.
- Cold topic pools with a forced live fetch: `space` 5.3 s (30-90 s before),
  `art` 0.6 s, `books` 8.3 s (cut at the limit, 20 stories), `finance` 1.1 s,
  `health` 0.6 s, `history` 0.8-1.5 s (one pass returned only 4 stories, later passes
  16-20). Normal reads come from the cache in about 0.3 s.
- `/news/api/auth-config` answers with the project address and public key;
  `/news/auth/app` answers 302 into the app for the two known schemes (forwarding only
  `code` and `error*`) and 400 for anything else. Vercel writes the redirect with a slash
  before the query (`auth-callback/?code=...`); the app accepts it and a unit test pins it.
- The website journeys (public first load, For you, Topics, no repeats, keeping your
  place, Saved, Hindi, the unavailable sign-in message) ran in a real browser against
  the live site without errors, and the app's sign-in attempt against the live routes
  ends at the unreachable account service with the friendly message.

## Build

Requirements: Java 17 or 21, Android SDK platform 36 / build-tools 36.0.0,
PowerShell 7.4 for the helper scripts. The included Gradle 8.13 wrapper checks its
distribution SHA-256. Android Studio can open this directory directly.

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-21'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\build.ps1
```

This builds the debug and preview APKs, runs the unit tests and lints both. Build
types: `debug` (instrumentation tests), `preview` (the shipped preview: R8-shrunk, not
debuggable, signed with the local Android debug key) and `release` (unsigned, reserved
for the store package).

The verified handoff copy is `artifacts\plax-1.3.1-preview.apk`, byte for byte the website's
`public\plax-1.3.1.apk` (`artifacts\verification.json` has its hash). `artifacts\` is deliberately
git-ignored: the APKs and logs are local evidence, not repository content. The preview package is
**com.plaxlabs.news.preview**, version **1.3.1-preview / code 5**; it installs over 1.3.0, 1.2.0, 1.1.0 and
1.0.0 signed by the same debug key (1.2.0 to 1.3.1 and 1.3.0 to 1.3.1 were exercised, see below) and can
coexist with other apps. It supports Android 8 / API 26 or newer and targets Android 16 / API 36. The manifest declares one
exported browsable filter, the sign-in return address above, and `singleTask` launch so the return
reaches the running app.

The release package is reserved as `com.plaxlabs.news`; release signing is
intentionally not configured. Do not use the preview/debug key for a public store
release. A dedicated private signing identity, actual-device QA, publisher/content
licence review and store disclosures are required before publication. Nothing is
automatically published.

**The update signer.** Android installs an update only over an app signed with the same key, so
every published preview build must be signed with the key behind the copies people already have:
this machine's Android debug key, whose SHA-256 (`3a47d0db…d6b41c69`) is pinned in
`update-signer.sha256` and enforced by `publish-update.ps1` and `verify-update.ps1`. If that key
(`%USERPROFILE%\.android\debug.keystore`) is lost, or a build is made on another machine, installs
over existing copies fail and the only remedy is to uninstall, which erases the saved stories and
history. Back the keystore up privately (never in the repository) and move to a dedicated release
key before wider distribution; that move is itself a break, because Android refuses an update signed
by a different key (APK key rotation exists but is not set up here).

## Publishing an update

A bad feed, or a build signed with the wrong key, would leave every installed copy unable to update,
so scripts do the checking. From `android\`:

1. Raise `versionCode` and `versionName` in `app\build.gradle` (the code must exceed the one in
   `public\updates.json`), and the website version in `..\package.json` if it changes too.
2. `.\build.ps1`, then the device suite (`.\test.ps1 -Serial emulator-5590`).
3. `.\publish-update.ps1`. It inspects `app\build\outputs\apk\preview\app-preview.apk` and refuses
   it unless it is the Plax preview package, not debuggable, the version in `build.gradle`, signed by
   the pinned key, within the size limit and newer than the published feed (the same build again is
   harmless; the same version code with different contents is refused). Only then does it copy the
   file to `..\public\plax-<version>.apk`, remove older `plax-*.apk` and write `..\public\updates.json`.
4. Commit `public\updates.json` and `public\plax-<version>.apk` and push `main`. Vercel deploys both
   in one deployment, so the feed never names a file that is not there. The advertised APK is the only
   one kept in `public\`; older ones stay in Git history.
5. When the deployment is Ready, `.\verify-update.ps1` fetches the live feed and APK the way the app
   does (no redirect, HTTPS, no cache), re-applies the app's own rules, and checks the headers
   (including that the APK is `no-store`), the size, the SHA-256, the package, the version, the minimum
   SDK, that the build is not debuggable, the pinned signer, and that what is served is what was
   committed. It writes `artifacts\update-verification.json` and fails loudly otherwise. `.\test.ps1
   -Serial emulator-5590 -LiveFeed` additionally runs the app's own parser against the live feed and
   downloads the start of the APK.

**Never send a Range request to the production APK** (not from a script, a test or `curl -r`). On
10 October 2026 the live device test asked for `bytes=0-1`; the shared cache in front of
`www.plaxlabs.com` stored that 2-byte `206 Partial Content` answer as the file and returned it to
every plain download, after a redeploy as well, until its one-hour lifetime ran out. The fix is the
APK's `no-store` header. Probe files with different policies, deployed for the purpose, showed it
on the real site: with `public, max-age=3600` a ranged request that arrives first poisoned the later
plain downloads (206, 2 bytes); with `no-store` it did not, in two samples, and neither did a
cacheable file with `no-store` only for requests that carry a `Range` header. A bad entry is not
removed by redeploying: it needs a cache purge from the Vercel project's own team (dashboard or a
CLI signed in to it), or it ages out; publishing under a new version number avoids it. Browsers and
download managers also send ranged requests when they resume a download, which is why the file must
not be cacheable.

To roll back, revert the commit that changed `public\updates.json`: phones that have not downloaded
the build stop being offered it. Copies that already updated stay updated, because Android will not
install a lower version code over a higher one without an uninstall. A broken build is therefore
fixed by publishing a higher version, not by withdrawing one.

## Tests

```powershell
.\build.ps1 -Tasks ':app:assembleDebug', ':app:assembleDebugAndroidTest', ':app:testDebugUnitTest'
# Start an isolated emulator named Plax_News_Test (4 GB RAM is advisable), then:
.\test.ps1 -Serial emulator-5590
# Optional live checks against the deployed site (English and Hindi feed, and the update feed):
.\test.ps1 -Serial emulator-5590 -LiveFeed
# Optional: the account code against a real Supabase stack on this machine (needs Docker, see below):
..\scripts\auth-stack\up.ps1
$env:PLAX_LOCAL_STACK = (Resolve-Path ..\scripts\auth-stack\.env).Path
.\build.ps1 -Tasks ':app:testDebugUnitTest', '--tests', 'com.plaxlabs.news.AccountLocalStackTest', '--rerun'
..\scripts\auth-stack\down.ps1
```

A normal `.\build.ps1` lists 141 JVM tests and skips 13 of them (the stack tests below); 128 run.

**Run the device suite on a quiet machine.** Its checks are made by UiAutomator against a software-rendered
emulator, so they time out when the machine is busy. A first 1.4.0 run, with a Gradle daemon, the website's dev
server, a Docker stack and a second emulator all running, failed 9 tests (three in `UpdateDeviceTest` that were
looking for the menu, then the new share tests behind them); the same tests passed alone, and all 69 passed once
the other work was stopped. Stop `gradlew --stop`, dev servers and containers first. The suite also assumes a
clean app: if you have used it by hand on the emulator (a saved story is enough), clear it first with
`adb shell pm clear com.plaxlabs.news.preview`, or `appNeedsNoLoginAndSupportsTopicsSavedAndRotation` will not
find the empty Saved tab.

- **128 JVM unit tests**: strict JSON shape and limits, server errors, escaped URLs, cache
  format, repeated-headline removal (including sentences that merely begin with the
  headline), read-time parsing, image width/sampling rules, cache-header rewriting,
  Markdown rendering rules, AI request/response validation, sections and request URLs;
  the no-repeat engine (same-event matching in English and Hindi, the seen history and
  its damaged-data handling, merging and caps, 16 tests); the feed state machine with
  fake sources (sessions, dwell, caught-up, For you, 14 tests); the sign-in protocol,
  PKCE and token handling (16 tests); the account manager's merge, queue and
  session rules (24 tests); the update feed parser and client (9 tests: every
  field rule, content types, status codes, an oversized body of unknown length, the
  client's hardening settings, and that the feed and APK committed in `public\` are
  accepted by the app and match each other) and the update manager (18 tests: the 24-hour
  check, a failed check counting, dismissal and its expiry, a newer version overriding
  a dismissal, manual checks and their messages, a manual tap during a running check,
  nothing offered over a dialog or sheet, store builds, and a recreated screen); and the
  share link (`ShareLinksTest`, 10 tests: which stories can have a page, that the request is
  exactly what the website verifies (a golden vector shared with its unit tests), which answers
  are trusted (only this story's page on the Plax site: wrong host, port, scheme, path, query or
  id are refused), the message the share sheet is given in each case, and that the signature
  survives the cache and saved files while older files still load).
- **13 opt-in tests against a real Supabase stack** (`AccountLocalStackTest`, skipped unless
  `PLAX_LOCAL_STACK` names the `.env` that `scripts\auth-stack\up.ps1` writes). The app's real
  `AccountManager` and `Supabase` client talk to a real GoTrue, PostgREST, Kong gateway and Postgres loaded with
  the project's `supabase-schema.sql`. Only the website's address lookup and Google's consent screen are replaced:
  the one-time code Google would return is issued by the stack, by e-mail, for the very code challenge the app
  created. Covered: the service offers Google and refuses a call without the project key; the address the app builds
  is accepted and sent on to Google; sign-in creates the account and the trigger-made profile and uploads the phone's
  topics and saved stories; the same account on a second phone receives them; changes made while signed in reach the
  account (saving, removing, topics); saving a story twice is ignored, not refused; one account never sees, removes or
  forges another's rows and the anonymous key reads nothing; a code works once and only with its verifier; an expired
  token is told apart from a refused change; a session that has run out is refreshed, and one revoked elsewhere ends
  cleanly with "sign in again"; signing out revokes the phone's session; a denied or invented code leaves the reader
  signed out with a message; and the reading-streak function changes only the caller's own row.
- **70 Android instrumentation tests** (74 with `-LiveFeed`): bookmarks, the on-disk feed
  cache (round trip, per-language, damaged files), card rendering and actions, skeleton
  geometry, navigation and rotation, rendering of every screen and state in both
  languages, the AI sheet (loading, result, language switch without refetch, failure,
  retry, cancel on dismiss), theme preference, Hindi translations, 15 cache-first
  behaviours driven by a controllable network, a picture interrupted while it connects
  (the 1.3.1 fix), the no-repeat flows (read, leave, return;
  caught-up; earlier stories; new stories) and the account flows against fakes: Keystore
  sealing and tamper detection on the real device keystore, the account sheet, sign-in
  return merging data and sign-out leaving it on the phone, topics sent while signed in,
  and an unsolicited sign-in callback changing nothing. Nine more cover updates on a real
  screen: the offer and its text, **Later**, cancelling, **Download** starting the browser on
  the exact APK address, nothing appearing over an open sheet until the app is next in front,
  surviving rotation, the real **Check for updates** menu item (through the system's
  accessibility tree, reading the toast it shows), a store build's menu and About text, and
  the real preferences file. The test script precompiles the debug build so timing is not
  class-verification time.

## Data and limits

Only the public feed, publisher images and (for an AI brief you ask for) the story
text, title, category and language are sent. No website server key, AI key or analytics
is sent, and nothing identifies you until you sign in. The update check (once a day while
you use the app, or when you choose Check for updates) fetches `/news/updates.json` from
the same website: a plain GET that carries no account, device identifier or cookie, only
what every HTTPS request exposes (your IP address and OkHttp's default User-Agent), and
the app stores just when it last asked and which version you postponed. **When you sign in**, the
account service also receives your Google sign-in (through the browser, not the app),
your chosen topics and your saved stories (id, title, category and at most 500
characters each). The account service's address and public key are fetched from
`/news/api/auth-config`: both are public values already in the website's own bundle,
and row-level security protects the tables. Hosts can still observe normal network
metadata (IP address, requests); opening a publisher is subject to that site's policies.

Saved stories are app-private atomic JSON, not an encrypted vault. So is the seen
history (`seen-stories.json`); clearing the app's storage forgets it, after which a
story may be shown once more. The account session, when signed in, is sealed by the
Keystore and kept out of backups. The feed cache and image cache live in the
system-clearable cache directory and hold only public stories and pictures. Backups
and device transfer are disabled. **More options > Clear saved stories** removes the
bookmarks; clearing storage or uninstalling removes everything.

Limits: each feed response 1 MiB, each image 4 MiB before sampled decoding, the image
disk cache 50 MB, the memory cache one eighth of the heap (at most 48 MB), one feed
session 180 stories, a cached page 100 stories, and cached news older than two hours
(other topics seven days) is not shown as current. At most 400 changes are queued
while signed in, and the account is synchronised again when you return to the app if the
last sync was over 10 minutes ago. Requests time out after 25 s (AI brief 45 s). The
backend can return no stories or be unavailable; the app never replaces that with
sample articles or claims editorial verification. AI briefs can be wrong and are
labelled as such.

Inshorts describes the requested interaction style only; Plax is not affiliated with
it. Article content and images belong to their respective publishers.

## Sign-in against a real Supabase stack (10 October 2026)

Reported that day: Account > Continue with Google showed "Sign-in is temporarily unavailable". That message is the app
being right: the account project (`dushouwvwnuxdfumnxzf`) no longer resolves in DNS (three resolvers), so no version of
the app or the website can sign in. Nothing in the app is at fault and no update fixes it; see `../SUPABASE_SETUP.md`
for why it most likely paused and how to restore it. What was done instead, so that nothing else fails the moment a
project is back:

- The account code had only ever run against fakes. A real local stack (`scripts\auth-stack`: Postgres, GoTrue,
  PostgREST and Kong from Supabase's own images, `supabase-schema.sql` applied as the SQL editor would) now runs it for
  real: **13 of 13 tests pass**, including the negative ones (wrong verifier, reused code, expired and revoked sessions,
  another account's data). The app needed no change. The test is opt-in and skipped by the normal build.
- It found a **hole in the schema, not in the app**: `update_reading_streak` is `SECURITY DEFINER` and never checked its
  caller, so anyone holding only the public anon key could change any reader's streak and last-read time by passing
  their id (measured on the stack: HTTP 204 and the victim's row changed). The website calls this function, so it was
  fixed in `supabase-schema.sql` (the caller must be that reader; the anonymous role loses `EXECUTE`). Against the old
  schema the new test fails with "another reader's streak must not change"; re-running the fixed schema on that same
  database repairs it and all 13 pass. A restored project still has the old function until the schema is run again.
- `scripts\check-accounts.ps1` checks the live chain (address, service, Google, tables and row-level security, the streak
  function, the keep-alive) and names a fix for each failure. Tested by breaking the stack five ways (Google off,
  sign-ups off, the old function, a missing table, and the real dead production project): each was reported by name,
  and a first run on a healthy stack found and fixed a bug in the script itself.
- Seen on the emulator (Android 16, Chrome 133) against the live site, with the 1.3.1 build: **Account > Continue with
  Google shows exactly the reported message** ("Sign-in is temporarily unavailable. Plax keeps working without it; try
  again later.") and opens no browser. And the website's real redirect reaches the app: Chrome loaded
  `https://www.plaxlabs.com/news/auth/app?app=com.plaxlabs.news.preview&code=<placeholder>`, the site answered
  `302 -> com.plaxlabs.news.preview://auth-callback?code=...`, Android started `VIEW` on that address for the app's
  `MainActivity`, and the app came to the front, opened its account sheet, stayed signed out (it never asked for the
  code) and did not crash. This was an ordinary Chrome tab and a placeholder code; the real flow uses a Chrome Custom
  Tab with a code from Google, which could not be tried.
- Not covered: Google's consent screen, the Authorized redirect URI in the Google console, the Redirect URLs list in
  Supabase, the Custom Tab path with a real code, and a real hosted project (its key formats, defaults and rate
  limits). Those are the one manual sign-in the runbook ends with.

## Verification performed for 1.4.0 and 1.4.1 (10 October 2026)

On the isolated Android 16 (API 36, x86_64) `Plax_News_Test` emulator (Chrome, Google Play services and Play Protect
present), the development machine and the live website; no physical phone was available.

- **Builds and tests (1.4.1)**: debug and preview builds, lint **0 errors**, 1 warning (a newer Gradle exists) for both;
  **141 JVM tests**, none failing, 13 opt-in skipped; **70 device tests**, and **74** with `-LiveFeed` (170 s, from a
  clean app on a quiet machine). The website: `tsc` clean, `npm test` **112** (83 before), a production build.
- **The website in a real browser** (Edge driven by Playwright, production build against a local Supabase stack so no
  real data was written): the share flow, **15 of 15** checks (a Plax link and the headline as the message, one request per
  card, the page exists, the Copy text carries the link, the publisher's link when the server is down, "tap again" for
  browsers that refuse a late share, and no separate Copy on a phone); a deliberately slow endpoint, **10 of 10** (spinner,
  a second click shares the publisher's link in 0.5 s, nothing is shared twice, one request). Phone, tablet and desktop
  screenshots in both themes were compared with the app: header, chips, card, action row, tabs, Hindi (Devanagari serif)
  and the story page match; the intended differences are listed in [TECH.md](../TECH.md).
- **What the website serves** (`verify-update.ps1`, 20 of 20 checks for **each** of 1.4.0 and 1.4.1): the feed answers 200 with
  no redirect and `no-store`, the APK is served as an Android package, not cacheable, the size and SHA-256 match, the
  package, version, minimum SDK and pinned signer are right, and it is not debuggable.
- **Production, after deployment**: all 12 sampled feed cards were signed; `POST /api/share` answered 200 for a real card,
  **403 for the same card with its headline changed** and 400 without a signature; the story page answered 200 to a
  browser and to WhatsApp and Facebook crawler user agents (CDN miss, then hit) with the canonical URL, `article` Open Graph
  tags and an image; the preview picture is a 85 KB PNG in the bundled serif (the font file was traced into the serverless
  function). The app's own `LiveFeedTest` made story pages for real, first-time stories in **1.19 / 0.89 / 0.90 s** and
  again in 1.27 / 0.90 / 0.90 s, and fetched the pages.
- **The update path, twice, through the real feed** (the browser saves the APK, Android asks to confirm): the published 1.3.1
  was offered 1.4.0, and the published 1.4.0 (recovered byte for byte from its commit) was offered 1.4.1. In each case the
  downloaded file was exactly the advertised size with the advertised SHA-256 and came from the advertised URL; the system
  installer said "Do you want to update this app?" (so it recognised the signature), Play Protect showed its usual first-time
  "App blocked" warning for this sideloaded build and **More details > Install anyway** completed it ("App installed");
  a story saved before the update was still in **Saved** afterwards, the app was not offered the update again, and there were no
  crashes. From the updated app a real **Share** handed the share sheet
  `<headline> https://www.plaxlabs.com/news/s/<headline>-<id>` (the headline and the Plax link, as designed).

**Found and fixed while verifying** (so they are not rediscovered):

- **Lint**: the new "Preparing link..." string had no Hindi translation (the app has `values-hi`); added.
- **The 4-second wait was too short (fixed in 1.4.1).** The first test of the OTA-updated 1.4.0 handed the share sheet the
  *publisher's* link after 4.4 s: the app had asked, given up and fallen back. See *What is in 1.4.1*.
- The device suite is sensitive to load and to leftover data (see *Tests*); both were hit once and are documented.
- Playwright against `next dev` showed a stale CSS bundle (a hot-reload artefact, not the product); a clean start fixed it.
  A production build was used for the final browser checks.

**Not verified:** anything on a physical phone (the share sheet, Chrome's download and Play Protect behave as on this emulator
only as far as the emulator reproduces them); WhatsApp's own rendering of the preview (what a crawler fetches was checked, not
how WhatsApp draws it, and WhatsApp caches previews for a while); that Google will index or rank the story pages (nothing can
show that yet); iOS Safari's handling of a share started after a network call (the "tap again" path was simulated, not run on
an iPhone); a Hindi preview picture (Hindi headlines get a plain branded card by design, because the drawing library cannot
shape Devanagari: verified, see TECH.md). The Play Protect warning on first install of a sideloaded build remains; the app
cannot skip it.

## Verification performed for 1.3.1 (9 and 10 October 2026)

On the isolated Android 16 (API 36, x86_64) `Plax_News_Test` emulator (Chrome 133, Google Play
services and Play Protect present), the local machine and the live website; no physical phone was
available. What 1.3.1 does not touch is covered by the 1.2.0 checks below.

- **Builds and tests**: debug, preview and unsigned release builds (the store build compiles
  under R8 with `PLAY_STORE = true`; debug and preview have it false); debug and preview lint
  **0 errors**, 1 warning (a newer Gradle exists). **118 JVM tests**, none skipped (the one that
  reads `public\updates.json` and the APK ran against the committed files), and **63 device
  tests**. After deployment, `-LiveFeed` ran **66 device tests** (137 s), including the app's
  own parser against the deployed feed and a plain download of the start of the APK.
- **What the website serves** (`verify-update.ps1`, 20 of 20 checks, run on 10 October against the
  deployment of commit `c616c0c`): the feed answers 200 without a redirect as `application/json` with
  `Cache-Control: no-store`, has exactly the seven fields, and names this site's versioned
  APK; the APK answers 200 as `application/vnd.android.package-archive` with `Content-Disposition:
  attachment` and `Cache-Control: no-store`; its size and SHA-256 equal the feed and the committed
  file; it is the preview package, 1.3.1 / code 5, minSdk 26, not debuggable, signature valid and
  signed by the pinned key. (Vercel keeps its own `Content-Disposition: inline` on the feed, which
  does not matter to the app.) The apex `plaxlabs.com` redirects with 308 to `www`, which is why the
  app uses `www`.
- **A failure this verification found.** The first run of `verify-update.ps1` after the docs push
  failed: the APK answered `206 Partial Content` with 2 bytes. My own live device test had asked
  for `bytes=0-1`; the shared cache in front of `www.plaxlabs.com` stored that answer as the whole
  file (the APK was then cacheable, `public, max-age=3600`), served it to plain downloads even
  after a redeploy, and let it go exactly an hour later (06:48 to 07:48 UTC on 10 October). To my
  knowledge only the test emulator could have fetched the file in that time. Probe files then
  showed on the real site that a ranged request arriving first poisons a cacheable file and does
  not poison a `no-store` one. The APK is now `no-store`, the live test makes a plain request and
  asserts that the whole file is served, and `verify-update.ps1` asserts `no-store`. Afterwards:
  the verifier passed, the device suite passed (66 of 66) and the URL was still whole after it.
- **The update, end to end, with the real feed and a real browser.** A clean 1.3.0 install
  asked the live feed on its first start and showed **Update available: Plax 1.3.1 is ready**
  (the Hindi text was checked on screen through the menu too). **Later** closed it and
  relaunching inside 24 hours showed nothing; **More options > Check for updates** offered
  it again. **Download** made the app start `ACTION_VIEW` + `BROWSABLE` for
  `https://www.plaxlabs.com/news/plax-1.3.1.apk`; Chrome (after its own first-run screens) saved
  `plax-1.3.1.apk`, 1,867,429 bytes, recorded as downloaded from that HTTPS address, and
  `sha256sum` on the phone matched the feed. Opening the file from Chrome's download list, Android
  first refused installs from Chrome and offered **Settings > Allow from this source**; then it asked
  **Do you want to update this app?** (it recognised an update of the installed Plax); then **Play
  Protect blocked it** (see above) until **More details > Install anyway**. The phone then reported
  1.3.1 / code 5, the saved story was still in Saved, there was no offer and no crash, and
  **Check for updates** said **Plax is up to date.** The download and install were repeated on
  10 October after the APK became `no-store`: the same 1,867,429 bytes and SHA-256, installed
  over a clean 1.3.0 to version code 5 (Play Protect did not intervene the second time on that
  emulator).
- **The one-time manual install**: 1.2.0 with a saved story, then the file downloaded from the
  site installed over it (`adb install -r`): the story survived and nothing crashed.
- **The crash fixed in 1.3.1**, on the real R8 builds: the phone was wiped and the app launched
  25 times, turning to landscape and back three times at random moments while the first pictures
  downloaded.
  **1.3.0 crashed 3 times** (all `InterruptedException` on `plax-image` threads); **1.3.1 crashed
  0 times in 25 rounds and 0 times in 50 more** with a second random sequence. The same
  mechanism isolated in the loader (150 closes with real downloads): 166 uncaught exceptions
  before the fix, none after. The sample is small, so the rates are indicative only.
- **Cold start** with the update check on: 1.39 to 2.20 s over six runs after the first, median
  1.57 s (1.52 s for 1.2.0 on the same emulator, which is within its noise). The check runs on
  a worker after the first frame.

Not verified for updates: a **physical phone**; **other browsers or phone makers' installers** (only
Chrome and the stock package installer were driven); whether a Google Play release or another
signing key avoids Play Protect's warning; the update dialog's behaviour with TalkBack; and a
failed or very slow download on a flaky network (the download is the browser's). The 24-hour rule,
failed checks, hostile feeds and store builds are covered by the JVM and device tests only.

## Verification performed for 1.2.0 (9 October 2026)

All on the isolated Android 16 (API 36, x86_64) `Plax_News_Test` emulator and the
local machine; no physical phone was available.

- Checksum-pinned Gradle wrapper; debug, preview and unsigned release builds; debug
  and preview lint: **0 errors**, 9 warnings (newer dependency/tool versions only).
- **91 JVM unit tests** and **55 instrumentation tests** passed (71 s), including the
  live English and Hindi feed checks against the public API and Keystore sealing on
  the emulator's real Android Keystore.
- The preview APK (`artifacts\plax-1.2.0-preview.apk`, 1,860,729 bytes) was inspected:
  package `com.plaxlabs.news.preview`, 1.2.0-preview / 3, minSdk 26, target 36, not
  debuggable, the INTERNET permission only (plus AndroidX's internal receiver
  permission), English and Hindi resources, signed by the Android debug key.
- **End to end against the live production news pool**, on the emulator, with the
  preview build: reading story after story reached the caught-up card after 165
  stories (164 read). One headline appeared twice in the log, which was most likely a
  swipe that did not register rather than a repeat. After Home, a force-stop and a
  relaunch, 12 stories were shown and none had been read before.
- **Update in place**: 1.1.0 was installed and a story saved, then 1.2.0 was
  installed over it (`adb install -r`, same debug key). The saved story was still
  listed, the feed loaded, and no crash was logged.
- **Smoke test of the R8-shrunk 1.2.0 build** (shrinking can break reflection and
  Keystore code that unit tests never see): public first run, For you with no topics
  ("Make Plax yours"), the overflow menu, the account sheet and an unreachable
  sign-in service reported as unavailable, with no crash.
- Cold start on this emulator (software GPU, noisy): 1.5-1.7 s to the first frame in
  five runs after force-stopping (median 1.52 s); 1.1.0 was measured at about 1.3-2.5 s
  on the same emulator. The first frame contains cached stories when there are any. A
  packaged baseline
  profile showed **no measurable difference on the emulator**; its benefit on real
  phones is unverified.
- Carried over from 1.1.0 (manual touch checks on the shrunk preview APK, not repeated
  for every 1.2.0 screen): swipe, save and the Saved tab, topics, the in-app
  English/Hindi switch, the AI brief sheet against the deployed backend, system dark
  mode, a 360 dp-wide screen at 130 % text, a launch with the network disabled and a
  first run with no network or a stalled connection.

Not verified: **sign-in end to end** (the account service is down; Google's consent
screen and Chrome's handling of the redirect into the app have never run), a physical
device, landscape and tablet layouts (the tablet width limit is untested), Android 8-12
(per-app language relies on AppCompat's stored locale there; Android 13+ uses the
system setting), long sessions or memory under pressure, TalkBack, right-to-left
layouts, publisher image hosts beyond those sampled, how well different-outlet
matching works on Hindi headlines beyond the small pool tried, AI quality at scale or
its free-tier quotas, and store policies. There is no in-app account deletion.
