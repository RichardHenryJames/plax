import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(__dirname, '..', '..')

/** The product files of the settings and the updates (everything in the two folders but their tests). */
const FILES = ['config', 'updates'].flatMap((folder) =>
  readdirSync(join(SRC, folder))
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => ({ name: `${folder}/${name}`, text: readFileSync(join(SRC, folder, name), 'utf8') })),
)

const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** The code of a file without its comments and the text of its strings, so that a word in a sentence is not taken for code. */
const codeOf = (text: string) => withoutComments(text).replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")

const LOGGING = /\bconsole\s*\./
const ANY = /(?::|\bas\b|<)\s*any\b/
const CLEARTEXT = /http:\/\//i
const OWN_NETWORK = /\bfetch\s*\(|XMLHttpRequest/
const CREDENTIALS = /expo-secure-store|\bsecrets\b/

const found = (pattern: RegExp, text: string) => pattern.test(text)

describe('the scanners below', () => {
  it('see what they look for, and not what only a sentence says', () => {
    expect(found(LOGGING, codeOf('console.log(story)'))).toBe(true)
    expect(found(LOGGING, codeOf('// never console.log a story\nconst a = 1'))).toBe(false)
    expect(found(ANY, codeOf('const a: any = 1'))).toBe(true)
    expect(found(ANY, codeOf('const a = b as any'))).toBe(true)
    expect(found(ANY, codeOf('const a = <any>b'))).toBe(true)
    expect(found(ANY, codeOf('/** any other ... */ const many = 1; const message = "a: any"'))).toBe(false)
    expect(found(CLEARTEXT, withoutComments("const url = 'http://example.com'"))).toBe(true)
    expect(found(CLEARTEXT, withoutComments('// http://example.com is refused\nconst a = 1'))).toBe(false)
    expect(found(OWN_NETWORK, codeOf('await fetch(url)'))).toBe(true)
    expect(found(OWN_NETWORK, codeOf('await refetch(url)'))).toBe(false)
    expect(found(CREDENTIALS, codeOf("import { secrets } from '@/platform/storage'"))).toBe(true)
  })
})

describe('the product code of the settings and the updates', () => {
  it('has the files of the slice', () => {
    expect(FILES.map((file) => file.name)).toEqual(
      expect.arrayContaining([
        'config/app-config.ts', 'config/app-config-store.ts', 'config/config-prompts.ts',
        'updates/apk-updates.ts', 'updates/update-manager.ts', 'updates/ota.ts',
      ]),
    )
  })

  it('never logs: no console, whatever the story, key, token or answer', () => {
    for (const file of FILES) expect({ file: file.name, found: found(LOGGING, codeOf(file.text)) }).toEqual({ file: file.name, found: false })
  })

  it('has no any', () => {
    for (const file of FILES) expect({ file: file.name, found: found(ANY, codeOf(file.text)) }).toEqual({ file: file.name, found: false })
  })

  it('has no address but https, and no way round http.ts', () => {
    for (const file of FILES) {
      expect({ file: file.name, found: found(CLEARTEXT, withoutComments(file.text)) }).toEqual({ file: file.name, found: false })
      expect({ file: file.name, found: found(OWN_NETWORK, codeOf(file.text)) }).toEqual({ file: file.name, found: false })
    }
  })

  it('does not depend on React or the screens: the rules can be tested without them', () => {
    for (const file of FILES) {
      const imports = [...file.text.matchAll(/from '([^']+)'/g)].map((match) => match[1])
      const forbidden = imports.filter((name) => name === 'react' || name === 'react-native' || name.startsWith('@/ui'))
      expect({ file: file.name, forbidden }).toEqual({ file: file.name, forbidden: [] })
    }
  })

  it('never touches the store of credentials: it only ever keeps public content', () => {
    for (const file of FILES) expect({ file: file.name, found: found(CREDENTIALS, codeOf(file.text)) }).toEqual({ file: file.name, found: false })
  })
})
