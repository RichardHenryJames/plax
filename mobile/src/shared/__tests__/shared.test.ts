import { planFit, grownHero } from '@shared/card-fit'
import { fitText } from '@shared/text-fit'
import { endsSentence, trimWeakTail } from '@shared/sentence'
import { SITE_URL } from '@shared/site'

describe('the pure modules the app shares with the website', () => {
  it('plan a card and cut a text', () => {
    const plan = planFit({
      height: 700, meta: 60, metaBare: 60, actions: 0, titleTop: 12, titleLine: 34, titleNatural: 3, titleMax: 4,
      bodyTop: 12, bodyLine: 24, bodyNatural: 20, heroMaximum: 300, heroMinimum: 160,
    })
    expect(plan.bodyLines).toBeGreaterThan(0)
    expect(grownHero(100, 50, 200)).toBe(150)
  })
  it('cut at the end of a sentence close to the room', () => {
    const text = 'One thing happened today. Another thing happened later. A third followed it, and then a fourth one did too.'
    const shown = fitText(text, 2, (candidate) => Math.ceil(candidate.length / 30))
    expect(shown.length).toBeLessThan(text.length)
    expect(shown.endsWith('.') || shown.endsWith('\u2026')).toBe(true)
    expect(endsSentence('Dr. Rao spoke.', 2)).toBe(false)
    expect(trimWeakTail('She went to the market and a')).not.toMatch(/ a$/)
  })
  it('know the site', () => {
    expect(SITE_URL).toBe('https://plax-rouge.vercel.app/news')
  })
})
