// Which of the app's switches the website follows too, so that the website and the app stay alike.
//
// public/app-config.json is the file the Android app reads (see mobile/README.md, "What the website can change without a new app").
// Its switches reach the app by themselves; the website is built from this repository, so the ones that also change what a card
// shows are set here as well, and app-config.test.mjs fails if the two differ.

/**
 * Whether a card names its publisher in the line above the headline. It does not: the headline is the link to the story at the
 * publisher, and a card does not advertise the site it links to. The Android app does what the website does, in every build, the one
 * from Google Play too: it follows `features.sourceName` in app-config.json, so setting that to true (and this constant with it) puts
 * the name back on both with no new app.
 *
 * Google Play's News policy asks an aggregator for "clear information about the publishing sources of third-party content". Showing no
 * publisher name is the owner's decision, for the website and the app alike, and it is a risk to the Play listing that the owner has
 * accepted (see mobile/PLAY-CONSOLE-ANSWERS.txt, section 8, for the declaration made to Google).
 */
export const SHOW_SOURCE_NAME = false
