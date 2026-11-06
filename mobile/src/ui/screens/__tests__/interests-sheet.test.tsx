import { ScrollView } from 'react-native'
import { fireEvent, screen } from '@testing-library/react-native'
import { BUILT_IN_TOPICS } from '../../../data/topic'
import { translate } from '../../../i18n'
import { en } from '../../../i18n/en'
import { hi } from '../../../i18n/hi'
import { DARK_PALETTE, LIGHT_PALETTE } from '../../theme'
import { InterestsSheet, type InterestsSheetProps } from '../InterestsSheet'
import { backButton, fixedHeightOffenders, limitedLines, resetWindow, setWindow, show, styleOf, wrap } from './helpers'

let calls: unknown[][] = []

function sheet(overrides: Partial<InterestsSheetProps> = {}) {
  return (
    <InterestsSheet
      visible
      topics={BUILT_IN_TOPICS}
      selected={[]}
      onSave={(ids) => calls.push(['save', ids])}
      onClose={() => calls.push(['close'])}
      {...overrides}
    />
  )
}

const tile = (id: string) => screen.getByTestId(`interest-${id}`)

beforeEach(() => {
  calls = []
})
afterEach(resetWindow)

describe('the choice of topics', () => {
  it('has a title, what it is for, every topic, and asks for at least one', () => {
    show(sheet())
    expect(screen.getByRole('header', { name: en.interests_title })).toBeTruthy()
    expect(screen.getByText(en.interests_detail)).toBeTruthy()
    for (const topic of BUILT_IN_TOPICS) expect(screen.getByLabelText(topic.en)).toBeTruthy()
    expect(screen.getByText(en.interests_none)).toBeTruthy()
    expect(screen.getByLabelText(en.interests_save)).toBeDisabled()
  })

  it('does not draw when it is not visible', () => {
    show(sheet({ visible: false }))
    expect(screen.queryByTestId('interests-sheet')).toBeNull()
    expect(screen.queryByText(en.interests_title)).toBeNull()
  })

  it('does not save with no topic picked', () => {
    show(sheet())
    fireEvent.press(screen.getByLabelText(en.interests_save))
    expect(calls).toEqual([])
  })

  it('ticks a topic on a press and takes the tick off on the next, counting them as they go', () => {
    show(sheet())
    fireEvent.press(tile('science'))
    expect(tile('science')).toBeSelected()
    expect(screen.getByText('1 selected')).toBeTruthy()
    fireEvent.press(tile('space'))
    fireEvent.press(tile('history'))
    expect(screen.getByText('3 selected')).toBeTruthy()
    fireEvent.press(tile('history'))
    expect(tile('history')).not.toBeSelected()
    expect(screen.getByText('2 selected')).toBeTruthy()
    expect(screen.getByLabelText(en.interests_save)).toBeEnabled()
  })

  it('says "Selected" of a ticked topic to a screen reader, and nothing of the others', () => {
    show(sheet({ selected: ['art'] }))
    expect(tile('art').props.accessibilityValue).toEqual({ text: en.topic_selected })
    expect(tile('books').props.accessibilityValue?.text).toBeUndefined()
    expect(tile('art')).toBeSelected()
    expect(tile('books')).not.toBeSelected()
  })

  it('saves the topics picked, in the fixed order, and then asks to be closed', () => {
    show(sheet())
    fireEvent.press(tile('space'))
    fireEvent.press(tile('science'))
    fireEvent.press(tile('history'))
    fireEvent.press(tile('history'))
    expect(screen.getByText('2 selected')).toBeTruthy()
    fireEvent.press(screen.getByLabelText(en.interests_save))
    expect(calls).toEqual([['save', ['science', 'space']], ['close']])
  })

  it('opens with the topics chosen now, and saves only the ones that are offered', () => {
    show(sheet({ selected: new Set(['gone', 'art', 'books']) }))
    // A topic the website has taken away still counts until the reader saves, as it did in the native sheet.
    expect(screen.getByText('3 selected')).toBeTruthy()
    expect(tile('art')).toBeSelected()
    fireEvent.press(screen.getByLabelText(en.interests_save))
    expect(calls).toEqual([['save', ['art', 'books']], ['close']])
  })

  it('keeps nothing until the reader saves: it starts again from the chosen topics each time it opens', () => {
    const { rerender } = show(sheet({ selected: ['art'] }))
    fireEvent.press(tile('math'))
    expect(screen.getByText('2 selected')).toBeTruthy()
    rerender(wrap(sheet({ selected: ['art'], visible: false })))
    expect(screen.queryByTestId('interests-sheet')).toBeNull()
    rerender(wrap(sheet({ selected: ['art', 'physics'], visible: true })))
    expect(tile('art')).toBeSelected()
    expect(tile('physics')).toBeSelected()
    expect(tile('math')).not.toBeSelected()
    expect(screen.getByText('2 selected')).toBeTruthy()
    expect(calls).toEqual([])
  })

  it('closes from its cross and from a tap outside, without saving', () => {
    show(sheet({ selected: ['art'] }))
    fireEvent.press(screen.getByTestId('sheet-close'))
    fireEvent.press(screen.getByTestId('scrim'))
    expect(calls).toEqual([['close'], ['close']])
    expect(screen.getByTestId('sheet-close').props.accessibilityLabel).toBe(en.close)
  })

  it('closes from the back button, without saving', () => {
    const back = backButton()
    show(sheet({ selected: ['art'] }))
    expect(back.press()).toBe(true)
    expect(calls).toEqual([['close']])
    back.restore()
  })
})

describe('the choice of topics in Hindi and in the dark', () => {
  it('has every text in Hindi', () => {
    show(sheet({ selected: ['art', 'books'] }), { lang: 'hi' })
    expect(screen.getByRole('header', { name: hi.interests_title })).toBeTruthy()
    expect(screen.getByText(hi.interests_detail)).toBeTruthy()
    expect(screen.getByText(translate('hi', 'interests_selected', 2))).toBeTruthy()
    expect(screen.getByLabelText(hi.interests_save)).toBeEnabled()
    expect(tile('art').props.accessibilityValue).toEqual({ text: hi.topic_selected })
    for (const topic of BUILT_IN_TOPICS) expect(screen.getByLabelText(topic.hi)).toBeTruthy()
    expect(screen.getByTestId('sheet-close').props.accessibilityLabel).toBe(hi.close)
  })

  it('says in Hindi that a topic is needed', () => {
    show(sheet(), { lang: 'hi' })
    expect(screen.getByText(hi.interests_none)).toBeTruthy()
  })

  it('has no text in a box of a fixed height but the sheet itself, and cuts only the names of the topics to a line', () => {
    show(sheet({ selected: ['art', 'books'] }), { lang: 'hi' })
    expect(fixedHeightOffenders(['interests-sheet-frame'])).toEqual([])
    expect(limitedLines()).toHaveLength(BUILT_IN_TOPICS.length)
    expect(limitedLines().every((entry) => entry.lines === 1)).toBe(true)
  })

  it('draws the ticked and the plain topics in the colours of each theme', () => {
    const { unmount } = show(sheet({ selected: ['art'] }))
    expect(styleOf('interest-art')).toMatchObject({ backgroundColor: LIGHT_PALETTE.accentSoft, borderColor: LIGHT_PALETTE.accent, borderRadius: 16 })
    expect(styleOf('interest-books')).toMatchObject({ backgroundColor: LIGHT_PALETTE.surface, borderColor: LIGHT_PALETTE.border })
    unmount()
    show(sheet({ selected: ['art'] }), { mode: 'dark' })
    expect(styleOf('interest-art')).toMatchObject({ backgroundColor: DARK_PALETTE.accentSoft, borderColor: DARK_PALETTE.accent })
    expect(styleOf('interest-books')).toMatchObject({ backgroundColor: DARK_PALETTE.surface, borderColor: DARK_PALETTE.border })
  })
})

describe('the room the sheet takes', () => {
  it('is 86% of the window tall, so that the topics scroll in it and the save button is in reach', () => {
    setWindow(360, 800)
    show(sheet())
    expect(styleOf('interests-sheet-frame')).toMatchObject({ height: Math.round(800 * 0.86), flexShrink: 1, paddingLeft: 20, paddingRight: 20, paddingBottom: 16 })
    // Its cards are at least 56 dp tall and grow with their text.
    expect(styleOf('interest-art')).toMatchObject({ minHeight: 56, borderWidth: 1 })
  })

  it('keeps the count and the save button outside what scrolls', () => {
    show(sheet())
    const scroll = screen.UNSAFE_getByType(ScrollView)
    expect(scroll.findAll((node: { props: { testID?: string } }) => node.props.testID === 'interests-save')).toHaveLength(0)
    expect(scroll.findAll((node: { props: { testID?: string } }) => node.props.testID === 'interests-count')).toHaveLength(0)
    expect(screen.getByTestId('interests-count')).toBeTruthy()
    expect(screen.getByTestId('interests-save')).toBeTruthy()
  })
})
