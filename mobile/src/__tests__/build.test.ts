import { APPLICATION_IDS, E2E_SITE, PRODUCTION_SITE, adsBuild, authScheme, isPlayBuild, looksForApkUpdates, site, variant, versionCode, versionLabel } from '../build'
import { setVariant } from '../test/helpers'

describe('which build is running', () => {
  it('is told by the application id', () => {
    for (const name of ['play', 'preview', 'e2e'] as const) {
      setVariant(name)
      expect(variant()).toBe(name)
    }
  })

  it('takes an id it does not know as the website build, which shows no ads and asks only the website', () => {
    const application = require('expo-application') as { mock: { applicationId: string | null } }
    application.mock.applicationId = 'com.example.other'
    expect(variant()).toBe('preview')
    application.mock.applicationId = null
    expect(variant()).toBe('preview')
    expect(adsBuild()).toBe('none')
  })

  it('shows live ads only in the Google Play build, sample ads in the test build, none in the website build', () => {
    setVariant('play')
    expect(adsBuild()).toBe('live')
    setVariant('e2e')
    expect(adsBuild()).toBe('sample')
    setVariant('preview')
    expect(adsBuild()).toBe('none')
  })

  it('looks for a newer APK only in the website build (Google Play updates the Play build)', () => {
    setVariant('play')
    expect(looksForApkUpdates()).toBe(false)
    expect(isPlayBuild()).toBe(true)
    setVariant('preview')
    expect(looksForApkUpdates()).toBe(true)
    expect(isPlayBuild()).toBe(false)
    setVariant('e2e')
    expect(looksForApkUpdates()).toBe(false)
  })

  it('talks to the production website, and only the test build talks to the mock one', () => {
    setVariant('play')
    expect(site()).toBe(PRODUCTION_SITE)
    setVariant('preview')
    expect(site()).toBe(PRODUCTION_SITE)
    setVariant('e2e')
    expect(site()).toBe(E2E_SITE)
    expect(PRODUCTION_SITE).toBe('https://plax-rouge.vercel.app/news')
  })

  it('answers the sign-in link of its own application id', () => {
    setVariant('play')
    expect(authScheme()).toBe(APPLICATION_IDS.play)
    setVariant('preview')
    expect(authScheme()).toBe('com.plaxlabs.news.preview')
  })

  it('names its version as the build\'s own version name says it, which is 2.0.0-preview for the website\'s build', () => {
    const application = require('expo-application') as { mock: { nativeApplicationVersion: string | null } }
    setVariant('play')
    expect(versionLabel()).toBe('2.0.0')
    setVariant('preview')
    application.mock.nativeApplicationVersion = '2.0.0-preview'
    expect(versionLabel()).toBe('2.0.0-preview')
    expect(versionCode()).toBe(20)
  })

  it('reads a version code that is not a number as zero', () => {
    const application = require('expo-application') as { mock: { nativeBuildVersion: string | null } }
    application.mock.nativeBuildVersion = null
    expect(versionCode()).toBe(0)
  })
})
