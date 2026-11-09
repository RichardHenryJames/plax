import { caughtUp, adStory, makeStory, type Story } from '../story'
import { CONCURRENCY, FAILED_FOR_MS, KEEP, MAX_ATTEMPTS, MIN_CHARS, RETRY_DELAYS_MS, Translations, needsTranslation } from '../translations'
import { TranslateError, type TranslateSource, type Translated } from '../translate-api'

const ENGLISH = 'Hindustan Coca-Cola Holdings has filed draft papers with the regulator for an initial public offering of its bottling arm.'
const HINDI = 'हिंदुस्तान कोका-कोला होल्डिंग्स ने नियामक के पास अपनी बॉटलिंग इकाई के आईपीओ के लिए ड्राफ्ट पेपर दाखिल किए हैं।'

const story = (id: string, fields: Partial<Story> = {}): Story => makeStory({ id, title: `Headline ${id}`, content: `${ENGLISH} (${id})`, category: 'stocks', ...fields })
const list = (count: number, prefix = 's'): Story[] => Array.from({ length: count }, (_, index) => story(`${prefix}${index + 1}`))
const hindiOf = (target: Story): Translated => ({ title: `शीर्षक ${target.id}`, content: `${HINDI} ${target.id}` })

interface Call {
  story: Story
  lang: string
  signal: AbortSignal | undefined
  resolve(value: Translated): void
  reject(error: unknown): void
}

/** A source the test answers one request at a time. */
class Source implements TranslateSource {
  readonly calls: Call[] = []
  throwOnCall: unknown = undefined

  translate(target: Story, lang: string, signal?: AbortSignal): Promise<Translated> {
    if (this.throwOnCall !== undefined) throw this.throwOnCall
    return new Promise((resolve, reject) => {
      this.calls.push({ story: target, lang, signal, resolve, reject })
      signal?.addEventListener('abort', () => reject(new TranslateError('Request failed', true)))
    })
  }

  /** The ids asked for, in order. */
  get asked(): string[] {
    return this.calls.map((call) => call.story.id)
  }

  /** The newest request for this story. */
  of(id: string): Call {
    const call = [...this.calls].reverse().find((candidate) => candidate.story.id === id)
    if (!call) throw new Error(`no request for ${id}`)
    return call
  }
}

/** A clock and timers the test moves by hand. */
function clock() {
  let now = 1_000_000
  const timers: { at: number; run: () => void; cancelled: boolean; ran: boolean }[] = []
  return {
    now: () => now,
    after: (run: () => void, ms: number) => {
      const timer = { at: now + ms, run, cancelled: false, ran: false }
      timers.push(timer)
      return () => void (timer.cancelled = true)
    },
    advance(ms: number) {
      now += ms
      for (const timer of timers.filter((candidate) => !candidate.cancelled && !candidate.ran && candidate.at <= now).sort((a, b) => a.at - b.at)) {
        timer.ran = true
        timer.run()
      }
    },
    get waiting() {
      return timers.filter((candidate) => !candidate.cancelled && !candidate.ran).length
    },
  }
}

const flush = async (): Promise<void> => {
  for (let round = 0; round < 6; round++) await Promise.resolve()
}

function make(options: Partial<ConstructorParameters<typeof Translations>[0]> = {}) {
  const source = new Source()
  const time = clock()
  const translations = new Translations({ source, now: time.now, after: time.after, ...options })
  const heard = jest.fn()
  translations.subscribe(heard)
  return { source, time, translations, heard }
}

describe('which stories need a translation', () => {
  it('are the English ones, when the feed is read in Hindi', () => {
    expect(needsTranslation(story('a'), 'hi')).toBe(true)
  })

  it('are none when it is read in English: English has no translations', () => {
    expect(needsTranslation(story('a'), 'en')).toBe(false)
    expect(needsTranslation(story('a', { content: HINDI }), 'en')).toBe(false)
  })

  it('are not the stories that are Hindi already, with a ticker or a company in Latin letters or without', () => {
    expect(needsTranslation(story('a', { content: HINDI }), 'hi')).toBe(false)
    expect(needsTranslation(story('b', { content: `NSE और BSE पर शेयरों में तेज़ी रही, और निफ़्टी ने नया रिकॉर्ड बनाया। ${HINDI}` }), 'hi')).toBe(false)
  })

  it('are not the stories with next to no text, or none', () => {
    expect(MIN_CHARS).toBe(40)
    expect(needsTranslation(story('a', { content: 'x'.repeat(MIN_CHARS - 1) }), 'hi')).toBe(false)
    expect(needsTranslation(story('b', { content: ' '.repeat(100) }), 'hi')).toBe(false)
    expect(needsTranslation(story('c', { content: 'x'.repeat(MIN_CHARS) }), 'hi')).toBe(true)
    expect(needsTranslation(story('d', { content: '' }), 'hi')).toBe(false)
  })

  it('are not a text with no letters, nor the ads and the caught-up page, which are not stories', () => {
    expect(needsTranslation(story('a', { content: '1234567890 '.repeat(8) }), 'hi')).toBe(false)
    expect(needsTranslation(adStory(1), 'hi')).toBe(false)
    expect(needsTranslation(caughtUp(), 'hi')).toBe(false)
  })
})

describe('what a page shows for a story', () => {
  it('is nothing for a story that needs no translation, and for every story in English', () => {
    const { translations } = make()
    expect(translations.view(story('a', { content: HINDI }), 'hi')).toBeUndefined()
    expect(translations.view(story('b'), 'en')).toBeUndefined()
    expect(translations.view(adStory(1), 'hi')).toBeUndefined()
  })

  it('is the placeholder for a story that needs one and has none, the same object each time', () => {
    const { translations } = make()
    const first = translations.view(story('a'), 'hi')
    expect(first).toEqual({ status: 'pending' })
    expect(translations.view(story('b'), 'hi')).toBe(first)
  })

  it('is the translation once it is there, the same object each time, with the headline kept when none came', async () => {
    const { translations, source } = make()
    const target = story('a')
    translations.want([target], 'hi')
    source.of('a').resolve({ title: '', content: HINDI })
    await flush()
    const ready = translations.view(target, 'hi')
    expect(ready).toEqual({ status: 'ready', title: 'Headline a', content: HINDI })
    expect(translations.view(target, 'hi')).toBe(ready)
  })
})

describe('asking for translations', () => {
  it('asks for the story in view first and the next ones in order, no more at once than are allowed', () => {
    expect(CONCURRENCY).toBe(3)
    const { translations, source } = make()
    translations.want(list(5), 'hi')
    expect(source.asked).toEqual(['s1', 's2', 's3'])
    expect(source.calls.every((call) => call.lang === 'hi')).toBe(true)
  })

  it('asks for the next one as each answer comes', async () => {
    const { translations, source } = make()
    const stories = list(5)
    translations.want(stories, 'hi')
    source.of('s1').resolve(hindiOf(stories[0]))
    await flush()
    expect(source.asked).toEqual(['s1', 's2', 's3', 's4'])
    source.of('s2').resolve(hindiOf(stories[1]))
    await flush()
    expect(source.asked).toEqual(['s1', 's2', 's3', 's4', 's5'])
  })

  it('asks for none of the stories that need no translation, and for none in English', () => {
    const { translations, source } = make()
    translations.want([story('a', { content: HINDI }), story('b'), adStory(2)], 'hi')
    expect(source.asked).toEqual(['b'])
    translations.want(list(3, 'e'), 'en')
    expect(source.asked).toEqual(['b'])
  })

  it('does not ask twice for a story that is on its way, however often the reader is told to be there', () => {
    const { translations, source } = make()
    const stories = list(2)
    for (let times = 0; times < 5; times++) translations.want(stories, 'hi')
    expect(source.asked).toEqual(['s1', 's2'])
  })

  it('does not ask again for a story that has its translation, and keeps it for the next visit', async () => {
    const { translations, source } = make()
    const stories = list(2)
    translations.want(stories, 'hi')
    source.of('s1').resolve(hindiOf(stories[0]))
    source.of('s2').resolve(hindiOf(stories[1]))
    await flush()
    translations.want(stories, 'hi')
    translations.want(list(1, 'z'), 'hi')
    expect(source.asked).toEqual(['s1', 's2', 'z1'])
    expect(translations.view(stories[0], 'hi')).toMatchObject({ status: 'ready' })
  })

  it('tells the page whenever a translation comes, with a new number each time', async () => {
    const { translations, source, heard } = make()
    const stories = list(2)
    const before = translations.getVersion()
    translations.want(stories, 'hi')
    source.of('s1').resolve(hindiOf(stories[0]))
    await flush()
    expect(heard).toHaveBeenCalledTimes(1)
    const after = translations.getVersion()
    expect(after).toBeGreaterThan(before)
    source.of('s2').resolve(hindiOf(stories[1]))
    await flush()
    expect(heard).toHaveBeenCalledTimes(2)
    expect(translations.getVersion()).toBeGreaterThan(after)
  })

  it('stops telling a page that has gone', async () => {
    const { translations, source, heard } = make()
    const stop = jest.fn()
    const unsubscribe = translations.subscribe(stop)
    unsubscribe()
    translations.want([story('a')], 'hi')
    source.of('a').resolve(hindiOf(story('a')))
    await flush()
    expect(stop).not.toHaveBeenCalled()
    expect(heard).toHaveBeenCalledTimes(1)
  })
})

describe('moving on', () => {
  it('lets go of the stories that were waiting and are no longer near, and keeps those on their way', () => {
    const { translations, source } = make({ concurrency: 1 })
    const stories = list(6)
    translations.want(stories.slice(0, 3), 'hi')
    expect(source.asked).toEqual(['s1'])
    // The reader is now at the fifth story: s2 and s3 were waiting and are not wanted any more; s1 is out and stays out.
    translations.want(stories.slice(4, 6), 'hi')
    expect(source.asked).toEqual(['s1'])
    source.of('s1').resolve(hindiOf(stories[0]))
    return Promise.resolve().then(() => flush()).then(() => {
      expect(source.asked).toEqual(['s1', 's5'])
    })
  })

  it('asks for the story the reader has come to before the ones that were next in the line', async () => {
    const { translations, source } = make({ concurrency: 1 })
    const stories = list(5)
    translations.want(stories.slice(0, 3), 'hi')
    translations.want(stories.slice(3, 5), 'hi')
    source.of('s1').resolve(hindiOf(stories[0]))
    await flush()
    expect(source.asked).toEqual(['s1', 's4'])
  })

  it('keeps what a request that went on gave, for when the reader comes back', async () => {
    const { translations, source } = make({ concurrency: 1 })
    const stories = list(5)
    translations.want(stories.slice(0, 2), 'hi')
    translations.want(stories.slice(3, 5), 'hi')
    source.of('s1').resolve(hindiOf(stories[0]))
    await flush()
    expect(translations.view(stories[0], 'hi')).toMatchObject({ status: 'ready', title: 'शीर्षक s1' })
  })
})

describe('when a translation cannot be had', () => {
  it('is tried again after a wait, twice, and then the story is shown as it came', async () => {
    expect(MAX_ATTEMPTS).toBe(3)
    expect(RETRY_DELAYS_MS).toEqual([1500, 4000])
    const { translations, source, time, heard } = make()
    const target = story('a')
    translations.want([target], 'hi')
    source.of('a').reject(new TranslateError('Request refused'))
    await flush()
    expect(translations.view(target, 'hi')).toEqual({ status: 'pending' })
    expect(source.asked).toEqual(['a'])
    time.advance(1499)
    expect(source.asked).toEqual(['a'])
    time.advance(1)
    expect(source.asked).toEqual(['a', 'a'])
    source.calls[1].reject(new TranslateError('Not translated'))
    await flush()
    time.advance(3999)
    expect(source.asked).toHaveLength(2)
    time.advance(1)
    expect(source.asked).toHaveLength(3)
    heard.mockClear()
    source.calls[2].reject(new TranslateError('Request refused'))
    await flush()
    expect(translations.view(target, 'hi')).toBeUndefined()
    expect(heard).toHaveBeenCalledTimes(1)
    time.advance(60_000)
    expect(source.asked).toHaveLength(3)
  })

  it('takes a translation that comes on a try after the first', async () => {
    const { translations, source, time } = make()
    const target = story('a')
    translations.want([target], 'hi')
    source.of('a').reject(new TranslateError('Request refused'))
    await flush()
    time.advance(1500)
    source.calls[1].resolve(hindiOf(target))
    await flush()
    expect(translations.view(target, 'hi')).toMatchObject({ status: 'ready', content: expect.stringContaining(HINDI) })
    expect(time.waiting).toBe(0)
  })

  it('treats a source that fails at once, before it answers, as a failure to try again', async () => {
    const { translations, source, time } = make()
    source.throwOnCall = new Error('boom')
    translations.want([story('a')], 'hi')
    await flush()
    expect(time.waiting).toBe(1)
    source.throwOnCall = undefined
    time.advance(1500)
    expect(source.asked).toEqual(['a'])
  })

  it('does not ask again for a story it gave up on until a while has passed, and then asks on the next visit', async () => {
    expect(FAILED_FOR_MS).toBe(120_000)
    const { translations, source, time } = make({ attempts: 1 })
    const target = story('a')
    translations.want([target], 'hi')
    source.of('a').reject(new TranslateError('Request refused'))
    await flush()
    expect(translations.view(target, 'hi')).toBeUndefined()
    translations.want([target], 'hi')
    time.advance(FAILED_FOR_MS - 1)
    translations.want([target], 'hi')
    expect(source.asked).toEqual(['a'])
    expect(translations.view(target, 'hi')).toBeUndefined()
    time.advance(1)
    translations.want([target], 'hi')
    expect(source.asked).toEqual(['a', 'a'])
    expect(translations.view(target, 'hi')).toEqual({ status: 'pending' })
  })

  it('tells the page when it asks again, since the story is then the placeholder again', async () => {
    const { translations, source, time, heard } = make({ attempts: 1 })
    const target = story('a')
    translations.want([target], 'hi')
    source.of('a').reject(new TranslateError('x'))
    await flush()
    time.advance(FAILED_FOR_MS)
    heard.mockClear()
    translations.want([target], 'hi')
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('does not count a request the reader abandoned as a failure', async () => {
    const { translations, source, time } = make()
    translations.want([story('a')], 'hi')
    source.of('a').reject(new TranslateError('Request failed', true))
    await flush()
    expect(time.waiting).toBe(0)
  })

  it('does not wait to try again for a story the reader has gone from', async () => {
    const { translations, source, time } = make()
    const stories = list(8)
    translations.want(stories.slice(0, 1), 'hi')
    source.of('s1').reject(new TranslateError('x'))
    await flush()
    expect(time.waiting).toBe(1)
    translations.want(stories.slice(5, 7), 'hi')
    expect(time.waiting).toBe(0)
    time.advance(10_000)
    expect(source.asked).toEqual(['s1', 's6', 's7'])
  })
})

describe('changing the language', () => {
  it('abandons what is on its way when the feed goes back to English, and asks for nothing', () => {
    const { translations, source } = make()
    translations.want(list(3), 'hi')
    const signals = source.calls.map((call) => call.signal)
    translations.want(list(3), 'en')
    expect(signals.every((signal) => signal?.aborted)).toBe(true)
    expect(source.asked).toHaveLength(3)
    expect(translations.view(story('s1'), 'en')).toBeUndefined()
  })

  it('asks again for what was not finished when Hindi comes back, but not for what was', async () => {
    const { translations, source } = make()
    const stories = list(2)
    translations.want(stories, 'hi')
    source.of('s1').resolve(hindiOf(stories[0]))
    await flush()
    translations.want(stories, 'en')
    translations.want(stories, 'hi')
    expect(source.asked).toEqual(['s1', 's2', 's2'])
    expect(translations.view(stories[0], 'hi')).toMatchObject({ status: 'ready' })
  })

  it('forgets what it gave up on, so that coming back to Hindi is a new try', async () => {
    const { translations, source } = make({ attempts: 1 })
    const target = story('a')
    translations.want([target], 'hi')
    source.of('a').reject(new TranslateError('x'))
    await flush()
    expect(translations.view(target, 'hi')).toBeUndefined()
    translations.want([target], 'en')
    translations.want([target], 'hi')
    expect(source.asked).toEqual(['a', 'a'])
  })

  it('does not take an answer that was on its way when the language changed for a failure of the story', async () => {
    const { translations, source, time } = make()
    const target = story('a')
    translations.want([target], 'hi')
    translations.want([target], 'en')
    await flush()
    expect(time.waiting).toBe(0)
    expect(translations.view(target, 'hi')).toEqual({ status: 'pending' })
  })
})

describe('stopping', () => {
  it('abandons what is on its way and every wait, and can be asked again afterwards', async () => {
    const { translations, source, time } = make()
    translations.want(list(5), 'hi')
    source.of('s1').reject(new TranslateError('x'))
    await flush()
    const signals = source.calls.map((call) => call.signal)
    translations.stop()
    await flush()
    expect(signals.filter((signal) => signal?.aborted).length).toBeGreaterThanOrEqual(2)
    expect(time.waiting).toBe(0)
    translations.want(list(1, 'n'), 'hi')
    expect(source.asked.at(-1)).toBe('n1')
  })
})

describe('what is kept', () => {
  it('is the most recent translations, as many as the limit', async () => {
    expect(KEEP).toBe(200)
    const { translations, source } = make({ keep: 2 })
    const stories = list(3)
    translations.want([stories[0]], 'hi')
    source.of('s1').resolve(hindiOf(stories[0]))
    await flush()
    translations.want([stories[1]], 'hi')
    source.of('s2').resolve(hindiOf(stories[1]))
    await flush()
    translations.want([stories[2]], 'hi')
    source.of('s3').resolve(hindiOf(stories[2]))
    await flush()
    expect(translations.view(stories[0], 'hi')).toEqual({ status: 'pending' })
    expect(translations.view(stories[1], 'hi')).toMatchObject({ status: 'ready' })
    expect(translations.view(stories[2], 'hi')).toMatchObject({ status: 'ready' })
  })
})
