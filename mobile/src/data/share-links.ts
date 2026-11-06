import { site } from '../build'
import { request as httpRequest } from '../platform/http'
import type { RequestFn } from './feed-api'
import { isBlank } from './java-text'
import { Lru } from './lru'
import { hasSource, isSignature, type Story } from './story'

/**
 * Asks the Plax site to make a story's own page and returns its address, so that sharing sends a link which previews well in chat
 * apps and brings readers to Plax. The server accepts only a story exactly as it served it (it signs every story), so the story itself
 * is the only data sent. Any trouble means no link, and the publisher's link is shared. A port of ShareLinks.java (1.7.1); the
 * website's own client is src/lib/share-client.ts, and both follow the rules of src/lib/share.ts.
 */
export interface ShareSource {
  /** The page's address, or an empty string when there is none (the publisher's link is shared then). It never fails. */
  link(story: Story, signal?: AbortSignal): Promise<string>
}

/** The longest a reader waits for the link after tapping Share. A first request to a cold server takes a couple of seconds. */
export const SHARE_WAIT_MS = 7000
/** The longest answer read. */
export const SHARE_MAX_CHARS = 8 * 1024
/** How many links made in this session are kept, so that sharing a story again is instant. */
export const SHARE_CACHE_SIZE = 60

/** The length of the part of the signature that names a story's page. */
const SHARE_ID_LENGTH = 16

/** The site's own link-making service; the pages it makes live in the same place as the feed. */
export const shareEndpoint = (): string => `${site()}/api/share`

/** Whether a story can have a page of its own: the server signed it, and it points back to its publisher. */
export const shareEligible = (story: Story): boolean => isSignature(story.sig) && story.sourceUrl !== ''

/** The story as the feed served it, with its signature. Nothing about the reader is sent. */
export function shareRequestBody(story: Story): string {
  return JSON.stringify({
    id: story.id,
    title: story.title,
    content: story.content,
    source: story.source,
    sourceUrl: story.sourceUrl,
    image: story.image,
    publishedAt: story.publishedAt,
    category: story.category,
    section: story.section,
    sig: story.sig,
  })
}

/**
 * The page address the server named, or an empty string. It is only trusted if it is a story page of this very story on the Plax
 * site itself, so a wrong answer can never make the app share some other address.
 */
export function shareAddress(text: string, story: Story): string {
  try {
    const root: unknown = JSON.parse(text)
    if (typeof root !== 'object' || root === null || Array.isArray(root)) return ''
    const { id, url } = root as Record<string, unknown>
    if (typeof id !== 'string' || typeof url !== 'string') return ''
    if (id.length !== SHARE_ID_LENGTH || !isSignature(story.sig) || !story.sig.startsWith(id)) return ''
    if (/[?#]/.test(url)) return ''
    const link = new URL(url)
    const home = new URL(site())
    // The same scheme, host and port as the site, and no user name or password.
    if (link.protocol !== home.protocol || link.host !== home.host || link.username !== '' || link.password !== '') return ''
    const path = link.pathname
    return path.startsWith(`${home.pathname}/s/`) && path.endsWith(`-${id}`) ? link.href : ''
  } catch {
    return ''
  }
}

/**
 * What the chooser is given: the headline, then one link on its own line. That is the story's page on Plax when it has one, else its
 * publisher's own link, else the site's for a story with no link at all.
 */
export function shareMessage(story: Story, plaxLink: string, appName: string): string {
  const headline = isBlank(story.title) ? appName : story.title
  const link = plaxLink !== '' ? plaxLink : hasSource(story) ? story.sourceUrl : site()
  return `${headline}\n${link}`
}

/** Links made in this session. */
const made = new Lru<string, string>(SHARE_CACHE_SIZE)

/** Forgets the links made in this session. For tests. */
export const resetShareLinks = (): void => made.clear()

export function createShareLinks(options: { request?: RequestFn; cache?: Lru<string, string> } = {}): ShareSource {
  const send = options.request ?? httpRequest
  const cache = options.cache ?? made
  return {
    async link(story, signal) {
      if (!shareEligible(story)) return ''
      const known = cache.get(story.sig)
      if (known !== undefined) return known
      let link = ''
      try {
        const response = await send(shareEndpoint(), {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8' },
          body: shareRequestBody(story),
          timeoutMs: SHARE_WAIT_MS,
          maxChars: SHARE_MAX_CHARS,
          signal,
        })
        if (response.ok) link = shareAddress(response.text, story)
      } catch {
        link = ''
      }
      if (link !== '') cache.set(story.sig, link)
      return link
    },
  }
}
