const fs = require('node:fs')
const { check, computeFingerprint, nativePackages, RECORD } = require('../native-fingerprint')

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
})
