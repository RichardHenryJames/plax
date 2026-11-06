import { makeStory, type Story } from '../../data/story'
import type { StringKey } from '../../i18n'
import { PREPARING_HINT_MS, createSharer, type SharerDeps } from '../sharer'

const SIG = 'a'.repeat(32)
const signed = (id: string): Story => makeStory({ id, title: `Headline ${id}`, sourceUrl: `https://publisher.example/${id}`, sig: SIG })
const unsigned = makeStory({ id: 'u', title: 'Unsigned', sourceUrl: 'https://publisher.example/u' })

interface Pending {
  story: Story
  resolve: (link: string) => void
  signal: AbortSignal | undefined
}

function setup(overrides: Partial<SharerDeps> = {}) {
  const sent: string[] = []
  const said: StringKey[] = []
  const asked: Pending[] = []
  const timers: { callback: () => void; ms: number; cleared: boolean }[] = []
  let visible = true
  const sharer = createSharer({
    links: {
      link: (story, signal) =>
        new Promise<string>((resolve) => {
          asked.push({ story, resolve, signal })
        }),
    },
    pagesOn: () => true,
    appName: () => 'Plax',
    send: async (message) => {
      sent.push(message)
    },
    say: (key) => said.push(key),
    visible: () => visible,
    setTimer: (callback, ms) => {
      timers.push({ callback, ms, cleared: false })
      return timers.length - 1
    },
    clearTimer: (handle) => {
      timers[handle as number].cleared = true
    },
    ...overrides,
  })
  return { sharer, sent, said, asked, timers, hide: () => (visible = false) }
}

const flush = async () => {
  for (let turn = 0; turn < 5; turn++) await Promise.resolve()
}

describe('sharing a story', () => {
  it('sends the publisher’s link at once for a story that cannot have a page of its own', async () => {
    const { sharer, sent, asked } = setup()
    sharer.share(unsigned)
    await flush()
    expect(sent).toEqual(['Unsigned\nhttps://publisher.example/u'])
    expect(asked).toHaveLength(0)
  })

  it('sends the publisher’s link at once when the website has switched pages off', async () => {
    const { sharer, sent, asked } = setup({ pagesOn: () => false })
    sharer.share(signed('a'))
    await flush()
    expect(sent).toEqual(['Headline a\nhttps://publisher.example/a'])
    expect(asked).toHaveLength(0)
  })

  it('sends the page the server made, without a hint when it is quick', async () => {
    const { sharer, sent, said, asked, timers } = setup()
    sharer.share(signed('a'))
    expect(asked).toHaveLength(1)
    expect(timers[0].ms).toBe(PREPARING_HINT_MS)
    asked[0].resolve('https://plax-rouge.vercel.app/news/s/headline-a-aaaaaaaaaaaaaaaa')
    await flush()
    expect(sent).toEqual(['Headline a\nhttps://plax-rouge.vercel.app/news/s/headline-a-aaaaaaaaaaaaaaaa'])
    expect(timers[0].cleared).toBe(true)
    expect(said).toEqual([])
  })

  it('falls back to the publisher’s link when the server has none', async () => {
    const { sharer, sent, asked } = setup()
    sharer.share(signed('a'))
    asked[0].resolve('')
    await flush()
    expect(sent).toEqual(['Headline a\nhttps://publisher.example/a'])
  })

  it('tells the reader the link is being made when it takes longer than the hint', async () => {
    const { sharer, said, timers, asked } = setup()
    sharer.share(signed('a'))
    timers[0].callback()
    expect(said).toEqual(['share_preparing'])
    asked[0].resolve('')
    await flush()
  })

  it('sends the publisher’s link at once when Share is tapped again on the story being waited for, and ignores the late page', async () => {
    const { sharer, sent, asked, timers } = setup()
    const story = signed('a')
    sharer.share(story)
    sharer.share(story)
    await flush()
    expect(sent).toEqual(['Headline a\nhttps://publisher.example/a'])
    expect(timers[0].cleared).toBe(true)
    expect(asked[0].signal?.aborted).toBe(true)
    asked[0].resolve('https://plax-rouge.vercel.app/news/s/late')
    await flush()
    expect(sent).toHaveLength(1)
  })

  it('lets go of the first story when another is shared, and waits for the second', async () => {
    const { sharer, sent, asked } = setup()
    sharer.share(signed('a'))
    sharer.share(signed('b'))
    expect(asked).toHaveLength(2)
    expect(asked[0].signal?.aborted).toBe(true)
    asked[0].resolve('https://plax-rouge.vercel.app/news/s/a')
    asked[1].resolve('https://plax-rouge.vercel.app/news/s/b')
    await flush()
    expect(sent).toEqual(['Headline b\nhttps://plax-rouge.vercel.app/news/s/b'])
  })

  it('does not open the chooser when the app has left the screen by the time the page is made', async () => {
    const { sharer, sent, asked, hide } = setup()
    sharer.share(signed('a'))
    hide()
    asked[0].resolve('https://plax-rouge.vercel.app/news/s/a')
    await flush()
    expect(sent).toEqual([])
  })

  it('stops waiting when told to', async () => {
    const { sharer, sent, asked, timers } = setup()
    sharer.share(signed('a'))
    sharer.cancel()
    expect(timers[0].cleared).toBe(true)
    expect(asked[0].signal?.aborted).toBe(true)
    asked[0].resolve('https://plax-rouge.vercel.app/news/s/a')
    await flush()
    expect(sent).toEqual([])
  })

  it('can be shared again after it has been sent', async () => {
    const { sharer, sent, asked } = setup()
    sharer.share(signed('a'))
    asked[0].resolve('https://plax-rouge.vercel.app/news/s/a')
    await flush()
    sharer.share(signed('a'))
    expect(asked).toHaveLength(2)
    asked[1].resolve('https://plax-rouge.vercel.app/news/s/a')
    await flush()
    expect(sent).toHaveLength(2)
  })

  it('says so when no app can take the story', async () => {
    const { sharer, said } = setup({ send: async () => false })
    sharer.share(unsigned)
    await flush()
    expect(said).toEqual(['share_unavailable'])
  })

  it('says so when opening the chooser fails', async () => {
    const { sharer, said } = setup({
      send: async () => {
        throw new Error('no activity')
      },
    })
    sharer.share(unsigned)
    await flush()
    expect(said).toEqual(['share_unavailable'])
  })

  it('treats a failed request for the page as no page', async () => {
    const { sharer, sent } = setup({ links: { link: () => Promise.reject(new Error('offline')) } })
    sharer.share(signed('a'))
    await flush()
    expect(sent).toEqual(['Headline a\nhttps://publisher.example/a'])
  })

  it('names the app when the story has no headline', async () => {
    const { sharer, sent } = setup()
    sharer.share(makeStory({ id: 'n', title: '  ', sourceUrl: 'https://publisher.example/n' }))
    await flush()
    expect(sent).toEqual(['Plax\nhttps://publisher.example/n'])
  })
})
