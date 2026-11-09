import { site } from '../build'
import type { Lang } from '../i18n'
import { HttpError, request as httpRequest, type HttpResult } from '../platform/http'
import { isHindiText } from './devanagari'
import type { RequestFn } from './feed-api'
import type { Story } from './story'

/** A story's headline and text in the language asked for. */
export interface Translated {
  readonly title: string
  readonly content: string
}

/** Where translations come from: the website's endpoint, the same one the website itself translates with, or a fake in a test. */
export interface TranslateSource {
  /** The story in the language, or a TranslateError. Aborting the signal abandons the request. */
  translate(story: Story, lang: Lang, signal?: AbortSignal): Promise<Translated>
}

/** A translation failed, for any reason (no answer, a refusal, an answer that is not in the language asked for). */
export class TranslateError extends Error {
  constructor(
    message = 'Could not translate',
    /** True when the caller abandoned the request, so that it is not a failure to try again. */
    readonly aborted = false,
  ) {
    super(message)
    this.name = 'TranslateError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** The server can take several seconds for an answer it has not written before (an AI draft, then a translation), and a few for a slow one. */
export const TRANSLATE_TIMEOUT_MS = 25_000
/** The longest answer read. */
export const TRANSLATE_MAX_CHARS = 64 * 1024
/** The most of a story's text that is sent (the endpoint looks at the first 2,200 characters for its cache and at the rest only for the draft). */
export const TRANSLATE_MAX_SOURCE = 3_000
export const TRANSLATE_MAX_TITLE = 500

/**
 * The request the website makes for every card it shows in Hindi, with the same fields, so that the server's own cache, which is keyed by
 * them, answers the app and the website from the same entries. Only the story's headline and text and its topic are sent, and the language.
 */
export function translateRequestBody(story: Story, lang: Lang): string {
  return JSON.stringify({
    content: story.content.length > TRANSLATE_MAX_SOURCE ? story.content.slice(0, TRANSLATE_MAX_SOURCE) : story.content,
    title: story.title.length > TRANSLATE_MAX_TITLE ? story.title.slice(0, TRANSLATE_MAX_TITLE) : story.title,
    type: 'microessay',
    lang,
    category: story.category,
    card: true,
  })
}

/**
 * The words of an AI draft as a page sets them: the Markdown emphasis it may carry (**bold**, *italic*, a list's bullets) is dropped, and its
 * line breaks become spaces, since a page sets a story's text in one run.
 */
export function plainSummary(text: string): string {
  return text
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/\*(?=\S)([^*\n]+?)\*/g, '$1')
    .replace(/^[ \t]*[*\u2022-][ \t]+/gm, '')
    .replace(/\*{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The translation in an answer. The endpoint answers 200 with the English as it was when it could not translate (every service it
 * tries was out), so an answer that is not in the language asked for is a failure, not a translation.
 */
export function parseTranslated(text: string, lang: Lang): Translated {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    throw new TranslateError('Invalid response')
  }
  if (typeof root !== 'object' || root === null || Array.isArray(root)) throw new TranslateError('Invalid response')
  const fields = root as Record<string, unknown>
  if (typeof fields.content !== 'string') throw new TranslateError('Invalid content')
  const content = plainSummary(fields.content)
  if (content === '') throw new TranslateError('No content')
  if (lang === 'hi' && !isHindiText(content)) throw new TranslateError('Not translated')
  const title = typeof fields.title === 'string' ? plainSummary(fields.title) : ''
  return { title, content }
}

/** Calls the website's endpoint that writes and translates a card. Every way it can fail ends as a TranslateError. */
export function createTranslateApi(options: { request?: RequestFn } = {}): TranslateSource {
  const send = options.request ?? httpRequest
  return {
    async translate(story, lang, signal) {
      let response: HttpResult
      try {
        response = await send(`${site()}/api/summarize`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8' },
          body: translateRequestBody(story, lang),
          timeoutMs: TRANSLATE_TIMEOUT_MS,
          maxChars: TRANSLATE_MAX_CHARS,
          signal,
        })
      } catch (error) {
        throw new TranslateError('Request failed', error instanceof HttpError && error.kind === 'aborted')
      }
      if (!response.ok) throw new TranslateError('Request refused')
      return parseTranslated(response.text, lang)
    },
  }
}
