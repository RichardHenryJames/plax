# Plax for Android

Standalone native Android news/reading app. This is not a WebView wrapper, and
it does not depend on Vanishr or its signing keys, relay, account data or code.
It reads the Plax public feed (`https://plax-rouge.vercel.app/news`) and, for the
optional AI brief, the summarize endpoint. It works without an account; signing in
with Google is optional and only syncs your topics and saved stories (see
*Optional sign-in*), and can be deleted again from the app (see *What is in 1.5.0*). About once a day it also asks the website whether a newer build
exists (see *Updates from inside the app*), except in the Google Play build, which Google Play updates (see *Publishing to Google Play*). Apart from sign-in and that update check,
which need the two small routes and the one small file listed under *Backend changes*,
the app works against the backend as it was before this version.

## Unreleased (after 1.5.5): full-screen stories, and a menu in place of the header and the bottom bar

A reader asked for the app to be "like Inshorts": the header (the Plax mark and the English | हिन्दी switch) and the bottom bar took a
fifth of the screen, and the "fit it in one view" rule of 1.5.5 sometimes left a story with a headline and no text. Nothing is released:
the version is still 1.5.5 (code 13), and no bundle, APK, update file or store entry was touched. No new permission, library or
backend change. The website got the same design (see `TECH.md`, "One view per story").

- **No header, no bottom bar.** A story spans the whole screen between the system bars. A round **☰** button floats over the picture's
  top-left corner (with no picture it stands at the start of the source line, which makes room for it; on Topics, Saved, For you with
  nothing chosen, loading and "all caught up" it is in the corner of the screen) and opens `MenuSheet`, a panel that slides in from
  the left, behind the system bars: the feed language, Feed / For you / Topics / Saved, the news sections (English headlines only,
  as before), the account, the theme, About, Contact us, the privacy policy, the update check and Clear saved stories. The ✕, the
  back button, a tap beside the panel and a swipe to the left close it. A small spinner in the top-right corner shows a refresh in
  progress, as the header's did. `MainActivity` lost `header()`, `navigation()`, `sections()` and the ⋮ `PopupMenu`; the menu's
  actions are the old ones.
- **The buttons are on the source line, and the headline is the link.** The row under the summary is gone (the "Read full story"
  button with the publisher's host, and the brief, Save and Share buttons), so the 60 dp it took go to the story. The brief (✨),
  Save and Share are three 36 dp circles in 44 by 48 dp touch targets (`Ui.lineButton`) at the right end of the tag and source
  line. The headline opens the story at the publisher: a press ripples on it, TalkBack announces "Read full story" as its action, and
  a story with no usable link has a headline that cannot be pressed. The source and its age may take a second line beside the
  buttons, with each part of the age kept whole ("3h ago" never breaks), and the read time is left out on a phone narrower than
  420 dp. The line is never given up now, since the buttons are on it. The picture may be square (it was 4:3) and up to 55% of the
  page, and taller (1.2 times the width, 62% of the page) when there is little to read, as on the website.
- **A simpler menu.** Nothing in it repeats what is a tap away elsewhere. "Check for new stories" is gone: the feed already looks
  by itself when the app comes back after two minutes, offers the "New stories" pill, and the caught-up card has its own button.
  "Your topics" is gone (the Topics screen has a card for it, and the account sheet a row), and so is "Open Plax website" (the
  account sheet has it). Four drawables and the `open_site` string became unused and were removed.
- **The picture keeps its minimum, and the summary is cut where its room ends (after the reader saw a large empty space
  under a two-line summary).** `CardFit` (and `src/lib/card-fit.ts`, with the same test cases) spends the height in this order: the
  source line (with its buttons) and the headline; a photograph gets at least 60% of the width and 30% of the page (never under 96 dp);
  the summary gets what remains, whole when it fits and otherwise cut at a whole line with an ellipsis ("abruptly", as in Inshorts);
  and the picture takes whatever the lines leave. A short summary lets the picture grow, up to 1.4 times its width and 66% of the
  page (a poster's sign grows with its tile), and the room still left after that is spread evenly between the parts, so the page is always
  full. The summary is no longer set smaller before it is cut, so stories look alike. A poster (the emoji
  tile of a story with no photograph) keeps the earlier rule: it is shown only when the whole summary fits beside it. The 1.5.5
  follow-up ("whole summary first, the picture takes what is left") had dropped the picture of any story with a longer text.
- **More text for the app's stories too.** The feed now gives a news story that came with one line the opening of its article (up to
  about 600 characters), so a card has something to fill the page with; the app needs no change to receive it (`content` is longer).
  See `TECH.md`, "More text for a short story". `PLAX_ARTICLE_LEADS=off` on the server turns it off.
- **A bug the new device test found.** `StoryPage` counted a Hindi summary's lines on a copy of its paint, without the fallback-font line
  spacing a `TextView` uses, so Devanagari lines came out shorter than they are, and a summary was thought to fit beside a picture when
  it did not (5 cases in `FitDeviceTest`'s sweep, all in Hindi). The layout used for counting is now built as the view builds its own, and a
  summary is costed at its average line times its lines, not the first three lines times the rest.
- **Go deeper (the AI brief sheet)** keeps its title bar and cross outside the part that scrolls; looked at on the emulator with a
  long brief. (On the website the cross was inside the scrolling part and scrolled away, and the sheet could run past the card: fixed there.)
- **Tests.** `CardFitTest`: 14 JVM tests (a sweep of over 10,000 combinations asserts nothing is planned beyond the page). `FitDeviceTest`
  (5): the pages are the whole screen now (360 x 600, 392 x 780, 412 x 850, 600 x 1000, 851 x 340 and 360 x 300 dp, at three text sizes, English
  and Hindi), with checks that the menu button touches no text and stands inside the picture, and that a picture on the page never comes with a
  cut summary. New `MenuDeviceTest` (4): a story has the whole screen with no header and no bar, the menu holds what they held and scrolls
  to its last row, back / the cross / a tap beside it / a swipe close it, and choosing Topics moves there with the button still one tap away.
  `PlaxDeviceTest`, `ContactDeviceTest` and `UpdateDeviceTest` open the menu button instead of "More options" and the bottom bar.
  `test.ps1` runs `MenuDeviceTest` too. The three lint warnings the change caused (the old ⋮ icon and two strings now unused) were removed.
- **Where it was run.** `test.ps1` needs PowerShell 7.4, which this machine (Windows PowerShell 5.1) did not have, so the same steps were
  run by hand: install both debug APKs, `cmd package compile -m speed`, then `am instrument` on the seven classes plus the new one. The
  Android SDK (platform 36, build tools 36.0.0, emulator and the API 36 Google APIs x86_64 image) was installed under
  `%LOCALAPPDATA%\Android\Sdk` for this, with JDK 21 from `C:\Program Files\Java\jdk-21.0.12`, and the `Plax_News_Test` AVD created.

## What is in 1.5.5 (versionCode 13): one swipe, one story, all of it in one view

A reader asked for a feed "like Inshorts": a story used to scroll inside its card first, and only a second scroll moved to the next
one. Now nothing on a story scrolls, so one swipe always moves to the next story, and each story fits one screen. The website works
the same way (see `TECH.md`, "One view per story"). Nothing else changed: no new permission, no new data, no backend change.

- **What it was, measured first.** Every page was a `ScrollView` (`StoryScrollView`) that let a long summary scroll and handed a swipe
  to the pager only at its edge. With the published 1.5.4 build on the emulator and live stories, 5 of 8 stories needed more than one
  swipe (the first needed 5), and a five-line headline pushed the summary down so that its third line was cut in half behind the
  buttons.
- **What it is now.** `StoryPage`, a `ViewGroup`, replaces the `ScrollView` (`StoryScrollView` is deleted). The picture, the tag and
  source line, the headline, the summary and the Read full story row share the page's height. `CardFit` is the arithmetic, in
  pixels and testable without a screen: the row and the headline are always shown; the picture takes what is left, up to 30% of the
  page, and shrinks to keep three lines of summary before it is dropped (under 96 dp); the headline is set smaller (90%, then 80%)
  before it is ever cut, and keeps two lines while the summary is worth showing; the summary is cut at a **whole line with an
  ellipsis**. Hindi lines are taller than Latin ones, so the summary's lines are counted on its real layout, not estimated. A page too
  short for the source line, one line of the headline and the row gives up the source line (the publisher stays on the Read full story
  row); on a phone on its side the picture stands beside the text.
- **A text that fits is not limited at all.** A layout told "at most N lines" with an ellipsis can break its lines differently from the
  same text without the limit, and then ends in an ellipsis though everything would have fitted. `FitDeviceTest` found it on a Hindi
  headline (the real layout broke at 42 characters where the unlimited one broke at 57); a view is now limited only when it really is cut.
- **Tests.** `CardFitTest` (10 JVM tests, including a sweep of over 10,000 combinations that asserts nothing is ever planned beyond the
  page; shown to fail when the planner is made to give the summary a line too many). `FitDeviceTest` (5 device tests; `test.ps1` now
  runs it) lays out 11 stories, English and Hindi, long and short, with no picture and with no summary, on six page sizes at three text
  sizes, and asserts no overlap, nothing outside the page, text no taller than its room, an ellipsis exactly when text is cut, and
  nothing that scrolls; two more drive the real activity with a stand-in feed of three stories, one long swipe each way, and one that
  starts on the summary.
- **How a swipe is judged in tests.** A pager turns a page on a drag of more than half a page or on a quick flick. On this software-rendered
  emulator a swipe of 56% of a page succeeded 6 times in 12, a swipe of 91% 12 in 12, because the emulator draws only a few frames a second
  and `input swipe` waits for the app between events. The swipe tests therefore drag about 85% of a page; the page's own cost was measured
  and is small (making a page 3 to 12 ms, binding 1 to 4 ms, measuring 2 to 10 ms on a story of ordinary length).
- **Lint.** Two warnings that the new view caused (an allocation in `onMeasure` and a missing constructor "used by tools") are suppressed with
  the reason: a measure happens when a page is made or resized, not every frame, and the view is built in code and never inflated.
- **Version.** 1.5.4 was already built, and a version code cannot be reused, so this is 1.5.5 (code 13). `public\plax-1.5.5.apk` and
  `public\updates.json` were republished with `publish-update.ps1`.

## What is in 1.5.4 (versionCode 12): the new website address

A reader reported that the Google Play build opened with **"No stories right now"** and that **Continue with Google** answered
**"Sign-in is temporarily unavailable. Plax keeps working without it; try again later."** The cause was the domain: `plaxlabs.com`,
which the app and the website were built around, had expired and no longer answers (a request from the development machine fails
the TLS handshake). Neither screen names the domain, so it looked like a connection problem. Where older sections of this file name
`www.plaxlabs.com`, they describe what was true when they were written.

- **Reproduced first.** On the emulator, the 1.5.3 bundle built for Play showed "No stories right now. The feed returned an unreadable
  response" and, on Continue with Google, "Sign-in is temporarily unavailable". The same screens with 1.5.4, installed over 1.5.3 the way
  Play updates a phone, load real stories and open Google's sign-in page.
- **The fix is one constant.** `FeedApi.SITE` is now `https://plax-rouge.vercel.app/news`, the project's own Vercel domain, and every address
  the app uses is built from it: the feed, the AI brief, the update feed, the sign-in return page, the privacy and contact pages. The website
  has the same address in `src\lib\site.ts` (`SITE_URL`): its canonical and Open Graph addresses, sitemap, robots.txt, policy pages, share
  cards, the copied and shared text and the user agent it sends to the news sources all come from it. It is a constant and not an
  environment variable, so that a stale setting cannot put an old address back. Nothing else is served at the domain root, so
  `next.config.js` redirects `/` to `/news` and `/robots.txt` and `/sitemap.xml` to their copies under `/news`.
- **Guards.** `SiteAddressTest` (4 JVM tests) and `src\lib\site.test.mjs` (4 website tests) fail if `FeedApi.SITE` differs from the website's
  `SITE_URL`, if the address is not one https origin under `/news`, if an address the app builds does not come from it, if the update
  feed names a file elsewhere, or if the expired domain appears in any file the site or the apps run from (the second was shown to fail
  with the old domain planted in a source file, naming the file and line).
- **The update feed.** `public\plax-1.5.4.apk` and `public\updates.json` were republished with `publish-update.ps1` (it checked the pinned signer,
  the version and that nothing goes backwards); 1.4.1, which points at the expired domain, is no longer in `public\` and stays in Git history.
- **`scripts\check-accounts.ps1`** now also checks that Supabase's Redirect URLs list allows the app's return page. It does this with a
  read-only request that Supabase answers by redirecting to the requested address if the list allows it and to its Site URL if not, with
  a made-up address as the control. Today it reports that readers would be sent to `https://www.plaxlabs.com/news`.
- **What the code cannot fix.** (1) Supabase's **Site URL** and **Redirect URLs** still name the old domain, so after Google accepts an account the
  reader is sent to an address that no longer exists: until `https://plax-rouge.vercel.app/news/auth/app**` (and `/news/auth/callback`) are added
  there, signing in cannot finish (`SUPABASE_SETUP.md`, step 6). (2) The Play Console's links (website, privacy policy, account deletion, the
  news declaration's contact URL) and the listing text still name the old address. (3) Copies already installed (1.5.0 to 1.5.3 from Google
  Play, 1.4.1 and earlier from the website) only ever ask the old address, so they stay without stories until they are updated; for the website
  copies that means installing `https://plax-rouge.vercel.app/news/plax-1.5.4.apk` once. The steps are in
  [`PLAY-CONSOLE-ANSWERS-1.5.5.txt`](PLAY-CONSOLE-ANSWERS-1.5.5.txt).
- **Version.** 1.5.3 was already built, and a version code cannot be reused, so this is 1.5.4 (code 12).

## What is in 1.5.3 (versionCode 11): one "P" everywhere

The Plax "P" was drawn three different ways, so the app icon, the website and the pictures chat apps show did not match. There is now
**one outline** everywhere. Nothing else changed in how the app works; 1.5.3 also carries 1.5.1's Contact us and 1.5.2's amber icon.

- **What did not match** (measured, not judged by eye). (1) The real logo, `public\plaxlabs_logo.png` (white on transparent,
  2016 x 2112), which the website's header mark draws. (2) A hand-drawn Android vector, used by the launcher icon, the in-app header
  and both splash screens: scaled to the same height it overlapped the logo only **74%** (aspect 0.83 against 0.74: wider, with a
  different stem and bowl). (3) A letter "P" typed in a font on an amber tile in the three share-card pictures (home, topic, story),
  white sans-serif on two and dark serif on the third.
- **What it is now.** An outline of two shapes (the stem and the bowl), traced once from the logo with potrace (GPL; used as a tool on
  the developer's machine, not shipped and not a dependency): blurred a little to remove the logo's jagged raster edge, then nearly
  straight curves straightened, so 19 segments stand in for about 120 jittery ones. It overlaps the logo **99.1%** at the same height
  (99.5% if allowed to stretch); its aspect is 0.745 against the logo's 0.743.
- **Android**: the same two paths in `ic_launcher_foreground.xml` (launcher, dark `#1A1203`), `ic_plax.xml` (header), `ic_splash.xml`
  and `drawable-night\ic_splash.xml`. Their transforms are unchanged, so the "P" is centred as before.
- **Website**: `src\lib\brand.ts` holds the outline, its box, the colours and the proportions; `src\lib\brand-tile.tsx` (`PTile`) draws the
  "P" on the amber tile for `next/og`, and the three share cards use it instead of a typed letter. The header mark (`BrandMark`) still
  masks `plaxlabs_logo.png`, deliberately: that file is the master logo.
- **Icons**, drawn from `brand.ts` by `scripts\brand-icons.mjs` (it needs a browser: `npm i --no-save playwright-core` first; it reproduced the
  four committed icons byte for byte): `src\app\icon.png` (512, rounded amber tile, clear corners, "P" 68% of
  the height), `src\app\apple-icon.png` (180, opaque), new `public\icon-192.png` and `public\icon-512.png` (opaque, full-bleed, "P" 45% so
  it stays inside the circle a maskable icon may be cut to; at 68% its far corners would sit outside it) and the Play icon
  `artifacts\play\icon-512.png` (512, 32-bit, opaque).
- **Two defects found on the way.** The favicon was a white "P" on transparent, nearly invisible on a light browser tab, and about 5%
  squashed (aspect 0.78). The web manifest declared the 2016 x 2112 logo as 512 x 512; it now lists real 192 and 512 icons, the 512 one
  also as maskable.
- **Guards.** `BrandTest` (4 JVM tests): the four drawables draw the same two paths; that outline equals the one in `src\lib\brand.ts`; the
  icon colours equal the website's; the "P" is centred inside the launcher's 66-unit safe circle. `src\lib\brand.test.mjs` (6 tests): the
  outline's structure and box; the logo's aspect; the Android drawables and colours match; the icon files have the sizes and colour types
  the manifest claims; the share cards use `PTile` and none types a "P". Each was shown to bite: a stretched box, a drawable with the old
  "P", one changed digit in the website's path and a larger scale each made the right test fail with a clear message, and each was put back.
- **Not changed.** The accent `#F5B13A`, the splash backgrounds (cream and near-black), `BrandMark`, and the wordmark: it is a sans-serif on
  the home and topic cards and a serif on the story card and in the app, which is a separate inconsistency. The domain root `plaxlabs.com`
  was then a different site and was not touched (that domain has since expired: see 1.5.4).
- **Version.** 1.5.2 was already built, and a version code cannot be reused, so this is 1.5.3 (code 11). The Play answers sheet is now
  [`PLAY-CONSOLE-ANSWERS-1.5.5.txt`](PLAY-CONSOLE-ANSWERS-1.5.5.txt) (it is renamed with each version).

## What is in 1.5.2 (versionCode 10): an amber app icon

The launcher icon was a near-black tile with a white "P". It is now an **amber tile (`#F59E0B`) with a dark "P" (`#1A1203`)**. Nothing
else changed in how the app works; 1.5.2 also carries 1.5.1's Contact us.

- **Why a dark "P".** On amber, a white "P" is about 2.1 : 1 (washed out), a dark one is about 8.6 : 1 and is the colour the app already
  uses for text on its amber buttons. `LauncherIconTest` keeps it that way: it fails if the "P" is less than 4.5 : 1 against the icon's
  background (shown by making the "P" white: "2.15 : 1"), and checks that the adaptive icon still has its themed (monochrome) layer.
- **Why `#F59E0B` and not the app's accent `#F5B13A`.** Same hue, but the accent is pale and reads as yellow; `#F59E0B` is deeper and
  more saturated, so it reads as amber. The in-app accent and the splash screen are unchanged.
- **Where it shows.** The home screen and app drawer (the launcher crops the tile to its own shape; the colours stay), the Play Store
  icon (`artifacts\play\icon-512.png`, regenerated, 32-bit opaque; it has to be uploaded in the Console as well) and the feature
  graphic (`feature-1024x500.png`, the same amber). Android 13 and later can recolour the "P" with the wallpaper's colours when the
  reader turns on themed icons, whatever it is drawn in. The website's favicon is a separate white-on-transparent file and was not touched
  in 1.5.2 (1.5.3 redrew it).
- **Files**: `res\values\colors.xml` (`launcher_background`) and `res\drawable\ic_launcher_foreground.xml` (the "P"'s fill); the
  website APK, the debug build and the Play build all share them.
- **Version.** 1.5.1 was already built (and may already be uploaded), and a version code cannot be reused, so this is 1.5.2 (code 10).

## What is in 1.5.1 (versionCode 9): Contact us, after Google Play's policy notice

On 16 October 2026 Google Play took the 1.5.0 listing down under its **News and Magazines policy**: the app "doesn't contain a
dedicated website and in-app page that's easy to find and clearly shows relevant contact information" (an email address or a
phone number; social media does not count). Plax is declared a news aggregator, and the contact URL in that declaration was the
privacy policy, which has the address in it but is not a contact page; the app itself had no contact page. This version adds both
halves. How the app reads, saves and shares did not change.

- **In the app: Contact us.** The menu (three dots) has **Contact us**, after **About Plax**. It opens a sheet with the address in a
  card (selectable text, so it is read on the screen and not only behind a button), **Plax Labs**, **Email us** (a new message
  in the mail app, subject "Plax 1.5.1 feedback"; with no mail app the address is copied and the reader is told, so it is never
  a dead end), **Copy address**, **Open the contact page** (a Custom Tab), the page's address in words
  (`https://plax-rouge.vercel.app/news/contact`, as Google's declaration help asks that the URL "can also be found in-app"), and a line
  crediting publishers. English and Hindi. **About Plax** shows the address too, on a line of its own. A third button on About
  ("Contact us") was tried and dropped: Android stacked the three buttons and pushed Privacy policy off the screen.
- **On the website: `/contact`.** A page of its own with the heading "Contact us", the address as plain text and a `mailto:` link,
  who runs Plax, what to write about (problems, corrections, publishers and rights holders, privacy and deletion, feedback), how
  replies work, where the stories come from, and `ContactPage` structured data. It is linked from the menu (☰), the desktop left
  rail, the footer of every public page and the privacy policy, and it is in the sitemap (`TECH.md`, *GET /contact*).
- **One address.** `ContactTest` fails if the app's address, contact page or operator name differ from the website's
  `src/lib/legal.ts`, and checks that both languages carry the same placeholders. It was checked by changing the app's address:
  the test names the mismatch.
- No new permission, library, analytics or data: the store build still asks for `INTERNET` only.
- **What the code cannot do**: the Console items. The store listing's contact details (email and website) and the news
  declaration's contact URL have to be changed by the owner, and the new bundle uploaded and sent for review; the steps are at the
  top of [`PLAY-CONSOLE-ANSWERS-1.5.5.txt`](PLAY-CONSOLE-ANSWERS-1.5.5.txt). Nothing was changed in the Console, and the app stays
  "not available" until Google approves the new release.
- A published version is never altered: 1.5.0 (code 8) stays as it was, and `artifacts\plax-1.5.1.aab` is a new bundle (superseded
  by 1.5.2, which adds the amber icon, and then by 1.5.3, which makes the "P" the same everywhere).

## What is in 1.5.0 (versionCode 8): ready for Google Play

The first version built as a Google Play bundle (`com.plaxlabs.news`, the store build) as well as the website's preview
APK. Google Play requires an account made inside an app to be deletable from the app and from a web page, and a privacy
policy that is linked from inside the app. Plax had neither, so this version adds them. How the app reads, saves and shares
did not change.

- **Delete account** (Account sheet, signed in). A red outlined button asks first ("This permanently deletes your Plax
  account and everything stored in it ... It cannot be undone. Topics and saved stories already on this phone stay here"),
  then the app calls the website's `POST /api/account/delete` with the reader's own access token, refreshed and retried once
  like every other account call. The website asks the account service whose token it is and deletes *that* user only; the
  profile, saved stories and reading activity go with it (`ON DELETE CASCADE`). If it cannot be done the reader stays signed in
  and is told "Nothing was changed"; if it is done the phone is signed out (without a pointless logout call), keeps its own topics
  and saved stories, and says so. While it runs the sheet shows only a spinner.
- **Privacy policy in the app**: the menu, **About** and the sign-in screen open `https://plax-rouge.vercel.app/news/privacy`, the page
  Google Play is told about. `https://plax-rouge.vercel.app/news/delete-account` is the web resource for people who no longer have the
  app: sign in with Google and delete, or email.
- **Dialog buttons are readable in the light theme.** Their text was the accent colour, 1.6:1 against the dialog (the guideline
  is 4.5:1); it is now the accent-text colour, 5.2:1. The dark theme is unchanged (8.8:1). This affects every dialog, including
  the older ones.
- **Store tooling**: release signing from a private upload key, `new-upload-key.ps1` and `package-aab.ps1`.
- No new permission, library, analytics or tracking: the store build still asks for `INTERNET` only.

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
  `https://plax-rouge.vercel.app/news/s/<slug>-<id>`. Pasted into WhatsApp (or anything else that makes link
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
  buttons on the source line, typography (serif headlines, sans text) and theme choice (System by default). The
  differences are deliberate and listed in [TECH.md](../TECH.md#navigation--menubuttontsx-menudrawertsx-leftrailtsx-brandmarktsx)
  (since the full-screen change, header and bottom bar are replaced by a menu in both).

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
  `https://plax-rouge.vercel.app/news/updates.json`, and compares its `versionCode` with the
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
  must be exactly `https://plax-rouge.vercel.app/news/plax-<versionName>.apk` (so the file can
  only live on the Plax website), the size is capped at 95 MiB and a build whose
  `minSdk` is above this phone's is not offered. The request is HTTPS only, follows no
  redirect, keeps no cookie or cache, is not retried and sends no identifier; like any
  HTTPS request it exposes your IP address and OkHttp's default User-Agent.
- **What guards the installation**: the HTTPS connection to `plax-rouge.vercel.app` and Android's
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
- Four places: **Feed**, **For you**, **Topics**, **Saved**, all in the ☰ menu (a story has the whole screen; there is no
  bottom bar). For you mixes the topics you choose (a card on that screen, or a row in the account sheet). Nothing has to be
  chosen first: the app opens on public news. The wording and layout match the
  website.

Optional sign-in
- ☰ > **Account** > **Continue with Google**. The system browser (a
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
  body without the repeated headline, a headline that opens the full story, AI brief, bookmark,
  share), skeleton loading, a menu (☰) instead of a header and a bottom bar, topic tiles, light/dark/
  system theme, large-text and tablet-width handling, and light haptics.
- **English and Hindi** (the language switch is at the top of the ☰ menu): the native Hindi feed plus a
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
debuggable, signed with the local Android debug key) and `release` (the Google Play store
build, signed with the Plax upload key when it is present; see *Publishing to Google Play*).

The verified handoff copy is the newest `artifacts\plax-<version>-preview.apk` (now `plax-1.4.1-preview.apk`), byte
for byte the website's `public\plax-<version>.apk`. `publish-update.ps1` leaves it there when it publishes, and
`artifacts\update-verification.json` (written by `verify-update.ps1`) has the hash the live site was checked against.
`artifacts\` is deliberately git-ignored: the APKs and logs are local evidence, not repository content. The preview
package is **com.plaxlabs.news.preview**, version **1.4.1-preview / code 7**; it installs over every earlier preview
build (1.0.0 to 1.4.0), all signed by the same debug key (1.3.1 to 1.4.0 and 1.4.0 to 1.4.1 were exercised through the
real update feed, and 1.2.0 and 1.3.0 to 1.3.1 earlier; see below) and can coexist with other apps. It supports Android
8 / API 26 or newer and targets Android 16 / API 36. The manifest declares one
exported browsable filter, the sign-in return address above, and `singleTask` launch so the return
reaches the running app.

The release package is `com.plaxlabs.news`, built by `package-aab.ps1` and signed with its own private upload key, never
the preview/debug key (see *Publishing to Google Play*). Publisher and content licensing and the store's disclosures are the
owner's to review before publication. Nothing is automatically published.

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
   file to `..\public\plax-<version>.apk`, remove older `plax-*.apk` and write `..\public\updates.json`;
   last, it leaves a local copy of the same file at `artifacts\plax-<version>-preview.apk` (not committed).
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

## Publishing to Google Play

The `release` build type is the store build: package `com.plaxlabs.news`, R8-shrunk, `PLAY_STORE = true` (it never looks for
updates itself; the menu says **Open Google Play** instead, and **About** says nothing about update checks), and its own Google
sign-in return scheme (`com.plaxlabs.news`, which the website's `/auth/app` route already accepts). The website keeps
distributing the separate `com.plaxlabs.news.preview` APK; the two install side by side and are updated by different channels.

**The upload key (once).** `.\new-upload-key.ps1` makes a 4096-bit RSA key in `%USERPROFILE%\.plax-signing\`, outside the
repository and readable only by your account, and an `upload.properties` that `app\build.gradle` reads (`PLAX_UPLOAD_PROPERTIES`
names another place). The passwords are random, written only to that file and never printed. **Back the folder up somewhere
private.** With Play App Signing (the default for new apps) Google keeps the key that signs what people install; this key only
proves that an upload is yours, and if it is lost Google Play support can register a new one. It is never the Android debug
key, which `package-aab.ps1` refuses. Without the file the release type is simply unsigned.

**The bundle.** `.\package-aab.ps1` builds `:app:bundleRelease`, checks the result with Google's bundletool (downloaded once from
its official release into `.tools\` and compared with the SHA-256 that release publishes) and leaves `artifacts\plax-<version>.aab`,
the R8 mapping and `artifacts\aab-verification.json`. It stops unless the bundle validates; has exactly one signer and it is the
upload key; is `com.plaxlabs.news` at the version in `app\build.gradle`; has min SDK 26 and target SDK 36 (Google Play requires 36 for
new apps from 31 August 2026); is not debuggable; has cleartext traffic and backups off; asks for no permission but `INTERNET`
(plus the AndroidX receiver-protection one) and never `REQUEST_INSTALL_PACKAGES`; and is under 200 MB. `-NoBuild` only re-checks.
There is no native code, so Google Play's 16 KB page-size rule does not apply. The R8 mapping travels inside the bundle for crash
reports.

**What only you can do in the Play Console**, and what to enter (nothing here is submitted for you). The complete,
field-by-field version, with the copy-paste listing text, the Data safety answers, the declarations, the reviewer text and the
release steps, each item marked READY, DRAFT, OWNER or HOLD, is [`PLAY-CONSOLE-ANSWERS-1.5.5.txt`](PLAY-CONSOLE-ANSWERS-1.5.5.txt)
next to this file (it begins with what changed in 1.5.5, then what to do about the expired domain); this table is only the summary:

| Item | State |
|---|---|
| Privacy policy URL | `https://plax-rouge.vercel.app/news/privacy` (live), also linked inside the app |
| Contact (News policy) | A dedicated page, `https://plax-rouge.vercel.app/news/contact`, and **Menu > Contact us** in the app. Give that URL as the news declaration's contact URL (not the privacy policy: Google rejected that), and fill in the store listing's contact details (email, and the website `https://plax-rouge.vercel.app/news`) |
| Account deletion | In the app: Account, then Delete account. Web resource for the Data safety form: `https://plax-rouge.vercel.app/news/delete-account` |
| Data safety | Answer from what the code does (below), then check it against Google's definitions |
| App access | Nothing is locked: every feature works without signing in, so no reviewer login is needed |
| Ads | None |
| Target audience | The policy says Plax is for people 13 and over, so choose 13+ (not children) to match it |
| Content rating | The questionnaire is yours to answer; the feed shows publishers' headlines, which can be about crime or violence |
| News apps | Plax is an aggregator, so the News and Magazine declaration applies (required since 27 August 2025). Every story is attributed to its source with a link out; the answers are in section 9 of the answers file, and the legal-entity facts are yours. The declaration's contact URL must be the contact page |
| Testing | A personal developer account created after 13 November 2023 must first run a closed test with at least 12 testers for 14 days |
| Listing | The copy-paste text (English, and a Hindi draft), its character counts and the alt text are in the answers file. The graphics (a 512 px icon, a 1024x500 feature graphic and six 1080x2160 phone screenshots of the store build, at most 2:1) are in `artifacts\play\` (local, not committed). Three screenshots show a publisher's photograph: see the note in section 4 of the answers file before uploading them |
| Content licensing | Plax shows headlines, short summaries and pictures that belong to publishers, with attribution and a link to the full story. Whether that is acceptable for a store listing is a licensing question for you, not something a test can show |

*Data safety, from the code.* Nothing is collected without an account except what any web service sees (an IP address in the
hosting provider's connection log), which Google treats as processed, not collected, when it is not stored by you. With a Google
account: email address and name (Personal info), the address of the Google profile picture (declare it as Photos to be safe),
the account id (Identifiers), the topics chosen and the stories saved (the
Android app) and, on the website only, reading activity. Purpose: app functionality and account management. Encrypted in transit
(HTTPS). Users can ask for deletion, in the app and at the web resource above. No data is sold, and none is shared for advertising;
story text sent for an AI brief goes to AI services acting for Plax and carries no account.

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
# The 14th of them, deleting an account, also needs the website built and started against the same stack (its three Supabase
# variables pointed at http://127.0.0.1:54321 and the stack's keys, then `npm run build`, `npx next start -p 3128`):
$env:PLAX_LOCAL_SITE = 'http://127.0.0.1:3128/news'
..\scripts\auth-stack\down.ps1
```

A normal `.\build.ps1` lists 165 JVM tests and skips 14 of them (the stack tests below); 151 run.

**Run the device suite on a quiet machine, on an emulator that has finished starting.** Its checks are made by UiAutomator against a
software-rendered emulator, so they time out when the machine is busy. A first 1.4.0 run, with a Gradle daemon, the website's dev
server, a Docker stack and a second emulator all running, failed 9 tests (three in `UpdateDeviceTest` that were
looking for the menu, then the new share tests behind them); the same tests passed alone, and all 69 passed once
the other work was stopped. Stop `gradlew --stop`, dev servers and containers first. A freshly cold-booted emulator needs several
minutes as well: for the first minutes its load average is above 30, and System UI, Google Play services, the Google app and
Wellbeing raise "not responding" dialogs that sit over the app. A 1.5.0 run started straight after boot failed 9 tests (three in
`UpdateDeviceTest`, six in `ShareDeviceTest`, the last two classes, all at "the screen is up" or "the share sheet opens"); after the
load fell below 1 and the dialogs were dismissed all 72 passed. The suite also assumes a
clean app: if you have used it by hand on the emulator (a saved story is enough), clear it first with
`adb shell pm clear com.plaxlabs.news.preview`, or `appNeedsNoLoginAndSupportsTopicsSavedAndRotation` will not
find the empty Saved tab.

- **151 JVM unit tests**: strict JSON shape and limits, server errors, escaped URLs, cache
  format, repeated-headline removal (including sentences that merely begin with the
  headline), read-time parsing, image width/sampling rules, cache-header rewriting,
  Markdown rendering rules, AI request/response validation, sections and request URLs;
  the no-repeat engine (same-event matching in English and Hindi, the seen history and
  its damaged-data handling, merging and caps, 16 tests); the feed state machine with
  fake sources (sessions, dwell, caught-up, For you, 14 tests); the sign-in protocol,
  PKCE and token handling (16 tests); the account manager's merge, queue and
  session rules (30 tests, six of them about deleting the account: the token used, a refresh first, a refused
  token retried once, a failure leaving the account in place, a session that cannot be refreshed ending cleanly,
  and doing nothing when signed out), and the HTTP the deletion sends (`SupabaseTest`); the update feed parser and client (9 tests: every
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
  survives the cache and saved files while older files still load); and the contact details
  (`ContactTest`, 4 tests: a real address, the website's contact page, the address, page and operator equal to the
  website's `legal.ts`, and the same placeholders in English and Hindi); and the launcher icon (`LauncherIconTest`, 3 tests: how
  contrast is measured, the "P" at least 4.5 : 1 against the icon's background, and the adaptive icon's themed layer); and the one
  "P" (`BrandTest`, 4 tests: the four drawables draw the same two paths, that outline equals the website's `src\lib\brand.ts`, the icon
  colours equal the website's, and the "P" is centred inside the launcher's safe circle); and the site address (`SiteAddressTest`, 4 tests:
  `FeedApi.SITE` equals the website's `SITE_URL` in `src\lib\site.ts`, it is one https origin under `/news`, every address the app
  builds (privacy, updates, sign-in return, contact, feed) comes from it, and no file under `src\main` names the expired domain).
- **14 opt-in tests against a real Supabase stack** (`AccountLocalStackTest`, skipped unless
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
  signed out with a message; and the reading-streak function changes only the caller's own row. The 14th, which also needs
  `PLAX_LOCAL_SITE`, runs the app's own deletion through the real website route into the real stack: the account, its profile,
  saved stories and reading activity are gone, the old refresh token is dead, the phone is signed out with its own topics intact,
  and a second reader's account and data are untouched.
- **78 Android instrumentation tests** (82 with `-LiveFeed`): bookmarks, the on-disk feed
  cache (round trip, per-language, damaged files), card rendering and actions, skeleton
  geometry, navigation and rotation, rendering of every screen and state in both
  languages, the AI sheet (loading, result, language switch without refetch, failure,
  retry, cancel on dismiss), theme preference, Hindi translations, 15 cache-first
  behaviours driven by a controllable network, a picture interrupted while it connects
  (the 1.3.1 fix), the no-repeat flows (read, leave, return;
  caught-up; earlier stories; new stories) and the account flows against fakes: Keystore
  sealing and tamper detection on the real device keystore, the account sheet, sign-in
  return merging data and sign-out leaving it on the phone, topics sent while signed in,
  an unsolicited sign-in callback changing nothing, and deleting the account (asking first, cancelling deleting nothing,
  confirming signing the reader out with the phone's data kept, a failure keeping them signed in, and the privacy policy one
  tap from the sign-in screen). Nine more cover updates on a real
  screen: the offer and its text, **Later**, cancelling, **Download** starting the browser on
  the exact APK address, nothing appearing over an open sheet until the app is next in front,
  surviving rotation, the real **Check for updates** menu item (through the system's
  accessibility tree, reading the toast it shows), a store build's menu and About text, and
  the real preferences file. Six more (`ContactDeviceTest`) cover Contact us on a real screen: it is in the menu and
  shows the address, who makes Plax and the contact page in words; About carries the address on a line of its own and
  keeps its two buttons; **Email us** opens a new message to that address (the outgoing intent is intercepted); the page
  button opens `https://plax-rouge.vercel.app/news/contact`; **Copy address** puts the address on the clipboard; and with every
  mail app switched off for the test (and back on after) the address is copied instead. The test script precompiles the
  debug build so timing is not class-verification time.

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
and device transfer are disabled. **☰ > Clear saved stories** removes the
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

## Verification performed for 1.5.5 (30 October 2026)

On the isolated Android 16 (API 36, x86_64) `Plax_News_Test` emulator, the development machine, a real browser (Microsoft Edge, headless,
driven by Playwright) and the deployed site; no physical phone, no Play Console, no Supabase dashboard.

- **The problem, measured first.** The published 1.5.4 preview build on the emulator with live stories: 5 of 8 stories needed more than one
  swipe, the first needed 5, and a five-line headline cut the third line of the summary in half behind the buttons.
  On the website, 1.5.4's card had an inner scroll container, a swipe that began on a link did nothing, and the wheel needed a 160 px push
  past the edge.
- **Tests.** **175 JVM tests** listed (10 new: `CardFitTest`), 0 failing, 14 opt-in skipped, 161 run; lint **0 errors** and 1 warning (a newer
  Android Gradle plugin exists) for debug and preview (the two warnings the new view caused are suppressed with reasons); **83 device tests**
  pass (78 + 5 new, 247 s). The website: `tsc` clean, **146 unit tests** (135 + 11: `card-fit.test.mjs`) and a production build.
  Along the way the new tests found real problems: no-summary pages that overflowed (fixed in `CardFit`), a Hindi headline cut with an ellipsis
  though it fitted (see 1.5.5 above), and views that read as "scrolling" because of a zero-height summary (a test-helper bug).
- **Mutation checks.** Making the planner give the summary one line too many fails 7 of the 10 `CardFitTest` tests, the sweep included; taking
  the half-pixel tolerance out of the website's planner fails its new test with exactly the failure seen in the browser.
- **On the emulator, the debug build against live stories.** After the change 9 of 10 stories moved on with a single swipe (the first, right after
  a cold start, needed two); there is no `ScrollView` on any page. Looked at: a typical story, a four-line headline, a story with no picture
  (poster), a long summary cut at a whole line with an ellipsis, Hindi, **text at 200%** (the picture is dropped; the headline and summary
  end in ellipses at whole lines; the row stays whole), and a **phone on its side** (the picture beside the text). The settings were put back.
- **Why swipes are long in the tests.** A pager turns a page on a drag of more than half a page or on a flick, and this emulator (software
  rendering, a few frames a second) delivers a gesture sparsely. With app logging added for the test and then removed: a swipe of 56% of the
  page worked 6 times in 12 and one of 91% worked 12 in 12; a page costs 3 to 12 ms to make, 1 to 4 ms to bind and 2 to 10 ms to measure on
  stories of ordinary length. It is not a defect of the page, and it was not tried on a phone.
- **The website, in Edge, on a production build and then on the live site.** A phone (390x844), a small phone (360x640), a tablet (768x1024),
  a desktop (1440x900), a short laptop window (1280x680) and a phone on its side (851x393), over 12 live stories each locally and 8 on the live
  site: no card overflowed, nothing scrolled, and **one touch swipe or one wheel push moved every story**. Also: Hindi (6 of 6 cards), a picture
  that fails to load (the poster), the Go deeper sheet (it floats above its row, a swipe that starts on it stays on the story, the close button
  works, reopening does not ask again, a failure is told inside it), a swipe that starts on the headline, and a topic feed with its chip
  menu and the quiz in a sheet: **22 interaction checks pass** locally, and the same set on the live site. Three real bugs were found by this
  and fixed: the wheel lock's timer was cleared when the handler was registered again after a move, so the next push of the wheel was swallowed
  (an old bug, hidden while a gesture needed a 160 px push); `scrollHeight` counted the few pixels of the entrance animation's slide as overflow
  and cut a line from a card that fitted; and room for exactly two lines came out as 1.9999999999999998 of one and cost a line.
- **The bundle** `artifacts\plax-1.5.5.aab` (3,061,690 bytes, SHA-256 `1879e2cf661b5415d1b40419ae3ee677d4c3ebc3600876c609dc2c55e13372f9`): the
  15 checks of `package-aab.ps1` pass (bundletool 1.18.3 validates it; one signer, the Plax upload key, SHA-256 `dade46fd…de1219`; package
  `com.plaxlabs.news`, 1.5.5 (13), min SDK 26, target SDK 36, not debuggable, no cleartext, no backups, `INTERNET` as the only permission besides
  the AndroidX receiver-protection one).
- **Installed over 1.5.4 with bundletool, data kept** (as Play updates a phone; version code 12 became 13). **33 smoke checks** pass: the feed
  loads real stories, no "No stories right now", no page has a scroll view, six of six stories moved on (five with a single swipe), the menu,
  Contact us, About with the version, Continue with Google reaching Google's sign-in page (it takes 15 to 20 s to load on the emulator; the check
  polls for it), no crash, no ANR, no cleartext. The six Play screenshots were retaken from this install.
- **The update feed.** `verify-update.ps1` against production, after the deployment: 19 checks pass and it reports "the site serves 1.5.5 (code 13)
  as a valid update" (feed type, no-store, no redirect, size, SHA-256, package, version, minimum SDK, not debuggable, the pinned signer).

**Not verified**: a physical phone (nothing is claimed about any device); a browser other than Edge (the line clamps are `-webkit-line-clamp`,
which Chrome, Safari and Firefox support, but they were not run); text-size changes of the browser itself; finishing a Google sign-in (Supabase's
Redirect URLs list still named the old domain when last checked); the 14 opt-in tests that need the Docker stack; Google Play review and rollout;
the Play Console, Google Cloud and Search Console settings, which were not touched.

## Verification performed for 1.5.4 (30 October 2026)

On the isolated Android 16 (API 36, x86_64) `Plax_News_Test` emulator and the development machine; no physical phone, no Play Console, no Supabase
dashboard.

- **The problem, reproduced.** The 1.5.3 bundle built for Play, installed on the emulator with no data: the feed said "No stories right now. The
  feed returned an unreadable response. Please try again." and Continue with Google said "Sign-in is temporarily unavailable. Plax keeps
  working without it; try again later." From the development machine the old domain fails the TLS handshake; the Vercel domain serves
  `/news`, the account settings, the contact and privacy pages.
- **Tests.** **165 JVM tests** listed, 0 failing, 14 opt-in skipped, 151 run (the 4 new ones are `SiteAddressTest`, which ran and did not skip,
  so the comparison with the website's `site.ts` was made); lint **0 errors**, 1 warning (a newer Gradle exists) for debug and preview;
  **78 device tests** pass before the push (205 s), and **82** with `-LiveFeed` after the deployment (192 s), the extra four being the app's own
  code reading the real English and Hindi feeds and the update feed from the new address. The website: `tsc` clean, **135 unit tests** (131
  before; the 4 new ones are `site.test.mjs`) and a production build. The first build failed: the topic share card had two children in one
  element after the address became text from a constant, which the image renderer refuses; it is one string now, and the build completes.
- **Served locally and then live.** `next start` and then Vercel: `/` answers 307 to `/news`, `/robots.txt` and `/sitemap.xml` 307 to their
  copies, robots.txt and the sitemap name the new host, the canonical and `og:` addresses name it, and 13 addresses (the pages, the manifest,
  robots, the sitemaps, the update feed and a story page) were searched for the old domain (none). The three share cards were looked at with
  the new address printed on them.
- **The bundle** `artifacts\plax-1.5.4.aab` (3,058,333 bytes, SHA-256 `a9ab824412296791188bccb532f6d9ad3b064d058ca0fc9c3ae2eb199ce622e2`): the
  15 checks of `package-aab.ps1` pass (bundletool 1.18.3 validates it; one signer, the Plax upload key, SHA-256 `dade46fd…de1219`; package
  `com.plaxlabs.news`, 1.5.4 (12), min SDK 26, target SDK 36, not debuggable, no cleartext, no backups, `INTERNET` as the only permission besides
  the AndroidX receiver-protection one).
- **Installed over 1.5.3 with bundletool, data kept** (as Play updates a phone; bundletool needs the JDK in `JAVA_HOME`, not the Java 8 on the
  path): version code 11 became 12, the feed loaded real stories, and Continue with Google opened Google's sign-in page in a Chrome tab ("Sign in
  to continue to the Supabase project"). **27 smoke checks** on that install pass: feed, no "No stories right now", menu, Contact us with the
  new address in words, About with the version, dark theme, sign-in reaching Google, no crash, no ANR, no cleartext.
- **The update feed.** `verify-update.ps1` against production: 19 checks pass and it reports "the site serves 1.5.4 (code 12) as a valid update"
  (feed type, no-store, no redirect, size, SHA-256, package, version, minimum SDK, not debuggable, the pinned signer).
- **The account service.** `scripts\check-accounts.ps1` against production: every check passes except one, which is the point: **Supabase's
  Redirect URLs list allows the app's return page** fails with "readers would be sent to https://www.plaxlabs.com/news instead". The probe was
  validated with a control: a made-up address, and the old domain's return page (allowed), behaved as expected. Until the owner adds the new
  address in the Supabase dashboard, a reader can pick a Google account but Supabase then sends the browser to the old domain.

**Not verified**: finishing a Google sign-in (blocked on that Supabase setting, and a real Google login on a Play build has never been done);
the 14 opt-in tests that need the Docker stack (their expectations were updated to the new address, but they were not run); a physical phone;
Google Play review and rollout; the Play Console, Google Cloud and Search Console settings, which were not touched; chat previews and links
that were shared before today, which carry the old address.

## Verification performed for 1.5.3 (17 October 2026)

On the isolated Android 16 (API 36, x86_64) `Plax_News_Test` emulator and the development machine; no physical phone and no Play Console.

- **The match.** The shapes were overlapped at the same height: the old Android vector **74%**, the traced outline **99.1%** (99.5% allowing for
  stretch). Old, new and the logo were also looked at side by side, and the new "P" at 16 to 512 pixels on light and dark backgrounds
  and inside circular masks (local images, not committed).
- **Tests.** **161 JVM tests** listed, 0 failing, 14 opt-in skipped, 147 run (the 4 new ones are `BrandTest`); lint **0 errors**, 1 warning
  (a newer Gradle exists) for debug and preview; **78 device tests** pass (197 s, clean app, settled emulator). The website: `tsc` clean,
  **131 unit tests** (125 before; the 6 new ones are `brand.test.mjs`), and a production `next build` completes and generates the topic
  share cards (one of them was looked at).
- **The bundle** `artifacts\plax-1.5.3.aab` (3,058,301 bytes, SHA-256 `6961f2bfd3ac14d2c82cd26842ebac9377420020a0b32a5011b20bf34143ffbc`):
  the 15 checks of `package-aab.ps1` pass: bundletool 1.18.3 validates it; one signer, the Plax upload key (SHA-256 `dade46fd…de1219`, not the
  debug key); package `com.plaxlabs.news`, 1.5.3 (11), min SDK 26, target SDK 36, not debuggable, no cleartext, no backups, `INTERNET` as the
  only permission besides the AndroidX receiver-protection one; about 3 MB against Play's 200 MB limit.
- **Installed from that bundle with bundletool** (24 smoke checks, all passing; it opened in 1.9 s on that emulator). In the emulator's own
  launcher (app drawer, searching "Plax") both entries, the store build and the preview build, show the amber icon with the two-piece "P";
  the in-app header and the splash screen (caught mid-fade) were looked at.
- **Play graphics.** `icon-512.png` is 512 x 512, 32-bit, every pixel opaque (corner `#F59E0B`). The six screenshots were retaken from the
  installed bundle (1080 x 2160, 24-bit, a demo status bar with Wi-Fi and battery only) and each was looked at: none shows an identifiable
  person, and 01 and 02 carry one publisher's picture each. The earlier set showed the header with the old "P".
- **Live after the deploy** (commit `56f8048`): `/news/opengraph-image`, `/news/topics/science/opengraph-image` and a story's card are
  1200 x 630 PNGs that show the tile; `/news/icon.png` (512, rounded, transparent corners), `/news/apple-icon.png` (180, opaque),
  `/news/icon-192.png` and `/news/icon-512.png` return 200 at those sizes, and `/news/manifest.webmanifest` lists the last two (the 512 one
  also as maskable). The cards and icons were looked at on light and dark backgrounds, down to 16 pixels.

**Not verified**: the icon on a physical phone or in other launcher shapes; themed icons (how Android 13 and later recolours the "P"); the
Play listing after upload; that Google accepts the release; and how a chat app that has already cached a Plax link's preview will show it
(WhatsApp, Telegram and others keep previews for a while, so a link shared before today may keep its old picture until their cache expires).

## Verification performed for 1.5.2 (17 October 2026)

On the isolated Android 16 (API 36, x86_64) `Plax_News_Test` emulator and the development machine; no physical phone and no Play Console.

- **The colour choice.** Four ambers (`#F5B13A` today's accent, `#F59E0B`, `#FFA000`, `#FF8F00`) with a dark and with a white "P" were
  drawn the way a launcher draws an adaptive icon (circle and rounded square, on a dark and a light wallpaper) and compared by WCAG
  contrast: dark "P" 8.1 to 9.9 : 1, white "P" 1.9 to 2.3 : 1. `#F59E0B` with `#1A1203` was chosen. The comparison is in
  `artifacts\play\icon-options.png` (local, not committed).
- **Tests.** **157 JVM tests** listed, 0 failing, 14 opt-in skipped (the 3 new ones are `LauncherIconTest`); lint **0 errors**, 1 warning
  (a newer Gradle exists) for debug and preview; **78 device tests** pass (212 s, clean app, settled emulator). `LauncherIconTest`'s
  contrast check was shown to bite: with the "P" made white it failed with "2.1476… : 1", and the dark "P" was put back.
- **The bundle** `artifacts\plax-1.5.2.aab` (3,057,281 bytes, SHA-256 `710910dc9ceb45a6fc1a38710bd52f95759adf98d2da5b512a20efe1b0b7f697`):
  bundletool 1.18.3 validates it; one signer, the Plax upload key (SHA-256 `dade46fd…de1219`, not the debug key); package
  `com.plaxlabs.news`, 1.5.2 (10), min SDK 26, target SDK 36, not debuggable, no cleartext, no backups, `INTERNET` as the only permission
  besides the AndroidX receiver-protection one.
- **Installed from that bundle with bundletool** (24 smoke checks, all passing: the menu, Contact us, About, dark theme, no crash, no ANR,
  no cleartext message). In the emulator's own launcher (app drawer, searching "Plax") the old black icon from the earlier debug build
  sat next to the new amber one, and both were seen at full size (`artifacts\play\icon-on-launcher.png`, local, not committed).
- **Play graphics.** `icon-512.png` is 512 x 512, 32-bit, every pixel opaque (corner `#F59E0B`, inside the "P" `#1A1203`, read back from the
  file); `feature-1024x500.png` is the same amber. Both were looked at.

**Not verified**: the icon on a physical phone or in another maker's launcher shape (the comparison image approximates a circle and a
rounded square); themed icons (turning the setting on in the emulator did not change the drawer, so nothing is claimed about how the
"P" is recoloured); the Play listing icon after upload; that Google accepts the release.

## Verification performed for 1.5.1 (17 October 2026)

On the isolated Android 16 (API 36, x86_64) `Plax_News_Test` emulator, the development machine and the live website; no physical phone,
no real Google account and no Play Console. Nothing was changed in the Console.

- **Website**: `tsc` clean; `npm test` **125** (122 before: `legal.test.mjs`, 3 tests); a production build with `/contact` prerendered.
  In a real browser (Edge driven by Playwright, local dev server), **19 of 19 checks**: on a phone-sized screen the ⋮ menu lists
  **Contact us** and opens `/news/contact`, which has the heading, the address as visible text inside the screen and a `mailto:`
  link; on a desktop-sized screen the left rail links to it; the footer of `/headlines`, `/headlines/india`, `/samachar`, `/topics`,
  `/topics/science`, `/privacy` and `/delete-account` shows the link without opening a menu; the privacy page has the address in its
  opening paragraph and its Contact section points to the new page; no script errors. Light and dark were looked at.
- **Android**: debug, preview and release build; lint **0 errors**, 1 warning (a newer Gradle exists) for debug and preview;
  **154 JVM tests** listed, 0 failing, 14 opt-in skipped; **78 device tests** pass (220 s, clean app, settled emulator; the 72 earlier
  ones and `ContactDeviceTest`'s 6). `ContactTest`'s cross-check was shown to bite: with the app's address changed it failed with
  "the app and the website show different addresses", and the real address was put back.
- **The bundle** `artifacts\plax-1.5.1.aab` (3,057,255 bytes, SHA-256 `fa68a8b37c9feb47b9dad9c3876b24934a222fd8570fd49749d4bdb5679da2ea`):
  bundletool 1.18.3 validates it; one signer, the Plax upload key (SHA-256 `dade46fd…de1219`, SHA-1 `8C:D4:EC:82…03`, read again from the
  file, not the debug key); package `com.plaxlabs.news`, 1.5.1 (9), min SDK 26, target SDK 36, not debuggable, no cleartext, no backups,
  `INTERNET` as the only permission besides the AndroidX receiver-protection one, no native code.
- **Installed from that bundle with bundletool** and checked on the screen (24 checks, all passing): the menu says **Open Google Play** and
  not **Check for updates** and lists **Contact us** (after **About Plax**); the sheet shows the heading, the address as text, **Plax Labs**,
  **Email us**, **Copy address**, **Open the contact page**, the page's address in words and the line crediting publishers, in light, dark
  and Hindi; **About** shows the version (not "-preview") and the address on its own line and keeps **Privacy policy** and **Done**; no crash,
  no ANR, no cleartext or StrictMode message.
- **Production, after deployment** (Vercel build succeeded): `https://www.plaxlabs.com/news/contact` answers 200, `index, follow`, its own
  canonical address, the heading and the address in the raw HTML (read as Googlebot, no scripts), the `mailto:` link and `ContactPage`
  data; it is in `sitemap.xml`; the root `robots.txt` blocks only `/news/auth/` and `/news/api/`; `/news`, `/news/headlines`,
  `/news/samachar`, `/news/topics`, `/news/topics/science`, `/news/privacy` and `/news/delete-account` all link to it. From the store
  build on the emulator, **Open the contact page** opened the live page in a Chrome Custom Tab ("Contact us · Plax", the address on screen).

**Found and fixed while verifying**: the first version of the change put a **Contact us** button on **About**; the three buttons stacked and
the long dialog pushed **Privacy policy** off the screen, so it was removed (the address stays in About's text, on its own line). A
device test that needed a phone without a mail app was skipped on an emulator that has Gmail, and `test.ps1` counts a skip as a failure, so
it now switches the mail apps off for that test and back on after.

**Not verified**: that Google accepts the fix (review is the Console's); anything in the Console; the Email us button with a real mail app
sending a message (the intent is checked, not a delivery); a physical phone; real Google sign-in from a Play-installed build.

## Verification performed for 1.5.0 (13 October 2026)

On the isolated Android 16 (API 36, x86_64) `Plax_News_Test` emulator, the development machine, and a local Supabase stack
(GoTrue, PostgREST, Postgres loaded with `supabase-schema.sql`); no physical phone, and no real Google account or Play Console.

- **The bundle** `artifacts\plax-1.5.0.aab` (3,053,017 bytes): bundletool 1.18.3 validates it; one signer, the Plax upload key
  (SHA-256 `dade46fd…de1219`, not the debug key); package `com.plaxlabs.news`, 1.5.0 (8), min SDK 26, target SDK 36, not debuggable,
  no cleartext, no backups, one permission (`INTERNET`) plus the AndroidX receiver-protection one, no native code, R8 mapping included.
- **Installed from the bundle with bundletool** (the device gets a 2.7 MB base split): it opens in about 3 s on the emulator, loads
  the live feed, the menu says **Open Google Play** and not **Check for updates**, **About** has no update paragraph and a **Privacy
  policy** button, the sign-in sheet has a **Privacy policy** button and no **Delete account** before an account exists; no crash, no
  ANR, no cleartext or StrictMode message. This is the store build behaving as a store build, on one emulator.
- **Deleting an account, end to end.** The website route against a real GoTrue and PostgREST (20 checks): no header, a made-up token
  and a damaged signature each answer 401 and delete nothing; GET is 405; a real token deletes its own account, its profile row,
  saved story and reading activity (the cascade), the answer is `no-store` and carries no token or key, the reader can no longer sign
  in, the deleted reader's old token is refused with 401, a second reader with the same kind of data is untouched until they delete
  theirs, and a burst of bad tries is answered with 429. The app's own code through the same route (the 14th stack test) passes, as
  do 30 account-manager and 18 Supabase-client unit tests with fakes.
- **The website pages in a real browser** (Edge, phone and desktop widths, light and dark): `/delete-account` signed out (the Google button goes to the
  account service with a return address of `/news/auth/callback?next=%2Fnews%2Fdelete-account`), signed in (who, asking first, **Keep
  my account** deleting nothing, then deleting for real and the account gone from the service), a busy service (told, nothing lost, try
  again), an ended sign-in (asked to sign in again); `/privacy` (all the topics above, one `h1`, its own canonical address, no sideways
  overflow on a phone). The Account sheet and ⋮ menu show the new links.
- **The new Android screens on the emulator**, light and dark: the signed-in sheet with the outlined **Delete account** button, the
  confirmation, the spinner while it runs, and the signed-out sheet with "Your account was deleted" and its toast. The dialog buttons'
  contrast was measured (1.58:1 before, 5.18:1 after, light theme) and the result photographed.
- **Production, after deployment**: `/privacy` and `/delete-account` answer 200 (one `h1`, their own canonical address, indexable) and are in
  `sitemap.xml`; `POST /api/account/delete` answers 401 to no header and to a made-up token (which shows it reached the real account service
  and was refused: a missing configuration or an unreachable service would be 503) and 405 to GET, always `no-store`; the update feed still
  serves 1.4.1, so the website's installed apps are untouched; and the store build installed from the bundle opens the live privacy page from
  its menu in a Chrome Custom Tab. No real account was deleted in production: a real deletion there would need a real reader's account.
- **Builds and tests**: debug, preview and release build; lint **0 errors**, 1 warning (a newer Gradle exists) for debug and preview;
  **150 JVM tests** listed, 0 failing, 14 opt-in skipped; **72 device tests** pass (210 s, clean app, settled emulator); website `tsc` clean,
  `npm test` **122** (112 before), production build.

**Found and fixed while verifying** (so they are not rediscovered): the pale dialog buttons above; and a device run started right after
a cold boot failed 9 tests because of "not responding" dialogs from Google's own apps (see *Tests*), not because of the app.

**Not verified:** that Google Play accepts the app (review is the Console's); real Google sign-in from the Play-installed build (the
sign-in path is the browser flow the preview build has used since 1.0, and the Play build's return scheme is accepted by the website,
but a real Google account was not used); anything on a physical phone; that the AI-brief wording or the licensing of publishers'
content satisfies Google Play's policies for news apps. The Data safety and content-rating answers above are drafts to check, not
certified.

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
