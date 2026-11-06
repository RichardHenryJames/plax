import { useCallback, useEffect, useRef, useState } from 'react'
import { deeperCache, deeperKey, loadDeeper, type DeeperSource } from '../data/deeper-api'
import type { Story } from '../data/story'
import type { Lang } from '../i18n'
import type { DeeperView } from '../ui/screens'

export interface DeeperState {
  /** What the sheet shows. */
  readonly view: DeeperView
  /** The language the facts are in, or being asked for. */
  readonly language: Lang
  /** The other language's chip. */
  choose(language: Lang): void
  /** "Try again". */
  retry(): void
}

/**
 * Go deeper for one story at a time (DeeperSheet.load of the native app). Opening a story (a story instead of null) shows the facts at
 * once when they were written before, and asks for them otherwise; choosing the other language does the same for that language;
 * closing (null) abandons a request still on its way. An answer for anything but the latest ask is dropped.
 */
export function useDeeper(source: DeeperSource, story: Story | null, language: Lang): DeeperState {
  const [chosen, setChosen] = useState<Lang>(language)
  const [view, setView] = useState<DeeperView>({ status: 'loading' })
  const generation = useRef(0)
  const request = useRef<AbortController | null>(null)
  const openedIn = useRef(language)
  openedIn.current = language

  const cancel = useCallback(() => {
    generation.current++
    request.current?.abort()
    request.current = null
  }, [])

  const load = useCallback(
    (target: Story, wanted: Lang) => {
      cancel()
      const known = deeperCache.get(deeperKey(target, wanted))
      if (known !== undefined) {
        setView({ status: 'content', insights: known.insights })
        return
      }
      setView({ status: 'loading' })
      const mine = generation.current
      const controller = new AbortController()
      request.current = controller
      loadDeeper(source, target, wanted, controller.signal).then(
        (deeper) => {
          if (mine === generation.current) setView({ status: 'content', insights: deeper.insights })
        },
        () => {
          if (mine === generation.current) setView({ status: 'error', message: 'deeper_error' })
        },
      )
    },
    [cancel, source],
  )

  const id = story?.id ?? null
  useEffect(() => {
    if (story === null) return undefined
    setChosen(openedIn.current)
    load(story, openedIn.current)
    return cancel
    // A new story opens the sheet again; the same story with other fields (a refresh) does not ask again.
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = useCallback(
    (next: Lang) => {
      if (story === null || next === chosen) return
      setChosen(next)
      load(story, next)
    },
    [story, chosen, load],
  )
  const retry = useCallback(() => {
    if (story !== null) load(story, chosen)
  }, [story, chosen, load])

  return { view, language: chosen, choose, retry }
}
