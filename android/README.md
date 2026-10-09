# Plax for Android

Standalone native Android news/reading app. This is not a WebView wrapper, and
it does not depend on Vanishr or its signing keys, relay, account data or code.
It reads the Plax public feed (`https://www.plaxlabs.com/news`) and, for the
optional AI brief, the summarize endpoint. It works without an account; signing in
with Google is optional and only syncs your topics and saved stories (see
*Optional sign-in*). Apart from sign-in, which needs the two small routes listed under
*Backend changes*, the app works against the backend as it was before this version.

## What is in 1.2.0 (preview, versionCode 3)

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
- **Status: the account service is unreachable today.** The Supabase project behind
  Plax accounts no longer resolves (see `../SUPABASE_SETUP.md`). The app says
  "Sign-in is temporarily unavailable. Plax keeps working without it" and works as
  before. Sign-in is covered by unit and device tests against fakes only. **It has not
  been verified end to end**, including Google's consent screen and Chrome's handling
  of the redirect into the app.

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

## Backend changes that ship with this version

The app works with either backend. The Plax repository's web code, deployed from the
same push, adds:

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

`npm test` (83 tests), `tsc` and `next build` pass.

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

The verified handoff copy is `artifacts\plax-1.2.0-preview.apk` (`artifacts\verification.json`
has its hash). `artifacts\` is deliberately git-ignored: the APKs and logs are local
evidence, not repository content. The preview package is **com.plaxlabs.news.preview**,
version **1.2.0-preview / code 3**; it installs over 1.1.0 and 1.0.0 signed by the same debug
key (1.1.0 to 1.2.0 was exercised, see below) and can coexist with other apps. It supports
Android 8 / API 26 or newer and targets Android 16 / API 36. The manifest declares one
exported browsable filter, the sign-in return address above, and `singleTask` launch so the
return reaches the running app.

The release package is reserved as `com.plaxlabs.news`; release signing is
intentionally not configured. Do not use the preview/debug key for a public store
release. A dedicated private signing identity, actual-device QA, publisher/content
licence review and store disclosures are required before publication. Nothing is
automatically published.

## Tests

```powershell
.\build.ps1 -Tasks ':app:assembleDebug', ':app:assembleDebugAndroidTest', ':app:testDebugUnitTest'
# Start an isolated emulator named Plax_News_Test (4 GB RAM is advisable), then:
.\test.ps1 -Serial emulator-5590
# Optional live public-API checks (English and Hindi feed), without an account:
.\test.ps1 -Serial emulator-5590 -LiveFeed
```

- **90 JVM unit tests**: strict JSON shape and limits, server errors, escaped URLs, cache
  format, repeated-headline removal (including sentences that merely begin with the
  headline), read-time parsing, image width/sampling rules, cache-header rewriting,
  Markdown rendering rules, AI request/response validation, sections and request URLs;
  the no-repeat engine (same-event matching in English and Hindi, the seen history and
  its damaged-data handling, merging and caps, 16 tests); the feed state machine with
  fake sources (sessions, dwell, caught-up, For you, 14 tests); the sign-in protocol,
  PKCE and token handling (16 tests) and the account manager's merge, queue and
  session rules (23 tests).
- **53 Android instrumentation tests** (55 with `-LiveFeed`): bookmarks, the on-disk feed
  cache (round trip, per-language, damaged files), card rendering and actions, skeleton
  geometry, navigation and rotation, rendering of every screen and state in both
  languages, the AI sheet (loading, result, language switch without refetch, failure,
  retry, cancel on dismiss), theme preference, Hindi translations, 15 cache-first
  behaviours driven by a controllable network, the no-repeat flows (read, leave, return;
  caught-up; earlier stories; new stories) and the account flows against fakes: Keystore
  sealing and tamper detection on the real device keystore, the account sheet, sign-in
  return merging data and sign-out leaving it on the phone, topics sent while signed in,
  and an unsolicited sign-in callback changing nothing. The test script precompiles the
  debug build so timing is not class-verification time.

## Data and limits

Only the public feed, publisher images and (for an AI brief you ask for) the story
text, title, category and language are sent. No website server key, AI key or analytics
is sent, and nothing identifies you until you sign in. **When you sign in**, the
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

## Verification performed (9 October 2026)

All on the isolated Android 16 (API 36, x86_64) `Plax_News_Test` emulator and the
local machine; no physical phone was available.

- Checksum-pinned Gradle wrapper; debug, preview and unsigned release builds; debug
  and preview lint: **0 errors**, 9 warnings (newer dependency/tool versions only).
- **90 JVM unit tests** and **55 instrumentation tests** passed (71 s), including the
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
