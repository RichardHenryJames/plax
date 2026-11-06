// Plax for Android, one codebase, three builds (PLAX_VARIANT):
//   play     com.plaxlabs.news          Google Play. Shows ads (the owner's AdMob app), is updated by Google Play and over the air.
//   preview  com.plaxlabs.news.preview  The build the website hands out. No ads, looks for a newer APK at the website, updated over the air.
//   e2e      com.plaxlabs.news.e2e      The build the device tests drive: Google's sample ads, talks to a mock website on the host.
//
// What a build does is decided at run time from its application id (src/build.ts), never from `extra`: an over-the-air update
// carries the `extra` of whoever published it, so nothing in `extra` may depend on the variant.

const LIVE_ADMOB_APP_ID = 'ca-app-pub-2225161543339119~9585194942'
// Google's sample app id: serves test ads only and is tied to no account.
const SAMPLE_ADMOB_APP_ID = 'ca-app-pub-3940256099942544~3347511713'
const SAMPLE_ADMOB_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511'

const VARIANTS = {
  play: { id: 'com.plaxlabs.news', admobAppId: LIVE_ADMOB_APP_ID },
  preview: { id: 'com.plaxlabs.news.preview', admobAppId: SAMPLE_ADMOB_APP_ID },
  e2e: { id: 'com.plaxlabs.news.e2e', admobAppId: SAMPLE_ADMOB_APP_ID },
}

// The native layer's version. An update published for one runtime version reaches only builds that have it, so it is changed
// (and src/native-deps.snapshot.json with it) whenever a native dependency or a native setting changes, and never otherwise.
const RUNTIME_VERSION = '2.0.0'
const VERSION = '2.0.0'
const VERSION_CODE = 20

module.exports = ({ config }) => {
  const name = process.env.PLAX_VARIANT || 'preview'
  const variant = VARIANTS[name]
  if (!variant) throw new Error(`PLAX_VARIANT must be one of ${Object.keys(VARIANTS).join(', ')}, not "${name}"`)
  const projectId = config.extra?.eas?.projectId
  if (!projectId) throw new Error('app.json has no extra.eas.projectId (run eas init)')

  return {
    ...config,
    name: 'Plax',
    slug: 'plax',
    owner: 'richardhenryjames',
    // The website's build says so in its version, as the published website builds always did (2.0.0-preview); the update feed expects it.
    version: name === 'preview' ? `${VERSION}-preview` : VERSION,
    runtimeVersion: RUNTIME_VERSION,
    scheme: variant.id,
    orientation: 'default',
    userInterfaceStyle: 'automatic',
    icon: './assets/icon.png',
    newArchEnabled: true,
    updates: {
      url: `https://u.expo.dev/${projectId}`,
      // The build asks the channel it was built for. Both builds that reach readers use production, so one publication serves them; the test build has its own.
      requestHeaders: { 'expo-channel-name': name === 'e2e' ? 'e2e' : 'production' },
      checkAutomatically: 'ON_LOAD',
      // Launch at once with what is on the phone; the update is fetched in the background and the app applies it (src/updates).
      fallbackToCacheTimeout: 0,
    },
    android: {
      package: variant.id,
      versionCode: VERSION_CODE,
      allowBackup: false,
      predictiveBackGestureEnabled: false,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-foreground.png',
        monochromeImage: './assets/adaptive-monochrome.png',
        backgroundColor: '#F59E0B',
      },
      // Everything a build may ask for is listed; the ads library adds the advertising id and the connection state itself.
      permissions: ['INTERNET', 'ACCESS_NETWORK_STATE'],
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.VIBRATE',
        'android.permission.RECORD_AUDIO',
        'android.permission.CAMERA',
        'android.permission.REQUEST_INSTALL_PACKAGES',
      ],
    },
    plugins: [
      'expo-secure-store',
      'expo-web-browser',
      'expo-image',
      'expo-font',
      'expo-updates',
      [
        'expo-build-properties',
        {
          android: {
            compileSdkVersion: 36,
            targetSdkVersion: 36,
            minSdkVersion: 26,
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            usesCleartextTraffic: name === 'e2e',
          },
        },
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 160,
          backgroundColor: '#F7F5F0',
          dark: { backgroundColor: '#0B0B0E', image: './assets/splash-icon-dark.png' },
        },
      ],
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: variant.admobAppId,
          iosAppId: SAMPLE_ADMOB_IOS_APP_ID,
          delayAppMeasurementInit: true,
          optimizeInitialization: true,
          optimizeAdLoading: true,
        },
      ],
      ['./plugins/withPlax', { variant: name }],
    ],
    extra: {
      eas: { projectId },
    },
  }
}
