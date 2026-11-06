import { en } from '../i18n/en'
import { hi } from '../i18n/hi'
import type { Lang } from '../i18n'

/**
 * A topic the reader can choose. The built-in ones are the topics the app was made with; the website may list others, or the same ones
 * under other names and in another order (see src/config), and what it lists is what the reader is offered. Two topics are the same
 * when their ids are, whatever they are called.
 */
export interface Topic {
  readonly id: string
  readonly emoji: string
  readonly en: string
  readonly hi: string
}

const builtIn = (id: string, emoji: string, english: string, hindi: string): Topic => ({ id, emoji, en: english, hi: hindi })

/** The topics the app was made with: what a build that has not read the website's list offers. */
export const BUILT_IN_TOPICS: readonly Topic[] = [
  builtIn('news', '\u{1F4F0}', en.topic_news, hi.topic_news),
  builtIn('stocks', '\u{1F4CA}', en.topic_stocks, hi.topic_stocks),
  builtIn('science', '\u{1F52C}', en.topic_science, hi.topic_science),
  builtIn('technology', '\u{1F4BB}', en.topic_technology, hi.topic_technology),
  builtIn('philosophy', '\u{1F9E0}', en.topic_philosophy, hi.topic_philosophy),
  builtIn('psychology', '\u{1F9E9}', en.topic_psychology, hi.topic_psychology),
  builtIn('history', '\u{1F3DB}\uFE0F', en.topic_history, hi.topic_history),
  builtIn('finance', '\u{1F4C8}', en.topic_finance, hi.topic_finance),
  builtIn('space', '\u{1F680}', en.topic_space, hi.topic_space),
  builtIn('programming', '\u2328\uFE0F', en.topic_programming, hi.topic_programming),
  builtIn('books', '\u{1F4DA}', en.topic_books, hi.topic_books),
  builtIn('health', '\u{1F34E}', en.topic_health, hi.topic_health),
  builtIn('math', '\u2797', en.topic_math, hi.topic_math),
  builtIn('nature', '\u{1F33F}', en.topic_nature, hi.topic_nature),
  builtIn('art', '\u{1F3A8}', en.topic_art, hi.topic_art),
  builtIn('physics', '\u269B\uFE0F', en.topic_physics, hi.topic_physics),
  builtIn('business', '\u{1F4BC}', en.topic_business, hi.topic_business),
  builtIn('language', '\u{1F5E3}\uFE0F', en.topic_language, hi.topic_language),
]

export const NEWS_TOPIC: Topic = BUILT_IN_TOPICS[0]

/** The name in the language the screen is in (the English one when the topic has no name in that language). */
export const topicLabel = (topic: Topic, lang: Lang): string => (lang === 'hi' && topic.hi !== '' ? topic.hi : topic.en)

export const sameTopic = (a: Topic, b: Topic): boolean => a.id === b.id

export const topicById = (topics: readonly Topic[], id: string): Topic | undefined => topics.find((topic) => topic.id === id)
