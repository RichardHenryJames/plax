# Plax for Android

The Android app of [Plax](../README.md): swipeable news cards in English or Hindi, topics, a **For you** feed, saved stories, Go deeper, Share, an
optional Google sign-in, and Google ads (a strip at the foot and a full page after every fifth story). It is a React Native app (Expo SDK 55,
React Native 0.83, TypeScript, the new architecture, Hermes), and it replaced the native Java app (versions up to 1.7.1) with version 2.0.0, so that a fix or a
change reaches every install, Google Play's too, as an over-the-air update of the JavaScript instead of a new bundle. The native app is in this repository's history at the tag
`native-android-1.7.1`, and its documentation is kept in [docs/NATIVE-ANDROID-HISTORY.md](docs/NATIVE-ANDROID-HISTORY.md).

Everything below is run from this folder (`mobile\`) in PowerShell 7 on Windows, with a JDK 21 (`JAVA_HOME`), the Android SDK (`ANDROID_HOME`) and Node.

## Three builds, one code

What a build does is decided at run time from its application id (`src/build.ts`), never from a setting that an update could carry.

| | `play` | `preview` | `e2e` |
|---|---|---|---|
| Package | `com.plaxlabs.news` | `com.plaxlabs.news.preview` | `com.plaxlabs.news.e2e` |
| Who gets it | Google Play (an `.aab`) | the website, `/news/plax-<version>.apk` | the device tests only |
| Version shown | `2.0.0` | `2.0.0-preview` (the update feed expects the suffix) | `2.0.0` |
| Ads | the owner's AdMob units | none | Google's sample units |
| Looks for a newer APK at the website | no (Google Play updates it; the menu says **Open Google Play**) | yes, once a day and at **Check for updates** | yes, at the mock website |
| JavaScript updates over the air | yes, channel `production` | yes, channel `production` | yes, channel `e2e` |
| Talks to | the website | the website | a mock website on the host (`http://10.0.2.2:8787`, the only build that may use cleartext traffic) |
| Signed with | the Google Play upload key | the Android debug key, pinned in `update-signer.sha256` | the debug key |

Minimum Android 8 (API 26), target API 36. The version name and code are `VERSION` and `VERSION_CODE` in `app.config.js` (2.0.0, code 20: above the native
app's 18); they are the only numbers to raise for a release.

## What is where

| Folder | What it holds |
|---|---|
| `src/data/` | the feed: stories, parsing, the cache, the no-repeat history, the engine that decides what comes next, saved stories, Go deeper, share links, the move from the native app's files |
| `src/config/` | the website's settings file (`app-config.json`): reading it under the website's own rules, remembering it, the notices and prompts it can raise |
| `src/account/` | the optional Google sign-in (PKCE through the system browser), the sealed session, cloud sync of topics and saved stories, deleting the account |
| `src/ads/` | consent (Google's UMP), the banner and the full-page native ad, when to ask for one and when to drop it |
| `src/updates/` | the website build's APK updater and the over-the-air JavaScript updates |
| `src/ui/` | the screens and sheets, the pager (one swipe, one story), the story page and its layout |
| `src/app/` | the shell that joins them (`container.ts` makes the services, `AppShell.tsx` the screens) |
| `src/platform/` | the phone: HTTP, storage, the clock, images, the app's own native module |
| `modules/plax-native/` | the app's own small native module (Kotlin): the native app's old preferences, a haptic tick, and the "fully drawn" report |
| `plugins/withPlax.js` | the Expo config plugin: signing per build and the manifest details |
| `scripts/` | build, checks and publishing (below) |
| `e2e/` | the device tests, and the mock website they run against |
| `docs/` | the native app's history, and the answers for older Play Console submissions |

`@shared/<name>` imports a module of the website (`../src/lib`): the card layout (`card-fit`, `text-fit`, `sentence`), the no-repeat engine (`story-engine`), the
rules for `app-config.json` (`app-config-rules`), the ad spacing (`ad-slots`) and the body text rule (`story-body`). The website's tests cover them, and the app cannot differ from
the website there.

## Everyday commands

```powershell
npm ci                                 # once, and after a package changes
npm run typecheck                      # the types (tsc --noEmit)
npm test                               # the unit and component tests (see Tests)
npm run fingerprint                    # has the native layer changed? (see Updates)

pwsh scripts\build-android.ps1 -Variant e2e        # the device tests' build (APK, x86_64 only), about 3 to 5 minutes when little changed
pwsh scripts\build-android.ps1 -Variant preview    # the website's build (APK, four processors)
pwsh scripts\build-android.ps1 -Variant play       # the Google Play build (AAB, four processors, signed with the upload key)
pwsh scripts\build-android.ps1 -Variant play -Clean   # the same from nothing (about 10 minutes): use it for what is uploaded
node scripts\check-bundle.mjs                      # check the .aab before it is uploaded

$env:PLAX_E2E_SERIAL = 'emulator-5590'             # the emulator named Plax_News_Test; the tests refuse any other
npm run test:device                                # the device tests (they install the e2e build themselves)
```

The Android project in `android\` is made by `expo prebuild` from `app.config.js` and `plugins\` every time and is not committed. When the build is switched from one
variant to the other the script keeps Gradle's work and renames only what has to be renamed. The script stops Gradle's daemon before it wipes the project and again when it
finishes (a daemon left running keeps the folders locked); if something else holds them (Android Studio, a stray `java.exe`), stop it and run the build again. Packages land in
`artifacts\` (not committed) as `plax-<version>-<variant>.apk|aab`.

## Tests

Unit and component tests (`npx jest`, Jest with `jest-expo` and the React Native Testing Library) cover every module, the screens and the whole shell with
fakes in place of the phone, the network and the clock (`src/app/__tests__/rig.tsx`): the feed engine and its clocks, the cache, the no-repeat history, parsing, saved
stories, share links, the settings file (the 168 cases the website shares), notices and prompts, sign-in and sync against an account service in memory, deleting an
account, consent and ad timing, every sheet and dialog in both languages and both themes, text sizes, back handling, deep links, the move from the native app, the
APK and over-the-air update policies, and the layout of a story page for a sweep of screens, text sizes and stories and for both ends of every range the website may send.
`src/account/__tests__/account-local-stack.test.ts` runs the account code against a real Supabase stack (`..\scripts\auth-stack`) and is off unless
`PLAX_LOCAL_STACK` names that stack's `.env`.

Device tests (`e2e\*.e2e.mjs`, Node's test runner driving adb and UI Automator) run the real build on the emulator `Plax_News_Test` and drive it as a reader would, against a mock
website that can be told to answer well, slowly, wrongly or not at all (`e2e/lib/mock-server.mjs`): starting (cold and warm, time to the first story), reading (every page fits at six text and
theme settings, in Hindi and on its side; one swipe is one story), the menu and the places of the app, saved stories, every sheet, the network going away and
coming back, the background, the website's settings and notices, ads, and a reader who taps anywhere for a while. Each test also asserts that the phone logged no crash,
no "not responding" and no JavaScript error. The tests refuse to touch any emulator but `Plax_News_Test` (they check its name). It is a Pixel 5 (1080 x 2340, 440 dpi), Android 16 (API 36,
`google_apis_playstore`, x86_64), 4 GB of memory and 6 processors (`hw.ramSize=4096` in its `config.ini`, in megabytes: `4G` is not understood and gives 2 GB, on which the phone swapped and every
look at the screen took longer), with no GPU: it draws in software, so a swipe takes seconds, and the tests wait for a page to come to rest instead of for a fixed time.
Its disk is `android\.tools\plax-news-avd` (the folder of the retired native project: **do not delete `android\.tools`**); start it with `emulator -avd Plax_News_Test -port 5590 -no-snapshot`.
A whole run takes about 55 to 75 minutes, and the computer should do nothing else meanwhile (a test run, a type check or a build at the same time makes the emulator slow enough to fail tests that are right).
Run it detached, so that an interrupted terminal does not take the emulator and the run with it. `npm run test:device-lib` runs the tests of the harness itself (the mock website and its stories) and needs no phone.

**Last full run (7 November 2026, build 2.0.0 (20), e2e variant):** 88 tests in 24 suites, 87 passed, 0 failed, 1 skipped on purpose (saving 200 stories to reach the limit takes too long by hand; the limit is
covered by the unit tests), 53 minutes. Unit and component tests: 88 suites, 1,996 tests passed, 14 skipped (the opt-in local-stack suite and the like). `npm run typecheck` is clean and the native layer matches `native-fingerprint.json`.

What the slow, software-drawn emulator taught the harness (`e2e/lib`), so that a failure means the app and not the test:

- **A swipe is long and not quick**, along the pager (never over the ad strip or the status bar), and is made again, longer, up to three times if the page did not turn. The emulator takes touch events one
  at a time, so a short, quick swipe can reach the page as two or three events, the last short of the half of a page that turns it, and the page falls back. A page has **turned** when its kind or
  headline is another; its place on the screen is not the page (the line "Finding more stories…" comes and goes over the stories, and the pager grows and shrinks under it).
- **A tap on something that reaches under the status bar** (the line over the stories) lands below the status bar: a tap on the status bar goes to the status bar.
- **A toast lives two seconds**, less than one look at the screen takes here, so the device tests do not wait for one; the unit tests check what each says, and the device tests check what it leaves behind.
- **The mock website's stories are all different events to the app** (`mock-server.test.mjs` checks this against the website's own rule, `src/lib/story-engine.ts`): a headline repeated within 16 hours of
  itself would be shown once, and the feed would have as many stories as headlines. The mock can also be told to give a few stories at a time (`setFeed({ cap })`), to reach the end of a page of stories.
- **A phone that has just started is left alone** (`openWorld` waits until it has been up for 8 minutes). Its own System UI can show "System UI isn't responding" in that time, and the dialog then stays in front of
  the app for the whole run. If one appears anyway, the harness presses its **Wait** button when a wait runs out; a "not responding" dialog of the app under test is never pressed, it is a failure. A failed tap says
  what was in front and on the screen, so that a lost app, a crash dialog and a wrong page can be told apart.

## Updates without a new bundle

There are three kinds of change, and they reach readers differently:

| What changed | Google Play build | Website build |
|---|---|---|
| The server: the feed, Go deeper, pictures, order | at once, when `main` is pushed (Vercel deploys it) | at once |
| The settings file `public/app-config.json` (data only, below) | when `main` is pushed, and in the app within hours of its next coming to the front | the same |
| The app's JavaScript (screens, logic, wording, styles, assets) | **over the air**: `scripts\publish-ota.ps1`; downloaded at the next start (or within 3 hours of coming to the front) and run from the start after | the same, and by a new APK as before |
| The native layer (Kotlin, manifest, permissions, native libraries, a new native package) | only with a new bundle uploaded to Google Play | a new APK (`publish-update.ps1`) |

**How the over-the-air update works.** The app's JavaScript is published to Expo's update service (EAS Update, project `a2e9c463-e79d-4af6-96a9-00035d24d97f`, owner
`richardhenryjames`). Both builds ask it at start and when they come to the front (at most every 3 hours) whether a bundle newer than theirs exists *for their runtime version*, download it in
the background and run it from the next cold start. `RUNTIME_VERSION` in `app.config.js` (`2.0.0`) is the promise that the native layer has what that JavaScript uses; one runtime version serves the
Play build and the website build, which have the same native layer. Google Play's rule is that an app may not fetch executable code from anywhere but Google Play, except what an interpreter runs
with only indirect access to Android's APIs (JavaScript in a web view is its example); Expo documents JavaScript updates of a React Native app as being on the allowed side, and it is Google's reading that counts.

**What stops a bad update.** `node scripts\native-fingerprint.js` (and the test that runs it with `npx jest`) hashes the native layer (the native packages and their versions, what `app.config.js`
resolves to for each build without its version numbers, the config plugin and `modules\`) and compares it with `native-fingerprint.json`. If the native layer changed while `RUNTIME_VERSION` did not, it
fails: an update published for that runtime version would reach apps that cannot run it. Then either change nothing native, or raise `RUNTIME_VERSION`, run `node scripts\native-fingerprint.js --update`
and ship a new bundle (the old runtime version keeps getting its own updates from the earlier branch while installs of it exist). Before 2.0.0 shipped the fingerprint was simply re-recorded.

**Publishing an update.**

```powershell
pwsh scripts\publish-ota.ps1 -Message "Fix the share button"             # every install of this runtime version (channel production)
pwsh scripts\publish-ota.ps1 -Message "..." -Rollout 10                  # a tenth of them first; publish again at 100 when it looks right
pwsh scripts\publish-ota.ps1 -Message "..." -Branch e2e                  # only the device tests' build
```

It runs the fingerprint check, `tsc` and every unit test first, then `eas update --platform android` (it needs `npx eas login` as the project's owner). Check with `npx eas update:list --branch production`
and by starting a build twice: the first start downloads, the second runs it (the About screen's text does not say which bundle runs; `src/updates/ota.ts` exposes it). **Rollback:** `npx eas update:republish`
(an earlier update) or `npx eas update:roll-back-to-embedded` (the bundle built into the app). An install that cannot reach the service keeps the bundle it has. The update library also sets aside a bundle
that fails as it starts; that has not been tried on this app.

**What is sent.** The request to `u.expo.dev` carries the app's package version and runtime version, the platform, the channel, the ids of the bundles it has, and a random installation number that the library makes
(`EAS-Client-ID`). No name, email, account, advertising ID or anything the reader read or saved. The privacy policy and the About screen say so (policy updated 6 November 2026).

## What the website can change without a new app

The file is `public/app-config.json` (read at `https://plax-rouge.vercel.app/news/app-config.json`; served as JSON with `no-store`, as the update feed is). It holds data and never code. Every part is
optional; one that is missing or refused leaves the built-in value.

| Part | What it does | Rules |
|---|---|---|
| `topics` | The topics offered on the Topics screen and in the choice for For you, in this order, with their emoji and names in English and Hindi. Listing a topic already in the app under another name renames it; listing a new one adds it. | 1 to 40; `news` must be there; ids `a-z0-9`, 2 to 24; names up to 24 characters; the id must be one the feed serves (`app-config.test.mjs` checks it against `TOPICS`) |
| `sections` | The chips of the Headlines topic (All is always first) and the tag a story of that section carries. The website's `NEWS_SECTIONS` and this list must be the same (a test checks it). | 0 to 12; ids `a-z0-9`, 2 to 16; names up to 16 characters |
| `features` | `deeper` (the Go deeper button), `shareLinks` (Share makes a Plax page for the story; off shares the publisher's link), `ads` (all ads), `adPages` (the full-page ad), `sourceName` (the publisher's name in the line above the headline, **in every build**; the website's `SHOW_SOURCE_NAME` must say the same: a test checks it) | a switch is on unless it is `false`; text or a number is refused |
| `ads.pageEvery` | How many stories one full-page ad stands for (the website's `STORIES_PER_AD` must be the same: a test checks it) | whole number 3 to 20 |
| `layout` | How big a story's picture may be: `heroMaxWidth` 1 to 1.6 (of the column's width), `heroMaxHeight` 0.4 to 0.7 (of the page), and the least it is given, `photoMinWidth` 0.4 to 0.7 and `photoMinHeight` 0.2 to 0.35. The website's `useCardFit` must say the same (a test checks it). | the ranges keep the least below the most, and small enough that a long story keeps its photograph on a 360 x 640 page at a 1.3 text size: `layout.test.ts` lays stories out at both ends of every range |
| `notice` | One message, shown once per `id` (a new id shows again). `level` `important` comes back at each start until the reader says Done. Optional `url`, `build` (`all`, `play`, `direct`), `minVersionCode`, `maxVersionCode`, `until` (`2026-12-01T00:00:00Z`). `null` for none. | title 60, body 400 characters and at most 6 line breaks, plain text; the link rules below |
| `update` | In Google Play builds only: `latestVersionCode`, `latestVersionName`, `minSupportedVersionCode`. A build below the newest is offered Google Play (Later is remembered for a day); below the least supported it is asked at every start. It never blocks the app. Set it **after** the new bundle is live on Google Play. `null` for none. | |
| `links` | Up to four extra rows in the menu, each for `all`, `play` or `direct` builds. | label 30 characters in both languages; link rules below |

A link (in a notice or the menu) must be `https` with no port, user name or fragment, and a page of the website (`/news...`), the Google Play page of an app (`/store/apps/details?id=...`) or one of the hosts
in `LINK_HOSTS` of `src/lib/app-config-rules.ts`. Text is plain: control, format (zero-width, bidirectional), line-separator, private-use and unassigned characters, and a space at either end, are refused.

**The publisher's name.** The native app's Google Play build named the publisher whatever the file said. The React Native app does what the website does, in every build: `features.sourceName` is `false`, so no card shows a
publisher's name (the headline is the link to the story at its publisher, and a story with no picture is headed by *Plax* on its poster). Setting it to `true` (and `SHOW_SOURCE_NAME` in `src/lib/app-features.ts`
with it, or the test fails) brings the name back everywhere with no new bundle. Google Play's News policy asks an aggregator for clear information about the publishing sources of what it shows, and the declaration in
the Play Console says each card shows its source; see [PLAY-CONSOLE-ANSWERS.txt](PLAY-CONSOLE-ANSWERS.txt), section 8.

**To change something:** edit `public/app-config.json`, run `npm test` in the repository's root (the file is checked against the app's own rules and cases), and push `main`. **To undo it,** push the earlier content.
What it cannot do is code: a new screen, a new button, a change in how a feed is read, a fix. That is an over-the-air update (or a new bundle, if it is native).

## Publishing the website's APK

A bad feed, or an APK signed with the wrong key, would leave every installed copy unable to update, so scripts do the checking.

1. Raise `VERSION` and `VERSION_CODE` in `app.config.js` (the code must exceed the one in `public\updates.json`). If the native layer changed, raise `RUNTIME_VERSION` and record the fingerprint.
2. `pwsh scripts\build-android.ps1 -Variant preview -Clean`.
3. `pwsh scripts\publish-update.ps1`. It refuses an APK unless it is the preview package, not debuggable, signed by the key pinned in `update-signer.sha256`, within the size limit and newer than the published feed.
   It then copies the file to `..\public\plax-<version>.apk`, removes older `plax-*.apk` and writes `..\public\updates.json`; last, it leaves a local copy at `artifacts\plax-<version>-preview.apk`.
4. Commit `public\updates.json` and `public\plax-<version>.apk` and push `main`. Vercel deploys both in one deployment, so the feed never names a file that is not there.
5. When the deployment is Ready, `pwsh scripts\verify-update.ps1` fetches the live feed and APK the way the app does (HTTPS, no cache), re-applies the app's own rules and checks the headers, the size, the SHA-256,
   the package, the version, the signer and that what is served is what was committed. It writes `artifacts\update-verification.json`.

**Never send a Range request to the production APK** (not from a script, a test or `curl -r`): on 10 October 2026 the shared cache in front of the site stored the 2-byte answer to `bytes=0-1` as the file and served it to every
download for an hour. The APK is `no-store` for that reason. To roll back, revert the commit that changed `updates.json`; copies that already updated stay updated, because Android will not install a lower version code over a higher one,
so a broken build is fixed by publishing a higher version.

## Publishing to Google Play

**The upload key (once).** `pwsh scripts\new-upload-key.ps1` makes a 4096-bit RSA key in `%USERPROFILE%\.plax-signing\`, outside the repository and readable only by your account, and an `upload.properties` that the build reads
(`PLAX_UPLOAD_PROPERTIES` names another place). **Back the folder up somewhere private.** With Play App Signing Google keeps the key that signs what people install; this key only proves that an upload is yours, and if it is lost
Google Play support can register a new one. The Play build is never signed with the debug key.

**The bundle.** `pwsh scripts\build-android.ps1 -Variant play -Clean`, then `node scripts\check-bundle.mjs`. The check uses Google's bundletool (downloaded once from its official release into `.tools\` and compared with the SHA-256 that release
publishes) and the JDK, and stops unless: the bundle validates; it has exactly one signer and it is the upload key; it is `com.plaxlabs.news` at the version in `app.config.js`; the minimum SDK is 26 and the target 36; it is not debuggable; cleartext
traffic and backups are off; it asks for no permission outside the list in the script (`INTERNET`, `ACCESS_NETWORK_STATE` and what the ads library adds: `AD_ID`, the three `ACCESS_ADSERVICES_*`, `WAKE_LOCK`, `FOREGROUND_SERVICE`) and never
`REQUEST_INSTALL_PACKAGES`; its AdMob application id and ad units are the owner's, not Google's sample ones; its native libraries are aligned for 16 KiB pages; the update URL and runtime version are the app's; and the JavaScript bundle is in it.
It writes `artifacts\aab-verification.json`.

**What only you can do in the Play Console**, and what to enter: [PLAY-CONSOLE-ANSWERS.txt](PLAY-CONSOLE-ANSWERS.txt) for this release, with the older answers it builds on in [docs/](docs/). Nothing is submitted for you.

## Moving from the native app

An install of the native app (1.x) is updated in place by this one: the same package, the same signing, a higher version code. What the new app takes over, once, from the native app's files on the phone
(`src/data/legacy-import.ts`, with the module in `modules/plax-native/` reading the old preferences): the saved stories, the list of stories already seen, the language, the theme, the topics chosen for For you and the last feed.
**What it does not take over is the signed-in session**, which the native app sealed with a key of its own: a reader who was signed in signs in again, and their topics and saved stories come back from their account.

## What was and was not verified

**Verified**, on an Android 16 emulator (API 36, x86_64), 6 and 7 November 2026:

- The unit and component tests and the device tests above (88 device tests, 87 passed and 1 skipped on purpose, in one run); the types; the native-layer fingerprint.
- **The move from the native app:** the native 1.7.1 website build was given a dark theme, two topics for For you and a saved story, then the 2.0.0 website build was installed over it (`adb install -r`, the same signer,
  `3a47d0db…41c69`): the dark theme, the topics (Science, Space) and the saved story came across.
- **The Google Play bundle as Play installs it:** `plax-2.0.0-play.aab` turned into the APK set for the emulator with bundletool and installed (`com.plaxlabs.news`, 2.0.0, code 20). The first start after the
  install showed its first story fully drawn at 11.2 s, the next three at 3.4, 3.0 and 2.0 s (the emulator draws in software); the menu is as the website's, with Google's sample ad strip, and the phone logged no crash.
- **The bundle's gate** (`node scripts\check-bundle.mjs`): 25 checks passed, among them one signer, the upload key, package and version, the permission list with the advertising ID permission present, the owner's AdMob
  ids, cleartext traffic and backups off, 16 KiB alignment, Hermes bytecode in the bundle.
- **An over-the-air update through Expo's real service:** a marker update was published to the test-only channel `e2e`; a fresh install of the device-test build started on its embedded bundle (no marker), downloaded the update in
  the background and ran it after the next start (marker shown). The update was then deleted; the `production` branch was never written to.
- The website's pages build (`next build`), with the privacy page, the settings file and the update feed as committed.

**Not verified:** a physical phone of any make; a real (not sample) ad being served, its revenue, or AdMob's and Google Play's review of the app (including Play's reading of an app that shows no publisher names, section 8 of
`PLAY-CONSOLE-ANSWERS.txt`); the real consent message for a reader in the EEA; Google sign-in against the live account service (the project behind it was unavailable; the code runs against a real Supabase stack on the developer's
machine and against fakes); an over-the-air update applied on a Google Play install (only on the device tests' build; the Play and website builds use the same library and differ only in the channel name `production`); a bundle that
crashes as it starts being set aside by the update library; the move from the native app for a reader who was signed in (the session is not carried over, by design); and Hermes on every phone's Android version.
