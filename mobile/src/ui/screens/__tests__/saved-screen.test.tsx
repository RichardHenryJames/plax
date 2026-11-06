import { FlatList, ScrollView } from 'react-native'
import { fireEvent, screen } from '@testing-library/react-native'
import { bodyOf, makeStory, type Story } from '../../../data/story'
import { en } from '../../../i18n/en'
import { hi } from '../../../i18n/hi'
import { DARK_PALETTE, LIGHT_PALETTE } from '../../theme'
import { SavedScreen, type SavedScreenProps } from '../SavedScreen'
import { LONG_HINDI, fixedHeightOffenders, limitedLines, show, styleOf } from './helpers'

const STORIES: Story[] = [
  makeStory({ id: 'one', title: 'The first story of the day', content: 'A summary of the first story, long enough to read in a list of saved stories.', source: 'ABC News', section: 'india' }),
  makeStory({ id: 'two', title: 'The second story', content: 'The second story. The same headline, then a longer text after it that says more.', source: '' }),
  makeStory({ id: 'three', title: 'A story that is only its headline', content: 'A story that is only its headline', source: 'The Hindu' }),
]

function saved(overrides: Partial<SavedScreenProps> = {}) {
  return <SavedScreen stories={STORIES} onOpen={jest.fn()} onRemove={jest.fn()} onClear={jest.fn()} {...overrides} />
}

describe('the saved stories', () => {
  it('shows a card for each story: its source, its headline and the start of its text', () => {
    show(saved())
    expect(screen.getByRole('header', { name: en.saved })).toBeTruthy()
    expect(screen.getByText('ABC News')).toBeTruthy()
    expect(screen.getByText('The first story of the day')).toBeTruthy()
    expect(screen.getByText('A summary of the first story, long enough to read in a list of saved stories.')).toBeTruthy()
    expect(screen.getByText('The Hindu')).toBeTruthy()
  })

  it('says "Source not listed" for a story with no source, and leaves the text out when the story is only its headline', () => {
    show(saved())
    expect(screen.getByText(en.source_unknown)).toBeTruthy()
    // The headline repeated as the text is not shown twice (the same rule as on a story's page).
    expect(bodyOf(STORIES[2])).toBe('')
    expect(screen.getAllByText('A story that is only its headline')).toHaveLength(1)
    // A text that begins with the headline is shown without it.
    expect(screen.getByText('The same headline, then a longer text after it that says more.')).toBeTruthy()
  })

  it('opens a story where it stands in the list', () => {
    const onOpen = jest.fn()
    show(saved({ onOpen }))
    fireEvent.press(screen.getByTestId('saved-open-two'))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(STORIES[1], 1)
    fireEvent.press(screen.getByText('The first story of the day'))
    expect(onOpen).toHaveBeenLastCalledWith(STORIES[0], 0)
  })

  it('takes a story off the saved ones from its bookmark, which is read as "Remove saved story" and names the story', () => {
    const onRemove = jest.fn()
    show(saved({ onRemove }))
    const buttons = screen.getAllByLabelText(en.unsave_description)
    expect(buttons).toHaveLength(3)
    expect(screen.getByTestId('saved-remove-three').props.accessibilityHint).toBe('A story that is only its headline')
    fireEvent.press(screen.getByTestId('saved-remove-three'))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith(STORIES[2])
  })

  it('cannot change the saved stories while they are being read or written', () => {
    const onRemove = jest.fn()
    show(saved({ onRemove, busy: true }))
    expect(screen.getByTestId('saved-remove-one')).toBeDisabled()
    fireEvent.press(screen.getByTestId('saved-remove-one'))
    expect(onRemove).not.toHaveBeenCalled()
    expect(styleOf('saved-remove-one').opacity).toBe(0.5)
    // Reading them is still possible.
    expect(screen.getByTestId('saved-open-one')).toBeEnabled()
  })

  it('is not busy by default', () => {
    show(saved())
    expect(screen.getByTestId('saved-remove-one')).toBeEnabled()
    expect(styleOf('saved-remove-one').opacity).toBe(1)
  })

  it('ends with Clear saved stories, which the host asks about first', () => {
    const onClear = jest.fn()
    show(saved({ onClear }))
    fireEvent.press(screen.getByLabelText(en.clear_saved))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('draws a card as the cards of the topics are drawn: a surface with a border and rounded corners', () => {
    show(saved())
    expect(styleOf('saved-one')).toMatchObject({ backgroundColor: LIGHT_PALETTE.surface, borderColor: LIGHT_PALETTE.border, borderWidth: 1, borderRadius: 20 })
  })
})

describe('Saved with nothing saved', () => {
  it('is the page of the native app: a bookmark, "Keep the good reads." and how to save', () => {
    show(saved({ stories: [] }))
    expect(screen.getByRole('header', { name: 'Keep the good reads.' })).toBeTruthy()
    expect(screen.getByText('Tap the bookmark on a story to read it here later, even offline.')).toBeTruthy()
    // There is nothing to try, so no button.
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByLabelText(en.clear_saved)).toBeNull()
    expect(screen.getByTestId('saved-empty')).toBeTruthy()
  })

  it('has the menu button in the corner', () => {
    const onMenu = jest.fn()
    show(saved({ stories: [], onMenu }))
    fireEvent.press(screen.getByLabelText(en.menu))
    expect(onMenu).toHaveBeenCalledTimes(1)
  })
})

describe('the saved stories in Hindi and in the dark', () => {
  it('has every text in Hindi', () => {
    show(saved(), { lang: 'hi' })
    expect(screen.getByRole('header', { name: hi.saved })).toBeTruthy()
    expect(screen.getByText(hi.source_unknown)).toBeTruthy()
    expect(screen.getAllByLabelText(hi.unsave_description)).toHaveLength(3)
    expect(screen.getByLabelText(hi.clear_saved)).toBeTruthy()
  })

  it('has the empty page in Hindi', () => {
    show(saved({ stories: [] }), { lang: 'hi' })
    expect(screen.getByText(hi.empty_saved)).toBeTruthy()
    expect(screen.getByText(hi.empty_saved_detail)).toBeTruthy()
  })

  it('shows a long Hindi headline whole, and cuts only the start of the text to three lines', () => {
    const long = makeStory({ id: 'long', title: LONG_HINDI, content: `${LONG_HINDI} ${LONG_HINDI}`, source: 'नवभारत टाइम्स' })
    show(saved({ stories: [long] }), { lang: 'hi' })
    expect(screen.getByText(LONG_HINDI)).toBeTruthy()
    expect(fixedHeightOffenders()).toEqual([])
    expect(limitedLines()).toEqual([{ text: expect.stringContaining(LONG_HINDI), lines: 3 }])
  })

  it('draws in the dark colours', () => {
    show(saved(), { mode: 'dark' })
    expect(styleOf('saved-one')).toMatchObject({ backgroundColor: DARK_PALETTE.surface, borderColor: DARK_PALETTE.border })
    expect(styleOf('saved-screen').backgroundColor).toBe(DARK_PALETTE.bg)
  })
})

describe('the saved stories between the system bars', () => {
  it('scroll under them, with the phone\'s insets as padding and the top clear of the menu button', () => {
    show(saved({ onMenu: jest.fn() }), { insets: { top: 30, bottom: 20, left: 4, right: 6 } })
    const list = screen.UNSAFE_getByType(FlatList)
    expect(list.props.contentContainerStyle).toEqual({ paddingTop: 94, paddingBottom: 44, paddingLeft: 24, paddingRight: 26 })
    expect(screen.UNSAFE_getByType(ScrollView)).toBeTruthy()
    expect(styleOf('corner-menu')).toMatchObject({ top: 34, left: 16 })
  })

  it('has no menu button unless it is given the way to the menu', () => {
    show(saved())
    expect(screen.queryByTestId('menu-button')).toBeNull()
  })
})
