import { en, enPlurals } from '../en'
import { hi, hiPlurals } from '../hi'
import { format, translate, translatePlural, hasKey, LANGS } from '../index'

describe('format', () => {
  it('fills positions in any order, and plain placeholders in sequence', () => {
    expect(format('%2$s then %1$d', [7, 'a'])).toBe('a then 7')
    expect(format('%s and %d', ['x', 3])).toBe('x and 3')
  })
  it('leaves a missing argument empty and turns %% into a percent sign', () => {
    expect(format('100%% of %1$s', [])).toBe('100% of ')
  })
})

describe('dictionaries', () => {
  it('have the same keys in English and Hindi', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort())
    expect(Object.keys(hiPlurals).sort()).toEqual(Object.keys(enPlurals).sort())
  })
  it('use the same placeholders in both languages', () => {
    const positions = (text: string) => [...text.matchAll(/%(?:(\d+)\$)?[sd]/g)].map((m) => m[1] ?? '_').sort().join(',')
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect({ key, placeholders: positions(hi[key]) }).toEqual({ key, placeholders: positions(en[key]) })
    }
  })
  it('have no string that is empty', () => {
    for (const lang of LANGS) for (const key of Object.keys(en) as (keyof typeof en)[]) expect(translate(lang, key, 'x', 1).length).toBeGreaterThan(0)
  })
  it('translates a counted string', () => {
    expect(translate('en', 'minutes_ago', 5)).toBe('5 min ago')
    expect(hasKey('minutes_ago')).toBe(true)
    expect(hasKey('nope')).toBe(false)
  })
  it('chooses the plural form', () => {
    const key = Object.keys(enPlurals)[0] as keyof typeof enPlurals
    expect(translatePlural('en', key, 1)).toContain('1')
    expect(translatePlural('en', key, 3)).toContain('3')
  })
})
