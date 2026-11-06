const fs = require('node:fs')
const path = require('node:path')
const { patchBuildGradle, releaseSigning } = require('../withPlax')

// The build file the generator wrote for the project in this folder (run `expo prebuild` first); the test is skipped without it.
const GENERATED = path.join(__dirname, '..', '..', 'android', 'app', 'build.gradle')
const SAMPLE = `apply plugin: "com.android.application"

android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled true
        }
    }
}
`

describe('signing of the generated build file', () => {
  it('signs the Google Play build with the upload key, and leaves it unsigned when the key is not on the machine', () => {
    const patched = patchBuildGradle(SAMPLE, 'play')
    expect(patched).toContain("signingConfig plaxUpload.getProperty('storeFile') ? signingConfigs.upload : null")
    expect(patched).toContain("PLAX_UPLOAD_PROPERTIES")
    expect(patched).toContain('.plax-signing/upload.properties')
    expect(patched).not.toMatch(/release \{[\s\S]*signingConfig signingConfigs\.debug/)
  })

  it('signs the website build and the test build with the debug key of the machine, the key the published builds have', () => {
    for (const variant of ['preview', 'e2e']) {
      const patched = patchBuildGradle(SAMPLE, variant)
      expect(patched).toMatch(/release \{[\s\S]*signingConfig signingConfigs\.website/)
      expect(patched).toContain('.android/debug.keystore')
      // The debug build type keeps the project's own debug key.
      expect(patched).toMatch(/debug \{\s*signingConfig signingConfigs\.debug/)
    }
  })

  it('loads the upload properties before the android block and defines both extra signing configurations', () => {
    const patched = patchBuildGradle(SAMPLE, 'play')
    expect(patched.indexOf('def plaxUpload = new Properties()')).toBeLessThan(patched.indexOf('android {'))
    expect(patched).toContain('website {')
    expect(patched).toContain('upload {')
  })

  it('is applied once, however often prebuild runs', () => {
    const once = patchBuildGradle(SAMPLE, 'preview')
    expect(patchBuildGradle(once, 'preview')).toBe(once)
  })

  it('refuses a variant it does not know and a build file it does not recognise', () => {
    expect(() => releaseSigning('beta')).toThrow('unknown variant')
    expect(() => patchBuildGradle('android { }', 'play')).toThrow('signingConfigs block')
    expect(() => patchBuildGradle(SAMPLE.replace('signingConfig signingConfigs.debug\n            minifyEnabled', 'minifyEnabled'), 'play')).toThrow('release build type')
  })

  const generated = fs.existsSync(GENERATED) ? it : it.skip
  generated('fits the file expo prebuild generates', () => {
    expect(() => patchBuildGradle(fs.readFileSync(GENERATED, 'utf8'), 'play')).not.toThrow()
  })
})
