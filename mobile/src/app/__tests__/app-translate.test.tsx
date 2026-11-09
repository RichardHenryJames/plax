import { act, fireEvent, screen } from '@testing-library/react-native'
import { stories as makeStories } from '../../data/__tests__/helpers'
import { makeStory, type Story } from '../../data/story'
import { flushPromises } from '../../test/helpers'
import { measureEverything } from '../../test/measure'
import { forgetMeasures } from '../../ui/story/measure'
import { chooseFromMenu, mountApp, PHONE, press, swipeTo, type AppRig } from './rig'

const ENGLISH = 'Hindustan Coca-Cola Holdings has filed draft papers with the regulator for an initial public offering of its bottling arm in India.'
const HINDI = 'हिंदुस्तान कोका-कोला होल्डिंग्स ने नियामक के पास अपनी बॉटलिंग इकाई के आईपीओ के लिए ड्राफ्ट पेपर दाखिल किए हैं और बाज़ार ने इसका स्वागत किया है।'

/** Stories as the feed of Hindi has them for Stocks and Books: in English. */
const english = (prefix: string, count: number): Story[] => makeStories(prefix, count).map((item) => makeStory({ ...item, content: `${ENGLISH} (${item.id})`, category: 'stocks' }))
/** Stories as the feed of Hindi has them for the other topics: in Hindi. */
const hindi = (prefix: string, count: number): Story[] => makeStories(prefix, count).map((item) => makeStory({ ...item, title: `ख़बर ${item.id}`, content: `${HINDI} (${item.id})` }))

beforeEach(() => forgetMeasures())
afterEach(() => jest.useRealTimers())

/** The feed of Hindi answers with this page, and the pager is drawn for it. */
async function hindiFeedAnswers(rig: AppRig, page: readonly Story[]): Promise<void> {
  await rig.settle()
  await act(async () => {
    rig.source.last.resolve([...page])
    await flushPromises()
  })
  await rig.settle()
  const pager = screen.queryByTestId('feed-pager')
  if (pager) fireEvent(pager, 'layout', { nativeEvent: { layout: PHONE } })
  await rig.settle()
}

async function readInHindi(rig: AppRig, page: readonly Story[]): Promise<void> {
  await chooseFromMenu('menu-language-hi')
  await hindiFeedAnswers(rig, page)
}

/** The pager that a place of the app has just made is drawn at a phone's size. */
async function drawPager(rig: AppRig): Promise<void> {
  await rig.settle()
  const pager = screen.queryByTestId('feed-pager')
  if (pager) fireEvent(pager, 'layout', { nativeEvent: { layout: PHONE } })
  await rig.settle()
}

const asked = (rig: AppRig): string[] => rig.translate.calls.map((call) => call.story.id)

describe('reading in Hindi a topic the feed has only in English', () => {
  it('shows a placeholder where the story will be, and none of its English, and asks for the translation of the story in view and the next ones', async () => {
    const rig = await mountApp({ translateMode: 'hold' })
    await readInHindi(rig, english('h', 8))
    measureEverything(360)
    expect(screen.getAllByTestId('translating').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Headline h1')).toBeNull()
    expect(screen.queryByText(new RegExp(ENGLISH.slice(0, 30)))).toBeNull()
    expect(asked(rig)).toEqual(['h1', 'h2', 'h3'])
    expect(rig.translate.calls.every((call) => call.lang === 'hi')).toBe(true)
  })

  it('shows the story in Hindi when its translation comes, with the tag still in Hindi and the buttons as they were', async () => {
    const rig = await mountApp({ translateMode: 'hold' })
    await readInHindi(rig, english('h', 8))
    await act(async () => {
      rig.translate.release()
      await flushPromises()
    })
    measureEverything(360)
    expect(screen.getByText('हिंदी शीर्षक h1')).toBeTruthy()
    expect(screen.getAllByTestId('body')[0]).toHaveTextContent(/^हिंदी में ख़बर h1/)
    expect(screen.queryByText('Headline h1')).toBeNull()
    expect(screen.getAllByTestId('tag')[0]).toHaveTextContent('शेयर बाज़ार')
    expect(screen.getAllByTestId('save').length).toBeGreaterThan(0)
  })

  it('asks for the stories ahead of the reader as they move on, and not for those they have left far behind', async () => {
    const rig = await mountApp()
    await readInHindi(rig, english('h', 14))
    expect(asked(rig)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5'])
    await swipeTo(5)
    expect(asked(rig)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10'])
    await swipeTo(10)
    expect(asked(rig).slice(10)).toEqual(['h11', 'h12', 'h13', 'h14'])
  })

  it('shows the translations the page already has at once when the reader goes back to a story', async () => {
    const rig = await mountApp()
    await readInHindi(rig, english('h', 8))
    await swipeTo(3)
    await swipeTo(0)
    measureEverything(360)
    expect(screen.getByText('हिंदी शीर्षक h1')).toBeTruthy()
    expect(asked(rig).filter((id) => id === 'h1')).toHaveLength(1)
  })

  it('shows the story as it came, in English, when the translation could not be had after the tries', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] })
    const rig = await mountApp({ translateMode: 'fail' })
    await readInHindi(rig, english('h', 3))
    measureEverything(360)
    expect(screen.getAllByTestId('translating').length).toBeGreaterThanOrEqual(1)
    expect(asked(rig)).toEqual(['h1', 'h2', 'h3'])
    await act(async () => {
      jest.advanceTimersByTime(1500)
      await flushPromises()
    })
    expect(asked(rig)).toHaveLength(6)
    expect(screen.getAllByTestId('translating').length).toBeGreaterThanOrEqual(1)
    await act(async () => {
      jest.advanceTimersByTime(4000)
      await flushPromises()
    })
    expect(asked(rig)).toHaveLength(9)
    measureEverything(360)
    expect(screen.queryByTestId('translating')).toBeNull()
    expect(screen.getByText('Headline h1')).toBeTruthy()
  })

  it('saves the story the feed gave, not its translation, and shows the saved story translated', async () => {
    const rig = await mountApp()
    await readInHindi(rig, english('h', 4))
    measureEverything(360)
    await press(screen.getAllByTestId('save')[0])
    expect(rig.services.engine.getState().savedIds.has('h1')).toBe(true)
    await chooseFromMenu('menu-saved')
    const saved = rig.services.engine.getState().stories
    expect(saved.map((item) => item.id)).toEqual(['h1'])
    expect(saved[0].title).toBe('Headline h1')
    expect(saved[0].content).toBe(`${ENGLISH} (h1)`)
    await drawPager(rig)
    measureEverything(360)
    expect(screen.getByText('हिंदी शीर्षक h1')).toBeTruthy()
  })

  it('does not ask again for a story it has the translation of after the reader leaves and comes back to Hindi', async () => {
    const rig = await mountApp()
    await readInHindi(rig, english('h', 3))
    const before = asked(rig).length
    await chooseFromMenu('menu-language-en')
    await chooseFromMenu('menu-language-hi')
    await hindiFeedAnswers(rig, english('h', 3))
    expect(asked(rig)).toHaveLength(before)
    measureEverything(360)
    expect(screen.getByText('हिंदी शीर्षक h1')).toBeTruthy()
  })
})

describe('reading in Hindi what needs no translation', () => {
  it('asks for nothing for stories that are in Hindi, and shows them as they are', async () => {
    const rig = await mountApp({ translateMode: 'hold' })
    await readInHindi(rig, hindi('k', 6))
    measureEverything(360)
    expect(asked(rig)).toEqual([])
    expect(screen.queryByTestId('translating')).toBeNull()
    expect(screen.getByText('ख़बर k1')).toBeTruthy()
  })

  it('asks only for the English stories of a feed that has both', async () => {
    const rig = await mountApp({ translateMode: 'hold' })
    const mixed = [...hindi('k', 2), ...english('h', 2), ...hindi('m', 1)]
    await readInHindi(rig, mixed)
    expect(asked(rig)).toEqual(['h1', 'h2'])
  })

  it('asks for nothing in English, whatever the stories are', async () => {
    const rig = await mountApp({ stories: english('e', 6), translateMode: 'hold' })
    measureEverything(360)
    expect(asked(rig)).toEqual([])
    expect(screen.queryByTestId('translating')).toBeNull()
    expect(screen.getByText('Headline e1')).toBeTruthy()
  })
})

describe('going back to English', () => {
  it('abandons the translations that are on their way and shows the English feed as it was', async () => {
    const rig = await mountApp({ translateMode: 'hold' })
    await readInHindi(rig, english('h', 6))
    expect(asked(rig)).toHaveLength(3)
    const signals = rig.translate.calls.length
    await chooseFromMenu('menu-language-en')
    await drawPager(rig)
    measureEverything(360)
    expect(rig.services.engine.getState().lang).toBe('en')
    expect(screen.queryByTestId('translating')).toBeNull()
    expect(screen.getByText('Headline s1')).toBeTruthy()
    expect(asked(rig)).toHaveLength(signals)
  })
})
