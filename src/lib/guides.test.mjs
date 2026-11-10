import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GUIDES, LEARN_UPDATED, NEWS_TOPIC, getGuide, guideText, guideWordCount, guidesForTopic, longDate, readingMinutes, relatedGuides } from './guides.ts'
import { TOPIC_OVERVIEWS } from './topic-overviews.ts'

// The Learn guides are the part of the website that is Plax's own writing, and what a reviewer from Google reads to decide whether the site has
// value of its own, so they are checked like code: long enough, linked to each other, dated, on real topics, free of placeholders, and with
// worked examples that add up.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const topicIds = [...read('./seo.ts').matchAll(/^\s+id: '([a-z]+)',/gm)].map((match) => match[1])
const guide = (slug) => {
  const found = getGuide(slug)
  assert.ok(found, `no guide ${slug}`)
  return found
}

test('there are enough guides, each with an address of its own', () => {
  assert.ok(GUIDES.length >= 20, `${GUIDES.length} guides`)
  const slugs = GUIDES.map((item) => item.slug)
  assert.equal(new Set(slugs).size, slugs.length, 'a slug is used twice')
  for (const slug of slugs) assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, slug)
})

test('every guide has the parts the page shows, and is long enough to be worth reading', () => {
  for (const item of GUIDES) {
    assert.ok(item.title.length >= 20 && item.title.length <= 90, `${item.slug}: title of ${item.title.length} characters`)
    assert.ok(item.summary.length >= 80 && item.summary.length <= 200, `${item.slug}: summary of ${item.summary.length} characters`)
    assert.ok(item.intro.length >= 2, `${item.slug}: two paragraphs of introduction`)
    assert.equal(item.keyPoints.length, 3, `${item.slug}: three key points`)
    assert.ok(item.sections.length >= 4, `${item.slug}: ${item.sections.length} sections`)
    for (const section of item.sections) {
      assert.ok(section.heading.length >= 6 && section.heading.length <= 80, `${item.slug}: heading "${section.heading}"`)
      assert.ok(section.paragraphs.length >= 1, `${item.slug}: "${section.heading}" has no text`)
    }
    assert.ok(guideWordCount(item) >= 600, `${item.slug}: only ${guideWordCount(item)} words`)
    assert.ok(readingMinutes(item) >= 3, `${item.slug}: reading time`)
  }
})

test('together the guides are a substantial body of writing', () => {
  const words = GUIDES.reduce((total, item) => total + guideWordCount(item), 0)
  assert.ok(words >= 15000, `${words} words in ${GUIDES.length} guides`)
})

test('every guide is on a real topic, and every topic of the website has a guide to start with', () => {
  assert.ok(topicIds.length >= 17, `${topicIds.length} topics read from seo.ts`)
  for (const item of GUIDES) assert.ok(item.topic === NEWS_TOPIC || topicIds.includes(item.topic), `${item.slug}: topic ${item.topic}`)
  for (const id of topicIds) assert.ok(guidesForTopic(id).length >= 1, `no guide on ${id}`)
})

test('dates are real days, in order, and the Learn page is dated by the newest', () => {
  for (const item of GUIDES) {
    for (const day of [item.published, item.updated]) {
      assert.match(day, /^\d{4}-\d{2}-\d{2}$/, item.slug)
      assert.equal(new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10), day, `${item.slug}: ${day} is not a day`)
    }
    assert.ok(item.updated >= item.published, `${item.slug}: updated before published`)
  }
  assert.equal(LEARN_UPDATED, GUIDES.map((item) => item.updated).sort().at(-1))
  assert.equal(longDate('2026-11-10'), '10 November 2026')
  assert.equal(longDate('2027-01-02'), '2 January 2027')
})

test('guides point to each other, never to a guide that does not exist or to themselves', () => {
  for (const item of GUIDES) {
    for (const slug of item.related ?? []) {
      assert.ok(getGuide(slug), `${item.slug} names ${slug}, which does not exist`)
      assert.notEqual(slug, item.slug, `${item.slug} names itself`)
    }
    assert.equal(new Set(item.related ?? []).size, (item.related ?? []).length, `${item.slug}: a guide named twice`)
    const offered = relatedGuides(item)
    assert.ok(offered.length >= 1 && offered.length <= 4, `${item.slug}: ${offered.length} guides offered next`)
    assert.ok(!offered.includes(item))
  }
})

test('the guides that touch money or health carry the note, and the others do not claim one they do not need', () => {
  for (const item of GUIDES) {
    if (['finance', 'stocks'].includes(item.topic)) assert.equal(item.disclaimer, 'money', `${item.slug} needs the note on money`)
    if (item.topic === 'health') assert.equal(item.disclaimer, 'health', `${item.slug} needs the note on health`)
    if (item.disclaimer) assert.ok(['money', 'health'].includes(item.disclaimer))
  }
})

test('no placeholder text, stray markup or untidy spacing in any guide', () => {
  for (const item of GUIDES) {
    const prose = [item.title, item.summary, ...item.intro, ...item.keyPoints, ...item.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])])]
    for (const text of [item.title, item.summary, ...guideText(item)]) {
      assert.doesNotMatch(text, /lorem ipsum|\bTODO\b|\bTBD\b|\bFIXME\b|undefined|\$\{|<[a-z/]|\bplaxlabs\b/i, `${item.slug}: ${text.slice(0, 60)}`)
      assert.equal(text, text.trim(), `${item.slug}: spaces around "${text.slice(0, 40)}"`)
    }
    // An example may line its columns up with spaces; prose may not have them.
    for (const text of prose) assert.doesNotMatch(text, / {2,}/, `${item.slug}: double spaces in "${text.slice(0, 40)}"`)
    for (const paragraph of [...item.intro, ...item.sections.flatMap((section) => section.paragraphs)]) {
      assert.match(paragraph, /[.:?!)]$/, `${item.slug}: a paragraph that does not end like a sentence: "${paragraph.slice(-40)}"`)
    }
    for (const section of item.sections) assert.doesNotMatch(section.heading, /[.]$/, `${item.slug}: heading ends with a full stop`)
  }
})

test('the guides use straight quotes only inside code-like examples, and do not mix up the rupee sign', () => {
  for (const item of GUIDES) {
    for (const text of [...item.intro, ...item.keyPoints, ...item.sections.flatMap((section) => [...section.paragraphs, ...(section.bullets ?? [])])]) {
      assert.doesNotMatch(text, /"/, `${item.slug}: a straight double quote in "${text.slice(0, 50)}"`)
      assert.doesNotMatch(text, /\bRs\.?\s?\d|\bINR\b/, `${item.slug}: write the rupee sign, not Rs or INR`)
    }
  }
})

test('the worked examples add up', () => {
  // The home-loan example in the repo-rate guide.
  const emi = (principal, yearlyPercent, years) => {
    const r = yearlyPercent / 100 / 12
    const n = years * 12
    return (principal * r * (1 + r) ** n) / ((1 + r) ** n - 1)
  }
  const at850 = emi(5_000_000, 8.5, 20)
  const at825 = emi(5_000_000, 8.25, 20)
  assert.ok(Math.abs(at850 - 43_400) < 100, `8.5%: ${at850.toFixed(0)}`)
  assert.ok(Math.abs(at825 - 42_600) < 100, `8.25%: ${at825.toFixed(0)}`)
  assert.ok(Math.abs(at850 - at825 - 800) < 50, `difference ${(at850 - at825).toFixed(0)}`)
  const repo = guide('how-the-repo-rate-works')
  const repoText = guideText(repo).join(' ')
  assert.match(repoText, /₹43,400/)
  assert.match(repoText, /₹42,600/)

  // The medical test in the Bayes guide: 1% prevalence, 90% sensitivity, 10% false positives, among 1,000 people.
  const sick = 1000 * 0.01
  const truePositives = sick * 0.9
  const falsePositives = (1000 - sick) * 0.1
  assert.equal(truePositives, 9)
  assert.equal(Math.round(falsePositives), 99)
  assert.ok(Math.abs(truePositives / (truePositives + falsePositives) - 0.0833) < 0.001)
  const bayesText = guideText(guide('bayes-theorem-in-plain-words')).join(' ')
  assert.match(bayesText, /9 \/ 108/)
  assert.match(bayesText, /1 in 12/)

  // Rayleigh scattering: blue at 450 nm against red at 700 nm.
  assert.ok(Math.abs((700 / 450) ** 4 - 5.9) < 0.1)
  assert.match(guideText(guide('why-the-sky-is-blue')).join(' '), /about 5\.9/)

  // The P/E example, and the dilution in the funding guide.
  assert.equal(300 / (1200 / 100), 25)
  assert.equal(12 / 300, 0.04)
  assert.equal(Math.round(0.6 * 0.8 * 100), 48)
  assert.equal(10 / (40 + 10), 0.2)
  // A 600-point fall on an index at 75,000.
  assert.equal(Math.round((600 / 75_000) * 1000) / 10, 0.8)
  // Light in glass at 2 x 10^8 m/s covers 1,000 km in 5 ms.
  assert.equal(1_000_000 / 200_000_000 * 1000, 5)
})

test('every topic page has overview text of its own, different from every other topic', () => {
  assert.deepEqual(Object.keys(TOPIC_OVERVIEWS).sort(), [...topicIds].sort(), 'a topic without an overview, or an overview without a topic')
  for (const id of topicIds) {
    const paragraphs = TOPIC_OVERVIEWS[id]
    assert.equal(paragraphs.length, 2, `${id}: two paragraphs`)
    for (const paragraph of paragraphs) {
      assert.ok(paragraph.split(/\s+/).length >= 25, `${id}: a paragraph of only ${paragraph.split(/\s+/).length} words`)
      assert.match(paragraph, /[.]$/, `${id}: a paragraph that does not end like a sentence`)
      assert.doesNotMatch(paragraph, /lorem ipsum|\bTODO\b|\bTBD\b|\bplaxlabs\b/i, id)
    }
  }
  const all = Object.values(TOPIC_OVERVIEWS).flat()
  assert.equal(new Set(all).size, all.length, 'two topics share a paragraph')
  const page = read('../app/topics/[topic]/page.tsx')
  assert.match(page, /TOPIC_OVERVIEWS/)
  assert.match(page, /guidesForTopic/)
  assert.doesNotMatch(page, /the smart way/, 'the paragraph that was the same on every topic page is gone')
})

test('the helpers behave', () => {
  assert.equal(getGuide('no-such-guide'), undefined)
  assert.deepEqual(guidesForTopic('no-such-topic'), [])
  assert.ok(guidesForTopic('stocks').length >= 3)
  const first = GUIDES[0]
  assert.ok(guideText(first).includes(first.keyPoints[0]))
  assert.ok(relatedGuides(first, 1).length === 1)
})

test('the pages and the sitemap use the guides, and the guides are linked from where readers and crawlers start', () => {
  const sitemap = read('../app/sitemap.ts')
  assert.match(sitemap, /GUIDES/)
  assert.match(sitemap, /\/learn/)
  assert.match(sitemap, /\/about/)
  assert.match(sitemap, /\/editorial-policy/)
  const layout = read('../app/layout.tsx')
  assert.match(layout, /withBase\('\/learn'\)/)
  assert.match(layout, /withBase\('\/about'\)/)
  assert.match(read('../components/LegalPage.tsx'), /href="\/learn"/)
  assert.match(read('../components/SiteLinks.tsx'), /href="\/learn"/)
  assert.match(read('../components/LeftRail.tsx'), /href="\/learn"/)
  assert.match(read('../components/MenuDrawer.tsx'), /href="\/learn"/)
})
