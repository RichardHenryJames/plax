import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { makeStory } from '../../../data/story'
import { LanguageProvider } from '../../i18n-context'
import { ThemeProvider } from '../../theme'
import { DEFAULT_LAYOUT_CONFIG } from '../layout'
import { forgetMeasures } from '../measure'
import { StoryPage, type StoryPageProps } from '../StoryPage'

const CHAR = 8

/** Plays the part of the phone: tells every text that asks how it broke its lines (a character is 8 dp wide here). */
function measureEverything(width: number): void {
  const texts = screen.UNSAFE_getAllByType(Text).filter((node) => typeof node.props.onTextLayout === 'function')
  for (const node of texts) {
    const style = Object.assign({}, ...[node.props.style].flat(5).filter(Boolean)) as { fontSize?: number }
    const text = String(node.props.children)
    const perLine = Math.max(8, Math.floor(width / (((style.fontSize ?? 16) / 16) * CHAR)))
    const words = text.split(/\s+/)
    const lines: { text: string; width: number }[] = []
    let current = ''
    for (const word of words) {
      if (current === '') current = word
      else if (current.length + 1 + word.length <= perLine) current += ` ${word}`
      else {
        lines.push({ text: `${current} `, width: current.length * CHAR })
        current = word
      }
    }
    lines.push({ text: current, width: current.length * CHAR })
    act(() => node.props.onTextLayout({ nativeEvent: { lines } }))
  }
}

const LONG = 'The court said on Thursday that the ministry must respond within two weeks. Officials said the rules would be reviewed again next month. ' +
  'Opposition leaders called the move a delay, while industry groups welcomed the clarity. The matter returns to the bench in March, when both sides will be heard. '.repeat(6)

function story(overrides: Parameters<typeof makeStory>[0] = { id: 's1' }) {
  return makeStory({ title: 'Court gives ministry two weeks to respond', content: LONG, section: 'india', source: 'The Hindu', sourceUrl: 'https://www.thehindu.com/a', image: 'https://img.test/a.jpg', readTime: '30s', publishedAt: 1, ...overrides })
}

function props(overrides: Partial<StoryPageProps> = {}): StoryPageProps {
  return {
    story: story(), width: 392, height: 780, tag: 'INDIA', credit: '5 min ago', saved: false, saveEnabled: true, showDeeper: true,
    layoutConfig: DEFAULT_LAYOUT_CONFIG, masthead: 'Plax',
    onMenu: jest.fn(), onSave: jest.fn(), onShare: jest.fn(), onDeeper: jest.fn(), onOpenSource: jest.fn(), ...overrides,
  }
}

function page(p: StoryPageProps, lang: 'en' | 'hi' = 'en') {
  return (
    <ThemeProvider mode="light">
      <LanguageProvider lang={lang}>
        <StoryPage {...p} />
      </LanguageProvider>
    </ThemeProvider>
  )
}

beforeEach(() => forgetMeasures())

describe('a story page', () => {
  it('shows only the menu button until its texts are measured, then all of the story', () => {
    render(page(props()))
    expect(screen.queryByTestId('headline')).toBeNull()
    expect(screen.getByLabelText('Menu')).toBeTruthy()
    measureEverything(360)
    expect(screen.getByTestId('headline')).toBeTruthy()
    expect(screen.getByText('Court gives ministry two weeks to respond')).toBeTruthy()
    expect(screen.getByTestId('tag')).toHaveTextContent('INDIA')
    expect(screen.getByTestId('credit')).toHaveTextContent('5 min ago')
    expect(screen.getByTestId('hero')).toBeTruthy()
    expect(screen.getByTestId('body')).toBeTruthy()
  })

  it('cuts a long summary where its room ends, with an ellipsis, in no more lines than the room has', () => {
    render(page(props()))
    measureEverything(360)
    const body = screen.getByTestId('body')
    expect(body.props.numberOfLines).toBeGreaterThanOrEqual(3)
    expect(String(body.props.children).endsWith('\u2026') || /[.!?]$/.test(String(body.props.children))).toBe(true)
    expect(String(body.props.children).length).toBeLessThan(LONG.length)
    expect(body.props.ellipsizeMode).toBe('clip')
  })

  it('shows all of a short summary', () => {
    render(page(props({ story: story({ id: 's2', content: 'A short summary of what happened, in two lines at most, for a quick read.' }) })))
    measureEverything(360)
    expect(screen.getByTestId('body')).toHaveTextContent('A short summary of what happened, in two lines at most, for a quick read.')
  })

  it('gives each button its job and its name', () => {
    const p = props()
    render(page(p))
    measureEverything(360)
    fireEvent.press(screen.getByLabelText('Menu'))
    fireEvent.press(screen.getByLabelText('Save story'))
    fireEvent.press(screen.getByLabelText('Share story'))
    fireEvent.press(screen.getByLabelText('Go deeper on this story'))
    fireEvent.press(screen.getByTestId('headline'))
    expect(p.onMenu).toHaveBeenCalledTimes(1)
    expect(p.onSave).toHaveBeenCalledWith(p.story)
    expect(p.onShare).toHaveBeenCalledWith(p.story)
    expect(p.onDeeper).toHaveBeenCalledWith(p.story)
    expect(p.onOpenSource).toHaveBeenCalledWith(p.story)
  })

  it('leaves Go deeper out when the website switched it off', () => {
    render(page(props({ showDeeper: false })))
    measureEverything(360)
    expect(screen.queryByLabelText('Go deeper on this story')).toBeNull()
    expect(screen.getByLabelText('Save story')).toBeTruthy()
  })

  it('says a story is saved, and does not save while saving is not possible', () => {
    const p = props({ saved: true })
    const { rerender } = render(page(p))
    measureEverything(360)
    expect(screen.getByLabelText('Remove saved story')).toBeTruthy()
    const q = props({ saveEnabled: false })
    rerender(page(q))
    measureEverything(360)
    fireEvent.press(screen.getByLabelText('Save story'))
    expect(q.onSave).not.toHaveBeenCalled()
  })

  it('has a headline that cannot be pressed when the story has no usable link', () => {
    const p = props({ story: story({ id: 's3', sourceUrl: '' }) })
    render(page(p))
    measureEverything(360)
    fireEvent.press(screen.getByTestId('headline'))
    expect(p.onOpenSource).not.toHaveBeenCalled()
  })

  it('stands a poster in for a story without a picture, and when the picture cannot be loaded', () => {
    const { unmount } = render(page(props({ story: story({ id: 's4', image: '', content: 'A short summary of the day.' }) })))
    measureEverything(360)
    expect(screen.getByTestId('poster', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('Plax', { includeHiddenElements: true })).toBeTruthy()
    unmount()
    render(page(props({ story: story({ id: 's5', content: 'A short summary of the day.' }) })))
    measureEverything(360)
    expect(screen.queryByTestId('poster', { includeHiddenElements: true })).toBeNull()
    const image = screen.UNSAFE_getAllByType(require('expo-image').Image)[0]
    act(() => image.props.onError({}))
    measureEverything(360)
    expect(screen.getByTestId('poster', { includeHiddenElements: true })).toBeTruthy()
  })

  it('measures a story once for a size of page, not each time the page is made again', () => {
    const { unmount } = render(page(props()))
    measureEverything(360)
    unmount()
    render(page(props()))
    // Already known: no text asks to be measured.
    expect(screen.UNSAFE_getAllByType(Text).filter((node) => typeof node.props.onTextLayout === 'function')).toHaveLength(0)
    expect(screen.getByTestId('headline')).toBeTruthy()
  })

  it('names everything in Hindi for a Hindi reader', () => {
    render(page(props(), 'hi'))
    measureEverything(360)
    expect(screen.queryByLabelText('Save story')).toBeNull()
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(3)
  })

  it('puts the picture beside the text on a phone on its side', () => {
    render(page(props({ width: 851, height: 340 })))
    measureEverything(300)
    const hero = screen.getByTestId('hero')
    const headline = screen.getByTestId('headline')
    const heroStyle = Object.assign({}, ...[hero.props.style].flat(3))
    const headlineStyle = Object.assign({}, ...[headline.props.style].flat(3))
    expect(heroStyle.left + heroStyle.width).toBeLessThan(headlineStyle.left)
  })

  it('keeps nothing of one story on the page of the next', () => {
    const { rerender } = render(page(props()))
    measureEverything(360)
    rerender(page(props({ story: story({ id: 's9', title: 'A different headline altogether' }) })))
    measureEverything(360)
    expect(screen.getByText('A different headline altogether')).toBeTruthy()
    expect(screen.queryByText('Court gives ministry two weeks to respond')).toBeNull()
  })
})

describe('a story page in Hindi for a story the feed has only in English', () => {
  const HINDI_TITLE = 'कोका-कोला इंडिया ने ड्राफ्ट आईपीओ प्रॉस्पेक्टस दाखिल किया'
  const HINDI_BODY = 'हिंदुस्तान कोका-कोला होल्डिंग्स ने सेबी के पास ड्राफ्ट रेड हेरिंग प्रॉस्पेक्टस दाखिल किया है। प्रस्तावित लेनदेन में प्रमोटर अपनी हिस्सेदारी का एक भाग बेचेगा।'
  const ready = { status: 'ready', title: HINDI_TITLE, content: HINDI_BODY } as const
  const pending = { status: 'pending' } as const

  it('stands a placeholder where the headline and the summary will be, and no words in English, while the translation is on its way', () => {
    render(page(props({ translation: pending }), 'hi'))
    measureEverything(360)
    expect(screen.getByTestId('translating')).toBeTruthy()
    expect(screen.queryByTestId('headline')).toBeNull()
    expect(screen.queryByTestId('body')).toBeNull()
    expect(screen.queryByText('Court gives ministry two weeks to respond')).toBeNull()
    expect(screen.queryByText(/The court said on Thursday/)).toBeNull()
  })

  it('says to a screen reader that it is translating, in the reader\u2019s language, and that it is busy', () => {
    render(page(props({ translation: pending }), 'hi'))
    measureEverything(360)
    const bars = screen.getByTestId('translating')
    expect(bars.props.accessibilityLabel).toBe('अनुवाद हो रहा है…')
    expect(bars.props.accessibilityRole).toBe('progressbar')
    expect(bars.props.accessibilityState).toEqual({ busy: true })
    expect(screen.getAllByText('अनुवाद हो रहा है…').length).toBeGreaterThanOrEqual(1)
  })

  it('keeps the rest of the page as it is meanwhile: the menu, the tag, the age, the picture and the buttons', () => {
    render(page(props({ translation: pending }), 'hi'))
    measureEverything(360)
    expect(screen.getByTestId('tag')).toHaveTextContent('INDIA')
    expect(screen.getByTestId('credit')).toHaveTextContent('5 min ago')
    expect(screen.getByTestId('hero')).toBeTruthy()
    expect(screen.getByTestId('translating')).toBeTruthy()
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(4)
  })

  it('keeps the placeholder inside the room the headline and the summary had', () => {
    render(page(props({ translation: pending }), 'hi'))
    measureEverything(360)
    const style = Object.assign({}, ...[screen.getByTestId('translating').props.style].flat(3)) as { top: number; height: number; overflow: string }
    expect(style.overflow).toBe('hidden')
    expect(style.height).toBeGreaterThan(0)
    expect(style.top + style.height).toBeLessThanOrEqual(780)
  })

  it('shows the translation, laid out as any other text, once it is there', () => {
    const { rerender } = render(page(props({ translation: pending }), 'hi'))
    measureEverything(360)
    rerender(page(props({ translation: ready }), 'hi'))
    measureEverything(360)
    expect(screen.queryByTestId('translating')).toBeNull()
    expect(screen.getByText(HINDI_TITLE)).toBeTruthy()
    expect(screen.getByTestId('body')).toHaveTextContent(HINDI_BODY)
    expect(screen.queryByText('Court gives ministry two weeks to respond')).toBeNull()
  })

  it('lays the translation out at once on a page that was never the placeholder, and cuts it where its room ends', () => {
    render(page(props({ translation: { status: 'ready', title: HINDI_TITLE, content: `${HINDI_BODY} `.repeat(30) } }), 'hi'))
    measureEverything(360)
    const body = screen.getByTestId('body')
    expect(body.props.numberOfLines).toBeGreaterThanOrEqual(3)
    expect(String(body.props.children).length).toBeLessThan(`${HINDI_BODY} `.repeat(30).length)
    expect(screen.getByText(HINDI_TITLE)).toBeTruthy()
  })

  it('keeps the story it was given for the buttons: what is saved, shared, opened and gone deeper on is the feed\u2019s own, not the translation', () => {
    const p = props({ translation: ready })
    render(page(p, 'hi'))
    measureEverything(360)
    fireEvent.press(screen.getByTestId('save'))
    fireEvent.press(screen.getByTestId('share'))
    fireEvent.press(screen.getByTestId('deeper'))
    fireEvent.press(screen.getByTestId('headline'))
    expect(p.onSave).toHaveBeenCalledWith(p.story)
    expect(p.onShare).toHaveBeenCalledWith(p.story)
    expect(p.onDeeper).toHaveBeenCalledWith(p.story)
    expect(p.onOpenSource).toHaveBeenCalledWith(p.story)
    expect(p.story.title).toBe('Court gives ministry two weeks to respond')
    expect(screen.getByTestId(`story-${p.story.id}`)).toBeTruthy()
  })

  it('has no headline to open while it is the placeholder, and the buttons still work', () => {
    const p = props({ translation: pending })
    render(page(p, 'hi'))
    measureEverything(360)
    expect(screen.queryByTestId('headline')).toBeNull()
    fireEvent.press(screen.getByTestId('save'))
    expect(p.onSave).toHaveBeenCalledWith(p.story)
  })

  it('is drawn again when the translation comes, and not when the same one is told again', () => {
    const { rerender } = render(page(props({ translation: pending }), 'hi'))
    measureEverything(360)
    const first = screen.getByTestId('translating')
    const same = props({ translation: pending })
    rerender(page({ ...same, story: props().story }, 'hi'))
    expect(screen.getByTestId('translating')).toBe(first)
    rerender(page(props({ translation: ready }), 'hi'))
    measureEverything(360)
    expect(screen.queryByTestId('translating')).toBeNull()
  })

  it('is as it always was for a story that has no translation to show', () => {
    render(page(props({ translation: undefined }), 'hi'))
    measureEverything(360)
    expect(screen.queryByTestId('translating')).toBeNull()
    expect(screen.getByTestId('headline')).toBeTruthy()
    expect(screen.getByText('Court gives ministry two weeks to respond')).toBeTruthy()
  })

  it('takes the headline from the translation only when it has one, and the body from it always', () => {
    render(page(props({ translation: { status: 'ready', title: 'Court gives ministry two weeks to respond', content: HINDI_BODY } }), 'hi'))
    measureEverything(360)
    expect(screen.getByText('Court gives ministry two weeks to respond')).toBeTruthy()
    expect(screen.getByTestId('body')).toHaveTextContent(/^हिंदुस्तान/)
  })
})
