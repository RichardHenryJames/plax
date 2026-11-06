import { ScrollView } from 'react-native'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { BUILT_IN_TOPICS, topicLabel, type Topic } from '../../../data/topic'
import { translate } from '../../../i18n'
import { en } from '../../../i18n/en'
import { hi } from '../../../i18n/hi'
import { DARK_PALETTE, LIGHT_PALETTE } from '../../theme'
import { TopicsScreen, type TopicsScreenProps } from '../TopicsScreen'
import { fixedHeightOffenders, limitedLines, lineHeightOf, show, styleOf } from './helpers'

const byId = (id: string): Topic => BUILT_IN_TOPICS.find((topic) => topic.id === id) as Topic

function topics(overrides: Partial<TopicsScreenProps> = {}) {
  return (
    <TopicsScreen
      topics={BUILT_IN_TOPICS}
      currentTopicId="news"
      interests={[]}
      onSelectTopic={jest.fn()}
      onChooseInterests={jest.fn()}
      {...overrides}
    />
  )
}

describe('the Topics screen in English', () => {
  it('has the heading, what it is for, the For you card and every topic', () => {
    show(topics())
    expect(screen.getByRole('header', { name: en.choose_topic })).toBeTruthy()
    expect(screen.getByText(en.choose_topic_detail)).toBeTruthy()
    for (const topic of BUILT_IN_TOPICS) {
      expect(screen.getByLabelText(topic.en)).toBeTruthy()
      expect(screen.getByText(topic.en)).toBeTruthy()
      // The emoji is decoration: a screen reader reads the name.
      expect(screen.getByText(topic.emoji, { includeHiddenElements: true })).toBeTruthy()
    }
    expect(BUILT_IN_TOPICS).toHaveLength(18)
  })

  it('marks the topic of the feed "Reading now", and only that one', () => {
    show(topics({ currentTopicId: 'science' }))
    expect(screen.getAllByText(en.topic_current)).toHaveLength(1)
    expect(screen.getByTestId('topic-science')).toBeSelected()
    expect(screen.getByTestId('topic-news')).not.toBeSelected()
    // The mark is in the card that is marked.
    expect(screen.getByTestId('topic-science')).toHaveTextContent(en.topic_current, { exact: false })
    expect(screen.getByTestId('topic-news')).not.toHaveTextContent(en.topic_current, { exact: false })
  })

  it('draws the topic of the feed in the accent colours and the others plain', () => {
    show(topics({ currentTopicId: 'space' }))
    expect(styleOf('topic-space')).toMatchObject({ backgroundColor: LIGHT_PALETTE.accentSoft, borderColor: LIGHT_PALETTE.accent, borderRadius: 20, borderWidth: 1 })
    expect(styleOf('topic-news')).toMatchObject({ backgroundColor: LIGHT_PALETTE.surface, borderColor: LIGHT_PALETTE.border, borderRadius: 20, borderWidth: 1 })
  })

  it('shows no mark when the feed is on a topic that is not offered', () => {
    show(topics({ currentTopicId: 'gone' }))
    expect(screen.queryByText(en.topic_current)).toBeNull()
  })

  it('takes a press on a card as the choice of that topic', () => {
    const onSelectTopic = jest.fn()
    show(topics({ onSelectTopic }))
    fireEvent.press(screen.getByLabelText(en.topic_history))
    expect(onSelectTopic).toHaveBeenCalledTimes(1)
    expect(onSelectTopic).toHaveBeenCalledWith(byId('history'))
    fireEvent.press(screen.getByTestId('topic-news'))
    expect(onSelectTopic).toHaveBeenLastCalledWith(byId('news'))
  })

  it('offers the topics two to a row, with a plain space where the last row has one topic', () => {
    show(topics({ topics: BUILT_IN_TOPICS.slice(0, 3) }))
    expect(screen.getAllByRole('button').filter((button) => String(button.props.testID).startsWith('topic-'))).toHaveLength(3)
    // The first column keeps a 10 dp gap, the second does not; every card is at least 96 dp tall and grows with its text.
    expect(styleOf('topic-news')).toMatchObject({ marginRight: 10, marginBottom: 10, minHeight: 96, flex: 1 })
    expect(styleOf('topic-stocks')).toMatchObject({ marginRight: 0, marginBottom: 10, minHeight: 96 })
    expect(styleOf('topic-science')).toMatchObject({ marginRight: 10 })
  })
})

describe('the For you card', () => {
  it('invites a choice when no topics are chosen', () => {
    const onChooseInterests = jest.fn()
    show(topics({ onChooseInterests }))
    expect(screen.getByText(en.interests_card_empty)).toBeTruthy()
    expect(screen.getByText(en.interests_card_detail)).toBeTruthy()
    expect(screen.getByText(en.interests_choose)).toBeTruthy()
    expect(screen.getByLabelText(`${en.interests_card_empty}, ${en.interests_card_detail}`)).toBeTruthy()
    fireEvent.press(screen.getByTestId('interests-card'))
    expect(onChooseInterests).toHaveBeenCalledTimes(1)
  })

  it('names one or two chosen topics and offers to edit them', () => {
    show(topics({ interests: ['science'] }))
    const card = within(screen.getByTestId('interests-card'))
    expect(card.getByText(en.interests_title)).toBeTruthy()
    expect(card.getByText(en.topic_science)).toBeTruthy()
    expect(card.getByText(en.interests_edit)).toBeTruthy()
    expect(screen.queryByText(en.interests_choose)).toBeNull()
    expect(screen.getByLabelText(`${en.interests_title}, ${en.topic_science}`)).toBeTruthy()
  })

  it('names two chosen topics together', () => {
    show(topics({ interests: new Set(['science', 'space']) }))
    expect(screen.getByText(`${en.topic_science}, ${en.topic_space}`)).toBeTruthy()
  })

  it('names the first two of more, and says how many more there are', () => {
    show(topics({ interests: new Set(['art', 'books', 'math', 'space']) }))
    expect(screen.getByText('Art & Design, Books and 2 more')).toBeTruthy()
    expect(screen.getByLabelText(`${en.interests_title}, Art & Design, Books and 2 more`)).toBeTruthy()
  })

  it('leaves out a chosen topic that is not offered any more', () => {
    show(topics({ interests: ['gone', 'science', 'space'] }))
    expect(screen.getByText(`${en.topic_science}, ${en.topic_space}`)).toBeTruthy()
  })

  it('names the topics in the reader\'s language, and in English when a topic has no name in it', () => {
    const listed: Topic = { id: 'cricket', emoji: '🏏', en: 'Cricket', hi: '' }
    show(topics({ topics: [...BUILT_IN_TOPICS, listed], interests: ['cricket', 'science'] }), { lang: 'hi' })
    expect(screen.getByText(`Cricket, ${hi.topic_science}`)).toBeTruthy()
    expect(topicLabel(listed, 'hi')).toBe('Cricket')
    expect(screen.getByLabelText('Cricket')).toBeTruthy()
  })
})

describe('the Topics screen in Hindi', () => {
  it('has every text in Hindi', () => {
    show(topics({ currentTopicId: 'books', interests: ['art', 'books', 'math'] }), { lang: 'hi' })
    expect(screen.getByRole('header', { name: hi.choose_topic })).toBeTruthy()
    expect(screen.getByText(hi.choose_topic_detail)).toBeTruthy()
    expect(screen.getByText(hi.interests_title)).toBeTruthy()
    expect(screen.getByText(hi.interests_edit)).toBeTruthy()
    expect(screen.getByText(hi.topic_current)).toBeTruthy()
    expect(screen.getByText(translate('hi', 'interests_summary', `${hi.topic_art}, ${hi.topic_books}`, 1))).toBeTruthy()
    for (const topic of BUILT_IN_TOPICS) expect(screen.getByLabelText(topic.hi)).toBeTruthy()
  })

  it('gives its text room to be taller: no text in a box of a fixed height, and a name is cut to one line only on a card', () => {
    show(topics({ currentTopicId: 'books', interests: ['art', 'books', 'math'] }), { lang: 'hi' })
    expect(fixedHeightOffenders()).toEqual([])
    const limited = limitedLines()
    expect(limited).toHaveLength(BUILT_IN_TOPICS.length)
    expect(limited.every((entry) => entry.lines === 1)).toBe(true)
    // The paragraphs have the taller line of Hindi.
    expect(lineHeightOf(hi.choose_topic_detail)).toEqual(expect.any(Number))
  })

  it('has a longer line than English for the same text size', () => {
    const { unmount } = show(topics())
    const english = lineHeightOf(en.choose_topic_detail) as number
    unmount()
    show(topics(), { lang: 'hi' })
    const hindi = lineHeightOf(hi.choose_topic_detail) as number
    expect(hindi).toBeGreaterThan(english)
  })
})

describe('the Topics screen in the dark theme', () => {
  it('draws the cards and the card for For you in the dark colours', () => {
    show(topics({ currentTopicId: 'space' }), { mode: 'dark' })
    expect(styleOf('topic-space')).toMatchObject({ backgroundColor: DARK_PALETTE.accentSoft, borderColor: DARK_PALETTE.accent })
    expect(styleOf('topic-news')).toMatchObject({ backgroundColor: DARK_PALETTE.surface, borderColor: DARK_PALETTE.border })
    expect(styleOf('interests-card')).toMatchObject({ backgroundColor: DARK_PALETTE.accentSoft, borderColor: DARK_PALETTE.border })
    expect(styleOf('topics-screen')).toMatchObject({ backgroundColor: DARK_PALETTE.bg })
  })
})

describe('the Topics screen between the system bars', () => {
  it('scrolls under them: its padding clears the status bar, the menu button and the navigation bar', () => {
    show(topics(), { insets: { top: 30, bottom: 20, left: 4, right: 6 } })
    const scroll = screen.UNSAFE_getByType(ScrollView)
    expect(scroll.props.contentContainerStyle).toEqual({ paddingTop: 30 + 64, paddingBottom: 20 + 24, paddingLeft: 4 + 20, paddingRight: 6 + 20 })
  })

  it('has a menu button in the corner only when it is given the way to the menu', () => {
    const onMenu = jest.fn()
    const { unmount } = show(topics())
    expect(screen.queryByTestId('menu-button')).toBeNull()
    unmount()
    show(topics({ onMenu }), { insets: { top: 30, left: 4 } })
    fireEvent.press(screen.getByLabelText(en.menu))
    expect(onMenu).toHaveBeenCalledTimes(1)
    // 12 dp in and 4 dp down from the corner of the screen between the bars.
    expect(styleOf('corner-menu')).toMatchObject({ position: 'absolute', top: 34, left: 16 })
  })
})
