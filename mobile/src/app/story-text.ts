import { sectionLabel, type AppConfig } from '../config/app-config'
import { readSeconds, type Story } from '../data/story'
import { topicById, topicLabel } from '../data/topic'
import type { Lang, StringKey } from '../i18n'
import { ageParts } from '../ui/story/layout'

export type Translate = (key: StringKey, ...args: (string | number)[]) => string

const NO_BREAK_SPACE = '\u00a0'
const ENGLISH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Each part after the source is kept whole, so that a line never breaks inside "3 h ago". */
const whole = (text: string): string => text.replace(/ /g, NO_BREAK_SPACE)

/**
 * The word set over a story ("INDIA"), in capitals: the website's name for the story's section, else the name of its topic, else the
 * category as the feed wrote it (StoryAdapter.label of the native app).
 */
export function storyTag(story: Story, config: AppConfig, lang: Lang, t: Translate): string {
  const key = story.section === '' ? story.category : story.section
  const section = config.sections.find((entry) => entry.id === key)
  const topic = section === undefined ? topicById(config.topics, key) : undefined
  const label = section !== undefined ? sectionLabel(section, lang) : topic !== undefined ? topicLabel(topic, lang) : key === '' ? t('topic_news') : key
  return label.toUpperCase()
}

/** The day and the short month in the reader's language: "5 Nov", "5 नव॰". */
export function dayAndMonth(day: number, month: number, lang: Lang): string {
  try {
    const text = new Date(2000, month, day).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })
    // An engine without the locale's data answers with numbers only: the table below is better than that.
    if (/[A-Za-z\u0900-\u097F]/.test(text)) return text
  } catch {
    // No Intl at all: the English month is used.
  }
  return `${day} ${ENGLISH_MONTHS[month] ?? ''}`.trim()
}

/** How long ago a story was published: "Just now", "5 min ago", "3 h ago", and from a day on its date. '' when the feed gave no time. */
export function ageText(publishedAt: number, now: number, t: Translate, lang: Lang): string {
  const age = ageParts(publishedAt, now)
  switch (age.kind) {
    case 'none':
      return ''
    case 'now':
      return t('just_now')
    case 'minutes':
      return t('minutes_ago', age.value)
    case 'hours':
      return t('hours_ago', age.value)
    case 'date':
      return dayAndMonth(age.day, age.month, lang)
  }
}

/** The reading time as the feed gave it ("13s", "2 min") in the reader's words, or as written when it has another form. */
export function readTimeText(story: Story, t: Translate): string {
  const seconds = readSeconds(story)
  if (seconds < 0) return story.readTime
  return seconds < 60 ? t('read_seconds', seconds) : t('read_minutes', Math.max(1, Math.round(seconds / 60)))
}

export interface CreditOptions {
  readonly lang: Lang
  readonly now: number
  /** The website says to name the publisher (features.sourceName of its settings). */
  readonly namesSource: boolean
  /** The page is wide enough to hold the reading time beside the buttons. */
  readonly roomy: boolean
}

/** The line beside the tag: the publisher (when the website says to name it), the age and the reading time, set apart by dots. */
export function storyCredit(story: Story, t: Translate, options: CreditOptions): string {
  const parts: string[] = []
  if (options.namesSource) parts.push(story.source === '' ? t('source_unknown') : story.source)
  const age = ageText(story.publishedAt, options.now, t, options.lang)
  if (age !== '') parts.push(whole(age))
  const reading = options.roomy ? readTimeText(story, t) : ''
  if (reading !== '') parts.push(whole(reading))
  return parts.join(' \u00b7 ')
}
