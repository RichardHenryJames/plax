import { act, renderHook } from '@testing-library/react-native'
import { DeeperError, deeperCache, type DeeperSource } from '../../data/deeper-api'
import { makeStory, type Story } from '../../data/story'
import type { Lang } from '../../i18n'
import { useDeeper, type DeeperState } from '../use-deeper'

const story = (id: string): Story => makeStory({ id, title: `Headline ${id}`, content: 'Some text that is long enough to matter.' })

interface Ask {
  story: Story
  lang: Lang
  signal: AbortSignal | undefined
  resolve: (insights: string[]) => void
  reject: (error: unknown) => void
}

function source() {
  const asks: Ask[] = []
  const deeper: DeeperSource = {
    deeper: (target, lang, signal) =>
      new Promise((resolve, reject) => {
        asks.push({ story: target, lang, signal, resolve: (insights) => resolve({ insights }), reject })
      }),
  }
  return { deeper, asks }
}

interface Input {
  target: Story | null
  lang: Lang
}

function hook(deeper: DeeperSource, target: Story | null, lang: Lang = 'en') {
  return renderHook<DeeperState, Input>(({ target: opened, lang: reading }) => useDeeper(deeper, opened, reading), { initialProps: { target, lang } })
}

const settle = () =>
  act(async () => {
    await Promise.resolve()
  })

beforeEach(() => deeperCache.clear())

describe('go deeper', () => {
  it('asks for the facts when a story is opened, and shows them when they arrive', async () => {
    const { deeper, asks } = source()
    const { result } = hook(deeper, story('a'))
    expect(result.current.view).toEqual({ status: 'loading' })
    expect(result.current.language).toBe('en')
    expect(asks).toHaveLength(1)
    expect(asks[0].lang).toBe('en')
    await act(async () => asks[0].resolve(['one', 'two']))
    expect(result.current.view).toEqual({ status: 'content', insights: ['one', 'two'] })
  })

  it('opens in the language the reader is reading in', () => {
    const { deeper, asks } = source()
    const { result } = hook(deeper, story('a'), 'hi')
    expect(result.current.language).toBe('hi')
    expect(asks[0].lang).toBe('hi')
  })

  it('shows facts written before at once, with no request', () => {
    const { deeper, asks } = source()
    deeperCache.set('a|en', { insights: ['kept'] })
    const { result } = hook(deeper, story('a'))
    expect(result.current.view).toEqual({ status: 'content', insights: ['kept'] })
    expect(asks).toHaveLength(0)
  })

  it('says it failed, and tries again when asked', async () => {
    const { deeper, asks } = source()
    const { result } = hook(deeper, story('a'))
    await act(async () => asks[0].reject(new DeeperError('Request refused')))
    expect(result.current.view).toEqual({ status: 'error', message: 'deeper_error' })
    act(() => result.current.retry())
    expect(result.current.view).toEqual({ status: 'loading' })
    expect(asks).toHaveLength(2)
    await act(async () => asks[1].resolve(['fine']))
    expect(result.current.view).toEqual({ status: 'content', insights: ['fine'] })
  })

  it('asks again in the other language and drops the answer for the first', async () => {
    const { deeper, asks } = source()
    const { result } = hook(deeper, story('a'))
    act(() => result.current.choose('hi'))
    expect(result.current.language).toBe('hi')
    expect(asks).toHaveLength(2)
    expect(asks[0].signal?.aborted).toBe(true)
    await act(async () => asks[0].resolve(['english, too late']))
    expect(result.current.view).toEqual({ status: 'loading' })
    await act(async () => asks[1].resolve(['hindi']))
    expect(result.current.view).toEqual({ status: 'content', insights: ['hindi'] })
    act(() => result.current.choose('en'))
    expect(result.current.language).toBe('en')
  })

  it('does nothing for the language that is already chosen', () => {
    const { deeper, asks } = source()
    const { result } = hook(deeper, story('a'))
    act(() => result.current.choose('en'))
    expect(asks).toHaveLength(1)
  })

  it('abandons a request still on its way when the sheet is closed, and ignores what comes back', async () => {
    const { deeper, asks } = source()
    const { result, rerender } = hook(deeper, story('a'))
    rerender({ target: null, lang: 'en' })
    expect(asks[0].signal?.aborted).toBe(true)
    await act(async () => asks[0].resolve(['too late']))
    expect(result.current.view).toEqual({ status: 'loading' })
  })

  it('starts again for the next story, in the language the reader is reading in then', async () => {
    const { deeper, asks } = source()
    const { result, rerender } = hook(deeper, story('a'))
    act(() => result.current.choose('hi'))
    rerender({ target: null, lang: 'en' })
    rerender({ target: story('b'), lang: 'en' })
    expect(result.current.language).toBe('en')
    expect(asks[asks.length - 1].story.id).toBe('b')
    expect(asks[asks.length - 1].lang).toBe('en')
    await settle()
  })

  it('does not ask again when the same story is drawn again', () => {
    const { deeper, asks } = source()
    const { rerender } = hook(deeper, story('a'))
    rerender({ target: { ...story('a'), title: 'Edited headline' }, lang: 'en' })
    expect(asks).toHaveLength(1)
  })
})
