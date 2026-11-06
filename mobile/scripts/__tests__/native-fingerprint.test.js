const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { check, computeFingerprint, moduleSources, nativePackages, RECORD } = require('../native-fingerprint')

describe('the native layer and the updates that may reach it', () => {
  it('knows which packages carry native code', () => {
    const names = nativePackages().map((entry) => entry.replace(/@[^@]+$/, ''))
    for (const expected of ['expo-updates', 'react-native-google-mobile-ads', 'expo-secure-store', 'react-native-svg', 'react-native']) expect(names).toContain(expected)
    // Pure JavaScript packages do not change what an update can run on.
    expect(names).not.toContain('zustand')
  })

  it('is recorded, and the record is what the source says now (a native change must come with a new runtime version)', () => {
    const result = check()
    expect({ ok: result.ok, reason: result.reason }).toEqual({ ok: true, reason: undefined })
  })

  it('is the same each time it is computed', () => {
    expect(computeFingerprint()).toBe(computeFingerprint())
    expect(fs.existsSync(RECORD)).toBe(true)
  })

  describe('the app’s own native modules', () => {
    const make = (files) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plax-modules-'))
      for (const [name, text] of Object.entries(files)) {
        const target = path.join(root, ...name.split('/'))
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, text)
      }
      return root
    }

    it('are part of the native layer: the real one is in the fingerprint', () => {
      const names = moduleSources().map((part) => part.split('\n')[0])
      expect(names).toContain('modules/plax-native/expo-module.config.json')
      expect(names).toContain('modules/plax-native/android/src/main/java/expo/modules/plaxnative/PlaxNativeModule.kt')
    })

    it('are read in a fixed order, whatever order the disk lists them in', () => {
      const root = make({ 'b/two.kt': 'two', 'a/one.kt': 'one', 'a/deep/three.kt': 'three', 'c.json': '{}' })
      expect(moduleSources(root).map((part) => part.split('\n')[0])).toEqual(['modules/a/deep/three.kt', 'modules/a/one.kt', 'modules/b/two.kt', 'modules/c.json'])
    })

    it('change the fingerprint when a file of one changes, and not for line endings', () => {
      const before = moduleSources(make({ 'm/x.kt': 'line one\nline two\n' }))
      const crlf = moduleSources(make({ 'm/x.kt': 'line one\r\nline two\r\n' }))
      const changed = moduleSources(make({ 'm/x.kt': 'line one\nline 2\n' }))
      expect(crlf).toEqual(before)
      expect(changed).not.toEqual(before)
    })

    it('leave out what the build makes', () => {
      const root = make({ 'm/x.kt': 'x', 'm/build/out.kt': 'built', 'm/node_modules/p/i.js': 'p', 'm/.cxx/c.txt': 'c' })
      expect(moduleSources(root).map((part) => part.split('\n')[0])).toEqual(['modules/m/x.kt'])
    })

    it('are no part of the fingerprint when there are none', () => {
      expect(moduleSources(path.join(os.tmpdir(), 'plax-no-such-modules'))).toEqual([])
    })
  })
})
