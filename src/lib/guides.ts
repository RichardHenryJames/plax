// The Learn guides: original explainers about the subjects behind the news, published by Plax Labs under /learn.
//
// They are the part of the website that is Plax's own writing (the stories in the feed are short summaries of what publishers
// published, and link to them). Each guide is plain data so that it is checked by tests (length, dates, links between guides) and
// is the same text in the page, the sitemap and the structured data. Written for a general reader, with Indian examples where there
// are Indian examples to give. No guide gives financial, medical or legal advice; the ones that touch money or health say so.
//
// This file holds the types and the helpers; the text is in ./guides-content/. Imports carry their extension and nothing here uses
// a path alias, because the tests run this file directly with Node.
import { CULTURE_GUIDES } from './guides-content/culture.ts'
import { MONEY_GUIDES } from './guides-content/money.ts'
import { SCIENCE_GUIDES } from './guides-content/science.ts'
import { TECH_GUIDES } from './guides-content/tech.ts'

/** The note shown under a guide that touches money or health. */
export type Disclaimer = 'money' | 'health'

export interface GuideSection {
  heading: string
  paragraphs: string[]
  bullets?: string[]
  /** Preformatted text: a worked calculation, or a request and its answer. */
  example?: string
}

export interface Guide {
  /** The address: /learn/<slug>. Lower case, digits and hyphens. */
  slug: string
  title: string
  /** A topic id of the website (lib/seo.ts), or "news" for the guides about reading the news. */
  topic: string
  /** One or two sentences: the page's description for search engines, and its line on the Learn page. */
  summary: string
  /** ISO dates (YYYY-MM-DD). `updated` moves when the text is changed in a way a reader would notice. */
  published: string
  updated: string
  disclaimer?: Disclaimer
  /** Slugs of other guides worth reading next. */
  related?: string[]
  intro: string[]
  keyPoints: string[]
  sections: GuideSection[]
}

/** The guides about reading the news have no topic page of their own. */
export const NEWS_TOPIC = 'news'

export const GUIDES: readonly Guide[] = [...MONEY_GUIDES, ...TECH_GUIDES, ...SCIENCE_GUIDES, ...CULTURE_GUIDES]

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug)
}

export function guidesForTopic(topic: string): Guide[] {
  return GUIDES.filter((guide) => guide.topic === topic)
}

/** Every piece of text a reader reads in the guide, in order. */
export function guideText(guide: Guide): string[] {
  return [
    ...guide.intro,
    ...guide.keyPoints,
    ...guide.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? []), ...(section.example ? [section.example] : [])]),
  ]
}

export function guideWordCount(guide: Guide): number {
  return guideText(guide).join(' ').split(/\s+/).filter(Boolean).length
}

/** Minutes to read, at an unhurried 200 words a minute, never under one. */
export function readingMinutes(guide: Guide): number {
  return Math.max(1, Math.round(guideWordCount(guide) / 200))
}

/** The guides to offer after this one: the ones it names, then others on its topic, at most `max`. */
export function relatedGuides(guide: Guide, max = 4): Guide[] {
  const named = (guide.related ?? []).map(getGuide).filter((other): other is Guide => other !== undefined && other.slug !== guide.slug)
  const sameTopic = guidesForTopic(guide.topic).filter((other) => other.slug !== guide.slug && !named.includes(other))
  return [...named, ...sameTopic].slice(0, max)
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-11-10" as "10 November 2026". */
export function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return `${day} ${MONTHS[month - 1]} ${year}`
}

/** The day the newest guide was last updated: when the Learn page itself last changed. */
export const LEARN_UPDATED: string = GUIDES.map((guide) => guide.updated).sort().at(-1) ?? '2026-11-10'
