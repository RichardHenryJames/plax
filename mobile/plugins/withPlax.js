// Patches the generated Android project (expo prebuild) so that every build is signed the way it has to be, and the build has the memory it needs.
//
//   play     signed with the Google Play upload key, from ~/.plax-signing/upload.properties (or the file PLAX_UPLOAD_PROPERTIES names). Without
//            that file the release stays unsigned, so a bundle can never be handed over by mistake (scripts/package-aab.ps1 checks the signer).
//   preview  signed with the Android debug key of this machine (~/.android/debug.keystore): the key the published website builds were signed
//   e2e      with, so that the new build installs over them with the reader's data, and the update feed's pinned signer still fits.
//
// The helpers are plain string functions so that plugins/__tests__ can test them without Gradle.

const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins')

const UPLOAD_PROPERTIES = `// Plax signing (plugins/withPlax.js): the Google Play upload key lives outside the repository.
def plaxUploadFile = file(providers.environmentVariable('PLAX_UPLOAD_PROPERTIES').orElse("\${System.getProperty('user.home')}/.plax-signing/upload.properties").get())
def plaxUpload = new Properties()
if (plaxUploadFile.isFile()) plaxUploadFile.withInputStream { plaxUpload.load(it) }
`

const EXTRA_SIGNING_CONFIGS = `        website {
            storeFile file("\${System.getProperty('user.home')}/.android/debug.keystore")
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        if (plaxUpload.getProperty('storeFile')) {
            upload {
                storeFile file(plaxUpload.getProperty('storeFile'))
                storePassword plaxUpload.getProperty('storePassword')
                keyAlias plaxUpload.getProperty('keyAlias')
                keyPassword plaxUpload.getProperty('keyPassword')
            }
        }
`

/** The Gradle expression that names the signing configuration of the release type for this build. */
function releaseSigning(variant) {
  if (variant === 'play') return "plaxUpload.getProperty('storeFile') ? signingConfigs.upload : null"
  if (variant === 'preview' || variant === 'e2e') return 'signingConfigs.website'
  throw new Error(`withPlax: unknown variant "${variant}"`)
}

const SIGNING_BLOCK = /(signingConfigs \{[\s\S]*?keyPassword 'android'\s*\n\s*\}\s*\n)(\s*\})/
const RELEASE_SIGNING = /(release \{[\s\S]*?)signingConfig signingConfigs\.debug/

function patchBuildGradle(contents, variant) {
  if (contents.includes('plaxUploadFile')) return contents
  if (!SIGNING_BLOCK.test(contents)) throw new Error('withPlax: the signingConfigs block is not what was expected')
  if (!RELEASE_SIGNING.test(contents)) throw new Error('withPlax: the release build type is not what was expected')
  let patched = contents.replace(/^android \{/m, `${UPLOAD_PROPERTIES}\nandroid {`)
  patched = patched.replace(SIGNING_BLOCK, `$1${EXTRA_SIGNING_CONFIGS}$2`)
  patched = patched.replace(RELEASE_SIGNING, `$1signingConfig ${releaseSigning(variant)}`)
  return patched
}

const MEMORY = { 'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m' }

module.exports = function withPlax(config, options = {}) {
  const variant = options.variant ?? 'preview'
  config = withAppBuildGradle(config, (c) => {
    if (c.modResults.language !== 'groovy') throw new Error('withPlax: the app build file is not Groovy')
    c.modResults.contents = patchBuildGradle(c.modResults.contents, variant)
    return c
  })
  return withGradleProperties(config, (c) => {
    for (const [key, value] of Object.entries(MEMORY)) {
      c.modResults = c.modResults.filter((item) => item.type !== 'property' || item.key !== key)
      c.modResults.push({ type: 'property', key, value })
    }
    return c
  })
}

module.exports.patchBuildGradle = patchBuildGradle
module.exports.releaseSigning = releaseSigning
