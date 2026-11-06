import type { StringKey } from '../i18n'
import { shareEligible, shareMessage, type ShareSource } from '../data/share-links'
import type { Story } from '../data/story'

/** The wait before the reader is told that the link is being made (MainActivity.PREPARING_HINT_MS). */
export const PREPARING_HINT_MS = 700

export interface SharerDeps {
  readonly links: ShareSource
  /** The website's switch: Share makes a Plax page for the story (off: the publisher's link is shared). */
  readonly pagesOn: () => boolean
  readonly appName: () => string
  /** Opens the chooser with this text. Resolves false, or rejects, when there is no app to share to. */
  readonly send: (message: string) => Promise<boolean | void>
  readonly say: (key: StringKey) => void
  /** The app is on the screen: a chooser started from the background would be blocked, and one for a closed screen is pointless. */
  readonly visible: () => boolean
  readonly setTimer?: (callback: () => void, ms: number) => unknown
  readonly clearTimer?: (handle: unknown) => void
}

export interface Sharer {
  /**
   * Shares the story as a page on Plax when it can have one (a link that previews well and brings readers here), and as its publisher's
   * link otherwise, or whenever the page cannot be made in time. Tapping Share again on the same story while the link is being made means
   * "do not wait": its publisher's link goes out at once.
   */
  share(story: Story): void
  /** Stops waiting for the link being made, whatever it says later. */
  cancel(): void
}

export function createSharer(deps: SharerDeps): Sharer {
  const setTimer = deps.setTimer ?? ((callback, ms) => setTimeout(callback, ms))
  const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  let waiting: { readonly story: Story; readonly abort: AbortController; readonly timer: unknown } | null = null
  let generation = 0

  function giveUp(): void {
    generation++
    if (waiting === null) return
    clearTimer(waiting.timer)
    waiting.abort.abort()
    waiting = null
  }

  async function deliver(story: Story, link: string): Promise<void> {
    try {
      if ((await deps.send(shareMessage(story, link, deps.appName()))) === false) deps.say('share_unavailable')
    } catch {
      deps.say('share_unavailable')
    }
  }

  return {
    share(story) {
      if (waiting !== null) {
        const sameStory = waiting.story.id === story.id
        giveUp()
        if (sameStory) {
          void deliver(story, '')
          return
        }
      }
      if (!shareEligible(story) || !deps.pagesOn()) {
        void deliver(story, '')
        return
      }
      const mine = ++generation
      const abort = new AbortController()
      const timer = setTimer(() => deps.say('share_preparing'), PREPARING_HINT_MS)
      waiting = { story, abort, timer }
      void deps.links
        .link(story, abort.signal)
        .catch(() => '')
        .then((link) => {
          if (mine !== generation) return
          clearTimer(timer)
          waiting = null
          if (deps.visible()) void deliver(story, link)
        })
    },
    cancel: giveUp,
  }
}
