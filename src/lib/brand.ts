// The Plax "P", drawn once, and the two colours of the app icon.
//
// The P is the brand logo (public/plaxlabs_logo.png) traced into an outline: a bowl and a stem, each one closed shape, in a box
// about 35 units tall. The Android app draws exactly these two paths (res/drawable/ic_launcher_foreground.xml, ic_plax.xml and
// the two ic_splash.xml files), and the website draws them in its share-card pictures and made its icons from them, so the P is
// the same everywhere. brand.test.mjs here and BrandTest in the Android project fail if a copy drifts.

export const P_BOWL =
  'M15.92,8.03 C14.6,8.14 13.95,9.39 14.9,9.99 L21.24,13.5 C23.33,14.66 24.19,15.85 24.48,17.97 C24.54,18.39 24.54,18.39 24.55,24.49 C24.57,31.15 24.55,30.69 24.72,30.88 C25.02,31.21 27.47,31.14 28.93,30.75 C34.87,29.17 38.5,23.3 37.28,17.25 C36.26,12.2 32.22,8.55 27.1,8.05 L15.92,8.03 Z'

export const P_STEM =
  'M12.59,11.26 C12.05,11.41 11.68,11.8 11.55,12.38 C11.49,12.64 11.47,35.99 11.53,36.42 C11.72,37.72 12.2,38.25 14.14,39.28 L18.89,41.91 C20.56,42.86 20.96,43.02 21.44,42.92 C21.97,42.81 22.42,42.35 22.58,41.75 C22.66,41.46 22.67,18.6 22.59,18.05 C22.38,16.57 21.8,15.88 19.91,14.84 L15.72,12.51 C13.33,11.18 13.14,11.1 12.59,11.26 Z'

/** The P's bounding box in those coordinates. Its proportions (26.02 : 34.92) are the logo's own, 1026 : 1380 pixels. */
export const P_BOX = { x: 11.49, y: 8.03, width: 26.02, height: 34.92 } as const

/** The app icon: a dark P on amber (res/values/colors.xml launcher_background and the fill of ic_launcher_foreground.xml). */
export const BRAND = { iconBackground: '#F59E0B', iconInk: '#1A1203' } as const

// How tall the P is in an icon, as a share of the icon's height. On the phone the launcher shows the middle 72 of the icon's 108
// units and the P is 49 units tall, so in a tile that is shown whole (the favicon, the share cards, the Play icon) it is 0.68.
// In an icon the system crops to its own shape (the install icons) it is 0.45, which keeps it inside the safe zone.
export const P_IN_TILE = 0.68
export const P_IN_FULL_BLEED = 0.45
