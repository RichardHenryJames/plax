import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// A story is laid out in two places that must agree: the website (components/useCardFit.ts, with the arithmetic in lib/card-fit.ts) and the
// app (mobile/src/ui/story/layout.ts, which uses the same lib/card-fit.ts, and StoryPage.tsx). The numbers below are the ones that decide
// how big the picture is; and the owner's rule, that the parts of a story stand one under the other with nothing spread between them (the
// room a short story leaves is empty at the bottom), is kept by what these tests read, so that a change that brings the old spread back
// fails here.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const hook = read('../components/useCardFit.ts')
const card = read('../components/Card.tsx')
const layout = read('../../mobile/src/ui/story/layout.ts')
const page = read('../../mobile/src/ui/story/StoryPage.tsx')
const noComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** The number a constant is set to: `const NAME = 0.6` in the website. */
const webNumber = (name) => {
  const match = hook.match(new RegExp(`const ${name} = ([0-9.]+)`))
  assert.ok(match, `${name} not found in useCardFit.ts`)
  return Number(match[1])
}
/** The same constant in the app (`export const NAME = 0.6`), or one of the numbers the app is built with (`DEFAULT_LAYOUT_CONFIG`). */
const appNumber = (name) => {
  const match = layout.match(new RegExp(`export const ${name} = ([0-9.]+)`))
  assert.ok(match, `${name} not found in layout.ts`)
  return Number(match[1])
}
const appDefault = (key) => {
  const block = layout.match(/DEFAULT_LAYOUT_CONFIG: LayoutConfig = \{([^}]*)\}/)
  assert.ok(block, 'DEFAULT_LAYOUT_CONFIG not found in layout.ts')
  const match = block[1].match(new RegExp(`\\b${key}: ([0-9.]+)`))
  assert.ok(match, `${key} not found in DEFAULT_LAYOUT_CONFIG`)
  return Number(match[1])
}

test('the picture is sized by the same numbers on the website and in the app', () => {
  for (const [web, app] of [['POSTER_MIN_WIDTH', 'POSTER_MIN_WIDTH'], ['POSTER_MIN_HEIGHT', 'POSTER_MIN_HEIGHT'], ['HERO_FLOOR', 'HERO_FLOOR']]) {
    assert.equal(webNumber(web), appNumber(app), `${web} differs between the website and the app`)
  }
  for (const [web, app] of [['HERO_MAX_WIDTH', 'heroMaxWidth'], ['HERO_MAX_HEIGHT', 'heroMaxHeight'], ['PHOTO_MIN_WIDTH', 'photoMinWidth'], ['PHOTO_MIN_HEIGHT', 'photoMinHeight']]) {
    assert.equal(webNumber(web), appDefault(app), `${web} differs between the website and what the app is built with`)
  }
})

test('the picture may grow to 4:5 and 60% of the story, so that a short story fills its screen', () => {
  assert.equal(webNumber('HERO_MAX_WIDTH'), 1.25)
  assert.equal(webNumber('HERO_MAX_HEIGHT'), 0.6)
})

test('the parts of a story are never spread apart: nothing on the website\'s card spaces them out, and the app\'s page does not either', () => {
  // The website: the box that holds the parts starts at the top, whatever it holds, and is only ever centred when it is a short card that is not news.
  const box = card.match(/className=\{`card-fit story-column[^`]*`\}/)
  assert.ok(box, 'the story box was not found in Card.tsx')
  assert.doesNotMatch(box[0], /justify-(between|around|evenly)/, 'the box spreads its parts apart')
  assert.match(box[0], /\bjustify-start\b/, 'the box does not start at the top')
  assert.doesNotMatch(card.slice(card.indexOf('data-fit="actions"') - 80, card.indexOf('data-fit="actions"') + 120), /mt-auto|ml-auto|self-end/, 'the row under the text is pushed to the bottom')
  // The app: each part is placed under the one before it, and no spare room is dealt out among them.
  assert.doesNotMatch(noComments(page), /justifyContent:\s*'space-(between|around|evenly)'/, 'StoryPage spreads its parts apart')
  assert.doesNotMatch(noComments(layout), /\bspare\b/, 'the layout deals out spare room')
})

test('the picture takes what the text leaves, on both: through the same rule', () => {
  assert.match(hook, /grownHero\(/, 'useCardFit does not give the picture the room the text left')
  assert.match(layout, /grownHero\(/, 'the app\'s layout does not give the picture the room the text left')
  assert.match(layout, /from '@shared\/card-fit'/, 'the app does not use the website\'s own rule')
})
