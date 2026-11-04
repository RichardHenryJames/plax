import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// A story is laid out in two places that must agree: the website (components/useCardFit.ts, with the arithmetic in lib/card-fit.ts) and the
// app (StoryPage.java, with CardFit.java). The numbers below are the ones that decide how big the picture is; and the owner's rule, that the
// parts of a story stand one under the other with nothing spread between them (the room a short story leaves is empty at the bottom), is
// kept by what these tests read, so that a change that brings the old spread back fails here.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const hook = read('../components/useCardFit.ts')
const card = read('../components/Card.tsx')
const page = read('../../android/app/src/main/java/com/plaxlabs/news/StoryPage.java')

/** The number a constant is set to: `const NAME = 0.6` in the website, `NAME = .6f` in the app (alone or in a list of constants). */
const webNumber = (name) => {
  const match = hook.match(new RegExp(`const ${name} = ([0-9.]+)`))
  assert.ok(match, `${name} not found in useCardFit.ts`)
  return Number(match[1])
}
const appNumber = (name) => {
  const match = page.match(new RegExp(`\\b${name} = ([0-9.]+)f?\\b`))
  assert.ok(match, `${name} not found in StoryPage.java`)
  return Number(match[1])
}

test('the picture is sized by the same numbers on the website and in the app', () => {
  for (const [web, app] of [
    ['HERO_MAX_WIDTH', 'HERO_MAX_WIDTH'],
    ['HERO_MAX_HEIGHT', 'HERO_MAX_HEIGHT'],
    ['PHOTO_MIN_WIDTH', 'PHOTO_MIN_WIDTH'],
    ['PHOTO_MIN_HEIGHT', 'PHOTO_MIN_HEIGHT'],
    ['POSTER_MIN_WIDTH', 'POSTER_MIN_WIDTH'],
    ['POSTER_MIN_HEIGHT', 'POSTER_MIN_HEIGHT'],
    ['HERO_FLOOR', 'HERO_FLOOR_DP'],
  ]) {
    assert.equal(webNumber(web), appNumber(app), `${web} differs between the website and the app`)
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
  assert.doesNotMatch(page, /\.offset\(\s*0\s*,/, 'StoryPage moves a part down, which spreads the parts apart')
  assert.doesNotMatch(page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /\bspare\b/, 'StoryPage deals out spare room')
})

test('the picture takes what the text leaves, on both: through the same rule', () => {
  assert.match(hook, /grownHero\(/, 'useCardFit does not give the picture the room the text left')
  assert.match(page, /CardFit\.grownHero\(/, 'StoryPage does not give the picture the room the text left')
})
