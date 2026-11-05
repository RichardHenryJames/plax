// Which of the app's switches the website follows too, so that the website and the app stay alike.
//
// public/app-config.json is the file the Android app reads (see android/README.md, "What the website can change without a new app").
// Its switches reach the app by themselves; the website is built from this repository, so the ones that also change what a card
// shows are set here as well, and app-config.test.mjs fails if the two differ.

/**
 * Whether a card names its publisher in the line above the headline (small, as in the app). Google Play's News policy asks an
 * aggregator to give users clear information about the publishing sources of what it shows, and the declaration in Play Console says
 * each card shows its source, so this is on. Turning it off (here and in app-config.json, `features.sourceName`) is a decision that
 * needs that declaration changed too.
 */
export const SHOW_SOURCE_NAME = true
