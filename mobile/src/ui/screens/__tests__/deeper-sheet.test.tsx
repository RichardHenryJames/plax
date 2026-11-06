import { ScrollView, StyleSheet } from 'react-native'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { en } from '../../../i18n/en'
import { hi } from '../../../i18n/hi'
import { DARK_PALETTE, LIGHT_PALETTE } from '../../theme'
import { DeeperSheet, type DeeperSheetProps, type DeeperView } from '../DeeperSheet'
import { LONG_HINDI, backButton, fixedHeightOffenders, limitedLines, quietMotion, show, styleOf, textStyleOf, wrap } from './helpers'

const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>

let calls: unknown[][] = []

function deeper(view: DeeperView, overrides: Partial<DeeperSheetProps> = {}) {
  return (
    <DeeperSheet
      visible
      language="en"
      view={view}
      onLanguage={(lang) => calls.push(['language', lang])}
      onRetry={() => calls.push(['retry'])}
      onClose={() => calls.push(['close'])}
      {...overrides}
    />
  )
}

const FACTS = { status: 'content', insights: ['First fact with **key** phrase.', 'Second *fact* is here.', 'Third fact.'] } as const

beforeEach(() => {
  calls = []
  quietMotion()
})

describe('Go deeper while the facts are on their way', () => {
  it('says "Finding more…" and holds the places of five lines', () => {
    show(deeper({ status: 'loading' }))
    expect(screen.getByRole('header', { name: en.go_deeper })).toBeTruthy()
    expect(screen.getByText(en.deeper_loading)).toBeTruthy()
    expect(screen.getByText(en.deeper_loading).props.accessibilityLiveRegion).toBe('polite')
    expect(screen.getByTestId('deeper-loading').children).toHaveLength(6)
    expect(screen.queryByTestId('deeper-error')).toBeNull()
    expect(screen.queryByTestId('insight-1')).toBeNull()
  })

  it('has the note that AI wrote the facts, and the two languages, from the start', () => {
    show(deeper({ status: 'loading' }))
    expect(screen.getByText(en.deeper_note)).toBeTruthy()
    expect(screen.getByLabelText(en.language_english)).toBeSelected()
    expect(screen.getByLabelText(en.language_hindi)).not.toBeSelected()
  })

  it('does not draw when it is not visible', () => {
    show(deeper({ status: 'loading' }, { visible: false }))
    expect(screen.queryByTestId('deeper-sheet')).toBeNull()
    expect(screen.queryByText(en.deeper_loading)).toBeNull()
  })
})

describe('Go deeper with the facts', () => {
  it('shows each fact in a card of its own, numbered, without the markers of the markdown', () => {
    show(deeper(FACTS))
    expect(screen.queryByText(en.deeper_loading)).toBeNull()
    expect(screen.getByText('First fact with key phrase.')).toBeTruthy()
    expect(screen.getByText('Second fact is here.')).toBeTruthy()
    expect(screen.getByText('Third fact.')).toBeTruthy()
    for (const number of ['1', '2', '3']) expect(within(screen.getByTestId(`insight-badge-${number}`)).getByText(number)).toBeTruthy()
    expect(screen.queryByText('4')).toBeNull()
  })

  it('sets bold and italic words in bold and italic, and lets the text be selected', () => {
    show(deeper(FACTS))
    const first = screen.getByText('First fact with key phrase.')
    expect(first.props.selectable).toBe(true)
    const spans = first.children as { props: { style: unknown; children: string } }[]
    expect(spans.map((span) => span.props.children)).toEqual(['First fact with ', 'key', ' phrase.'])
    expect(spans[0].props.style).toBeUndefined()
    expect(flat(spans[1].props.style)).toEqual({ fontWeight: '700' })
    const second = screen.getByText('Second fact is here.').children as { props: { style: unknown; children: string } }[]
    expect(flat(second[1].props.style)).toEqual({ fontStyle: 'italic' })
  })

  it('shows a bullet for a "* " at the start of a line and drops a marker that has no partner', () => {
    show(deeper({ status: 'content', insights: ['Points:\n* one\n* two', 'A **broken phrase'] }))
    expect(screen.getByText('Points:\n• one\n• two')).toBeTruthy()
    expect(screen.getByText('A broken phrase')).toBeTruthy()
  })

  it('draws a card in the surface colour with a small accent badge', () => {
    show(deeper(FACTS))
    expect(styleOf('insight-1')).toMatchObject({ backgroundColor: LIGHT_PALETTE.surfaceAlt, borderRadius: 14, padding: 12, marginBottom: 10 })
    expect(styleOf('insight-badge-1')).toMatchObject({ width: 24, height: 24, borderRadius: 8, backgroundColor: LIGHT_PALETTE.accentSoft })
    expect(flat(screen.getByText('1').props.style)).toMatchObject({ fontSize: 11, color: LIGHT_PALETTE.accentText })
  })

  it('keeps the title bar, the languages and the note where they are, and scrolls the facts', () => {
    show(deeper(FACTS))
    const scroll = screen.UNSAFE_getByType(ScrollView)
    const inside = within(scroll)
    expect(inside.getByText('First fact with key phrase.')).toBeTruthy()
    expect(inside.queryByText(en.deeper_note)).toBeNull()
    expect(inside.queryByText(en.go_deeper)).toBeNull()
    expect(inside.queryByLabelText(en.language_hindi)).toBeNull()
    expect(inside.queryByTestId('sheet-close')).toBeNull()
  })
})

describe('Go deeper when it could not', () => {
  it('says so and offers to try again', () => {
    show(deeper({ status: 'error' }))
    expect(screen.getByText(en.deeper_error)).toBeTruthy()
    expect(screen.getByText(en.deeper_error).props.accessibilityLiveRegion).toBe('polite')
    expect(screen.queryByText(en.deeper_loading)).toBeNull()
    fireEvent.press(screen.getByLabelText(en.retry))
    expect(calls).toEqual([['retry']])
  })

  it('says the reason it is given', () => {
    show(deeper({ status: 'error', message: 'network_error' }))
    expect(screen.getByText(en.network_error)).toBeTruthy()
  })

  it('keeps the way to the other language open', () => {
    show(deeper({ status: 'error' }))
    fireEvent.press(screen.getByLabelText(en.language_hindi))
    expect(calls).toEqual([['language', 'hi']])
  })
})

describe('the two languages of Go deeper', () => {
  it('asks for the other language when its chip is pressed, and for nothing when the chosen one is', () => {
    show(deeper(FACTS))
    fireEvent.press(screen.getByLabelText(en.language_english))
    expect(calls).toEqual([])
    fireEvent.press(screen.getByLabelText(en.language_hindi))
    expect(calls).toEqual([['language', 'hi']])
  })

  it('marks the chip of the language the facts are in', () => {
    show(deeper(FACTS, { language: 'hi' }))
    expect(screen.getByLabelText(en.language_hindi)).toBeSelected()
    expect(screen.getByLabelText(en.language_english)).not.toBeSelected()
    fireEvent.press(screen.getByLabelText(en.language_hindi))
    expect(calls).toEqual([])
    fireEvent.press(screen.getByLabelText(en.language_english))
    expect(calls).toEqual([['language', 'en']])
  })
})

describe('closing Go deeper', () => {
  it('closes from its cross and a tap outside', () => {
    show(deeper(FACTS))
    fireEvent.press(screen.getByTestId('sheet-close'))
    fireEvent.press(screen.getByTestId('scrim'))
    expect(calls).toEqual([['close'], ['close']])
    expect(screen.getByTestId('sheet-close').props.accessibilityLabel).toBe(en.close)
  })

  it('closes from the back button', () => {
    const back = backButton()
    show(deeper(FACTS))
    expect(back.press()).toBe(true)
    expect(calls).toEqual([['close']])
    back.restore()
  })

  it('draws nothing once it is closed', () => {
    const { rerender } = show(deeper(FACTS))
    rerender(wrap(deeper(FACTS, { visible: false })))
    expect(screen.queryByText('Third fact.')).toBeNull()
  })
})

describe('Go deeper in Hindi and in the dark', () => {
  it('has every text of the sheet in Hindi', () => {
    show(deeper({ status: 'loading' }), { lang: 'hi' })
    expect(screen.getByRole('header', { name: hi.go_deeper })).toBeTruthy()
    expect(screen.getByText(hi.deeper_loading)).toBeTruthy()
    expect(screen.getByText(hi.deeper_note)).toBeTruthy()
    expect(screen.getByLabelText(hi.language_english)).toBeTruthy()
    expect(screen.getByLabelText(hi.language_hindi)).toBeTruthy()
    expect(screen.getByTestId('sheet-close').props.accessibilityLabel).toBe(hi.close)
  })

  it('says the failure in Hindi', () => {
    show(deeper({ status: 'error' }), { lang: 'hi' })
    expect(screen.getByText(hi.deeper_error)).toBeTruthy()
    expect(screen.getByLabelText(hi.retry)).toBeTruthy()
  })

  it('shows a long Hindi fact whole, in a card that grows with it', () => {
    show(deeper({ status: 'content', insights: [`**${LONG_HINDI}** ${LONG_HINDI}`, LONG_HINDI] }), { lang: 'hi' })
    expect(screen.getByText(`${LONG_HINDI} ${LONG_HINDI}`)).toBeTruthy()
    expect(within(screen.getByTestId('insight-2')).getByText(LONG_HINDI)).toBeTruthy()
    expect(fixedHeightOffenders()).toEqual([])
    expect(limitedLines()).toEqual([])
    // Its lines are as tall as Hindi needs: 16 sp at 1.35 times the line of the font.
    const line = textStyleOf(LONG_HINDI).lineHeight as number
    expect(line).toBeGreaterThanOrEqual(Math.round(16 * 1.35 * 1.35))
  })

  it('draws in the dark colours', () => {
    show(deeper(FACTS), { mode: 'dark' })
    expect(styleOf('insight-1')).toMatchObject({ backgroundColor: DARK_PALETTE.surfaceAlt })
    expect(styleOf('insight-badge-1')).toMatchObject({ backgroundColor: DARK_PALETTE.accentSoft })
    expect(textStyleOf('Third fact.').color).toBe(DARK_PALETTE.text)
  })
})
