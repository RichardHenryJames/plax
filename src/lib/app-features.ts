// Which of the app's switches the website follows too, so that the website and the app stay alike.
//
// public/app-config.json is the file the Android app reads (see android/README.md, "What the website can change without a new app").
// Its switches reach the app by themselves; the website is built from this repository, so the ones that also change what a card
// shows are set here as well, and app-config.test.mjs fails if the two differ.

/**
 * Whether a card names its publisher in the line above the headline. It does not: the headline is the link to the story at the
 * publisher, and a card does not advertise the site it links to. The same goes for the website's Android build, which follows
 * `features.sourceName` in app-config.json.
 *
 * The Android app from Google Play is the exception and always names the publisher, whatever the file says: Google Play's News policy
 * asks an aggregator for "clear information about the publishing sources of third-party content", Plax is declared one, and the
 * declaration in Play Console says each card shows its source (see android/PLAY-CONSOLE-ANSWERS-ADS.txt, section 8).
 */
export const SHOW_SOURCE_NAME = false
