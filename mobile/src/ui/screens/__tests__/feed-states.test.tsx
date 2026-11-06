import { ScrollView, StyleSheet } from 'react-native'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { en } from '../../../i18n/en'
import { hi } from '../../../i18n/hi'
import { translatePlural, type StringKey } from '../../../i18n'
import { DARK_PALETTE, LIGHT_PALETTE } from '../../theme'
import {
  CaughtUpPage,
  EmptyPanel,
  FeedBanner,
  FeedEmpty,
  FeedLoading,
  NewStoriesPill,
  RefreshSpinner,
  describeEmpty,
  type EmptyInput,
  type FeedEmptyProps,
} from '../FeedStates'
import { fixedHeightOffenders, quietMotion, resetWindow, setWindow, show, styleOf, wrap } from './helpers'

beforeEach(quietMotion)
afterEach(resetWindow)

const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>

describe('the line over the stories', () => {
  it('is not there when there is nothing to say', () => {
    show(<FeedBanner banner={null} onRetry={jest.fn()} />)
    expect(screen.queryByTestId('feed-banner')).toBeNull()
  })

  it('says that more stories are on their way', () => {
    const onRetry = jest.fn()
    show(<FeedBanner banner={{ key: 'loading_more', retryable: false }} onRetry={onRetry} />)
    expect(screen.getByText(en.loading_more)).toBeTruthy()
    // It is a line of text, not a button, and a screen reader says it when it appears.
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(en.loading_more).props.accessibilityLiveRegion).toBe('polite')
    fireEvent.press(screen.getByTestId('feed-banner'))
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('says that the reader has reached the end', () => {
    show(<FeedBanner banner={{ key: 'end_feed', retryable: false }} onRetry={jest.fn()} />)
    expect(screen.getByText('You are caught up. Refresh for new stories.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('names a failure to read the saved stories, which cannot be retried here', () => {
    show(<FeedBanner banner={{ key: 'storage_error', retryable: false }} onRetry={jest.fn()} />)
    expect(screen.getByText(en.storage_error)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says "offline" to a reader who is looking at the last stories, and tries again when it is pressed', () => {
    const onRetry = jest.fn()
    show(<FeedBanner banner={{ key: 'offline_cached', retryable: true }} onRetry={onRetry} />)
    expect(screen.getByText('You are offline. Showing the last stories we loaded. Tap to retry.')).toBeTruthy()
    const button = screen.getByRole('button', { name: `${en.offline_cached} ${en.retry_more}` })
    expect(button.props.accessibilityLiveRegion).toBe('polite')
    fireEvent.press(button)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('tells every failure the same way', () => {
    const onRetry = jest.fn()
    for (const key of ['rate_error', 'service_error', 'invalid_feed'] as StringKey[]) {
      const { unmount } = show(<FeedBanner banner={{ key, retryable: true }} onRetry={onRetry} />)
      expect(screen.getByText(en[key])).toBeTruthy()
      fireEvent.press(screen.getByLabelText(`${en[key]} ${en.retry_more}`))
      unmount()
    }
    expect(onRetry).toHaveBeenCalledTimes(3)
  })

  it('is small accent text, as the native app drew it, and clear of the status bar', () => {
    show(<FeedBanner banner={{ key: 'loading_more', retryable: false }} onRetry={jest.fn()} />, { insets: { top: 28, left: 3, right: 5 } })
    expect(styleOf('feed-banner')).toMatchObject({ paddingLeft: 19, paddingRight: 21, paddingTop: 34, paddingBottom: 6 })
    const text = flat(screen.getByText(en.loading_more).props.style)
    expect(text).toMatchObject({ fontSize: 12, color: LIGHT_PALETTE.accentText })
  })

  it('is in Hindi and in the dark colours', () => {
    const { unmount } = show(<FeedBanner banner={{ key: 'offline_cached', retryable: true }} onRetry={jest.fn()} />, { lang: 'hi', mode: 'dark' })
    expect(screen.getByText(hi.offline_cached)).toBeTruthy()
    expect(screen.getByLabelText(`${hi.offline_cached} ${hi.retry_more}`)).toBeTruthy()
    expect(flat(screen.getByText(hi.offline_cached).props.style).color).toBe(DARK_PALETTE.accentText)
    unmount()
    show(<FeedBanner banner={{ key: 'end_feed', retryable: false }} onRetry={jest.fn()} />, { lang: 'hi' })
    expect(screen.getByText(hi.end_feed)).toBeTruthy()
    expect(fixedHeightOffenders()).toEqual([])
  })
})

describe('the sign that stories are being looked for', () => {
  it('is a small spinner, announced as refreshing', () => {
    show(<RefreshSpinner visible />)
    const spinner = screen.getByRole('progressbar', { name: en.refreshing })
    expect(spinner).toBeBusy()
    expect(styleOf('refresh-spinner')).toMatchObject({ width: 40, height: 40, borderRadius: 20, position: 'absolute', top: 12, right: 16 })
  })

  it('is not there when nothing is being looked for', () => {
    show(<RefreshSpinner visible={false} />)
    expect(screen.queryByTestId('refresh-spinner')).toBeNull()
  })

  it('stands in the top-right corner between the system bars, in Hindi too', () => {
    show(<RefreshSpinner visible />, { lang: 'hi', insets: { top: 30, right: 8 } })
    expect(screen.getByRole('progressbar', { name: hi.refreshing })).toBeTruthy()
    expect(styleOf('refresh-spinner')).toMatchObject({ top: 42, right: 24 })
  })
})

describe('the "New stories" pill', () => {
  it('is a button that shows the new stories', () => {
    const onPress = jest.fn()
    show(<NewStoriesPill visible onPress={onPress} />)
    expect(screen.getByText(en.new_stories)).toBeTruthy()
    const pill = screen.getByRole('button', { name: en.new_stories_description })
    expect(pill.props.accessibilityLiveRegion).toBe('polite')
    fireEvent.press(pill)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('is not there when there are no new stories', () => {
    show(<NewStoriesPill visible={false} onPress={jest.fn()} />)
    expect(screen.queryByTestId('new-stories-pill')).toBeNull()
  })

  it('is an accent pill with dark text and a shadow, 12 dp under the top of the screen between the bars', () => {
    show(<NewStoriesPill visible onPress={jest.fn()} />, { insets: { top: 20 } })
    expect(styleOf('new-stories-pill')).toMatchObject({ backgroundColor: LIGHT_PALETTE.accent, borderRadius: 24, elevation: 6, paddingLeft: 14, paddingRight: 18, paddingVertical: 10 })
    expect(flat(screen.getByText(en.new_stories).props.style)).toMatchObject({ fontSize: 13, color: LIGHT_PALETTE.onAccent })
    expect(styleOf('new-stories-slot')).toMatchObject({ top: 32, alignItems: 'center', position: 'absolute' })
  })

  it('is in Hindi and in the dark theme', () => {
    show(<NewStoriesPill visible onPress={jest.fn()} />, { lang: 'hi', mode: 'dark' })
    expect(screen.getByText(hi.new_stories)).toBeTruthy()
    expect(screen.getByLabelText(hi.new_stories_description)).toBeTruthy()
    expect(styleOf('new-stories-pill').backgroundColor).toBe(DARK_PALETTE.accent)
    expect(fixedHeightOffenders()).toEqual([])
  })
})

describe('the page while the first stories are on their way', () => {
  it('shows blocks shaped like a story, announced as "Finding your next read…"', () => {
    show(<FeedLoading />)
    expect(screen.getByRole('progressbar', { name: en.loading })).toBeBusy()
    expect(screen.getByTestId('skeleton', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('menu-button')).toBeNull()
  })

  it('has the menu button in the corner when it is given the way to the menu', () => {
    const onMenu = jest.fn()
    show(<FeedLoading onMenu={onMenu} />)
    fireEvent.press(screen.getByLabelText(en.menu))
    expect(onMenu).toHaveBeenCalledTimes(1)
  })

  it('uses the shorter card on a short screen', () => {
    const picture = () => flat((screen.getByTestId('skeleton', { includeHiddenElements: true }).children[0] as { props: { style: unknown } }).props.style).height
    setWindow(360, 800)
    const { unmount } = show(<FeedLoading />)
    expect(picture()).toBe(210)
    unmount()
    setWindow(360, 640)
    show(<FeedLoading />)
    expect(picture()).toBe(150)
  })

  it('is in Hindi, in the dark theme, and below the status bar', () => {
    show(<FeedLoading />, { lang: 'hi', mode: 'dark', insets: { top: 30, left: 2, right: 3 } })
    expect(screen.getByRole('progressbar', { name: hi.loading })).toBeTruthy()
    expect(styleOf('feed-loading').backgroundColor).toBe(DARK_PALETTE.bg)
    expect(screen.getByRole('progressbar', { name: hi.loading }).props.style).toMatchObject({ paddingTop: 30, paddingLeft: 2, paddingRight: 3 })
  })
})

describe('what an empty page is for', () => {
  const input = (overrides: Partial<EmptyInput> = {}): EmptyInput => ({ screen: 'feed', feedError: null, section: '', exhausted: false, hasInterests: false, signedIn: false, ...overrides })

  it('is Saved with nothing saved: a bookmark, "Keep the good reads." and nothing to try', () => {
    expect(describeEmpty(input({ screen: 'saved' }))).toEqual({
      icon: 'bookmark',
      title: 'empty_saved',
      detail: 'empty_saved_detail',
      button: null,
      buttonEnabled: true,
      action: 'refresh',
      accountLink: false,
    })
  })

  it('is For you with no topics: a star, the invitation, "Choose topics", and a way in for a reader who has an account', () => {
    const description = describeEmpty(input({ screen: 'forYou' }))
    expect(description).toMatchObject({ icon: 'star', title: 'for_you_title', detail: 'for_you_detail', button: 'choose_interests', buttonEnabled: true, action: 'chooseInterests', accountLink: true })
    expect(describeEmpty(input({ screen: 'forYou', signedIn: true })).accountLink).toBe(false)
    // Even a failure and a feed that has run out do not take the invitation away.
    expect(describeEmpty(input({ screen: 'forYou', feedError: 'network_error', exhausted: true }))).toMatchObject({ icon: 'star', title: 'for_you_title', button: 'choose_interests', buttonEnabled: true, action: 'chooseInterests' })
  })

  it('is For you with topics and no stories: an ordinary empty feed', () => {
    expect(describeEmpty(input({ screen: 'forYou', hasInterests: true }))).toMatchObject({ icon: 'empty', title: 'empty_feed', detail: 'empty_feed_detail', button: 'retry', action: 'refresh', accountLink: false })
  })

  it('is a feed that came back empty: "No stories right now", and Try again looks for stories', () => {
    expect(describeEmpty(input())).toMatchObject({ icon: 'empty', title: 'empty_feed', detail: 'empty_feed_detail', button: 'retry', buttonEnabled: true, action: 'refresh' })
  })

  it('is a feed that could not be loaded: a cloud, the reason, and Try again', () => {
    for (const key of ['network_error', 'rate_error', 'service_error', 'invalid_feed'] as StringKey[]) {
      expect(describeEmpty(input({ feedError: key }))).toMatchObject({ icon: 'cloud_off', title: 'empty_feed', detail: key, button: 'retry', buttonEnabled: true, action: 'retry' })
    }
  })

  it('is a section with no stories: "Load more stories", which cannot be pressed when the feed has run out', () => {
    expect(describeEmpty(input({ section: 'tech' }))).toMatchObject({ icon: 'empty', title: 'empty_section', detail: 'empty_feed_detail', button: 'load_more', buttonEnabled: true, action: 'more' })
    expect(describeEmpty(input({ section: 'tech', exhausted: true }))).toMatchObject({ button: 'load_more', buttonEnabled: false, action: 'more' })
  })

  it('is a section that could not be loaded: Try again, which can always be pressed', () => {
    expect(describeEmpty(input({ section: 'tech', feedError: 'service_error', exhausted: true }))).toMatchObject({
      icon: 'cloud_off',
      title: 'empty_section',
      detail: 'service_error',
      button: 'retry',
      buttonEnabled: true,
      action: 'retry',
    })
  })

  it('can be pressed whenever there is no section, whatever the feed has run out of', () => {
    expect(describeEmpty(input({ exhausted: true })).buttonEnabled).toBe(true)
  })
})

describe('the empty pages on the screen', () => {
  function empty(overrides: Partial<FeedEmptyProps> = {}) {
    const press = { chooseInterests: jest.fn(), retry: jest.fn(), refresh: jest.fn(), more: jest.fn(), account: jest.fn() }
    const node = (
      <FeedEmpty
        screen="feed"
        feedError={null}
        section=""
        exhausted={false}
        hasInterests={false}
        signedIn={false}
        onChooseInterests={press.chooseInterests}
        onRetry={press.retry}
        onRefresh={press.refresh}
        onMore={press.more}
        onAccount={press.account}
        {...overrides}
      />
    )
    return { press, node }
  }

  it('Saved with nothing saved has a heading and a few words, and no button', () => {
    show(empty({ screen: 'saved' }).node)
    expect(screen.getByRole('header', { name: en.empty_saved })).toBeTruthy()
    expect(screen.getByText(en.empty_saved_detail)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('For you with no topics opens the choice of topics, and offers sign-in to someone who has an account', () => {
    const { press, node } = empty({ screen: 'forYou' })
    show(node)
    expect(screen.getByRole('header', { name: en.for_you_title })).toBeTruthy()
    expect(screen.getByText(en.for_you_detail)).toBeTruthy()
    fireEvent.press(screen.getByLabelText(en.choose_interests))
    expect(press.chooseInterests).toHaveBeenCalledTimes(1)
    fireEvent.press(screen.getByLabelText(en.account_link))
    expect(press.account).toHaveBeenCalledTimes(1)
    expect(Object.values(press).filter((fn) => fn.mock.calls.length > 0)).toHaveLength(2)
  })

  it('For you does not offer sign-in to a reader who is signed in', () => {
    show(empty({ screen: 'forYou', signedIn: true }).node)
    expect(screen.queryByLabelText(en.account_link)).toBeNull()
    expect(screen.getByLabelText(en.choose_interests)).toBeTruthy()
  })

  it('a feed that came back empty looks for stories again', () => {
    const { press, node } = empty()
    show(node)
    expect(screen.getByRole('header', { name: en.empty_feed })).toBeTruthy()
    expect(screen.getByText(en.empty_feed_detail)).toBeTruthy()
    fireEvent.press(screen.getByLabelText(en.retry))
    expect(press.refresh).toHaveBeenCalledTimes(1)
    expect(press.retry).not.toHaveBeenCalled()
  })

  it('a feed that could not be loaded says why and tries again', () => {
    const { press, node } = empty({ feedError: 'network_error' })
    show(node)
    expect(screen.getByText(en.network_error)).toBeTruthy()
    fireEvent.press(screen.getByLabelText(en.retry))
    expect(press.retry).toHaveBeenCalledTimes(1)
    expect(press.refresh).not.toHaveBeenCalled()
  })

  it('a section with no stories loads more, until the feed has run out', () => {
    const { press, node } = empty({ section: 'world' })
    const { unmount } = show(node)
    expect(screen.getByRole('header', { name: en.empty_section })).toBeTruthy()
    fireEvent.press(screen.getByLabelText(en.load_more))
    expect(press.more).toHaveBeenCalledTimes(1)
    unmount()
    const exhausted = empty({ section: 'world', exhausted: true })
    show(exhausted.node)
    expect(screen.getByLabelText(en.load_more)).toBeDisabled()
    fireEvent.press(screen.getByLabelText(en.load_more))
    expect(exhausted.press.more).not.toHaveBeenCalled()
  })

  it('is in Hindi, with every text in Hindi', () => {
    const { unmount } = show(empty({ screen: 'saved' }).node, { lang: 'hi' })
    expect(screen.getByText(hi.empty_saved)).toBeTruthy()
    expect(screen.getByText(hi.empty_saved_detail)).toBeTruthy()
    unmount()
    show(empty({ screen: 'forYou' }).node, { lang: 'hi' })
    expect(screen.getByText(hi.for_you_title)).toBeTruthy()
    expect(screen.getByText(hi.for_you_detail)).toBeTruthy()
    expect(screen.getByLabelText(hi.choose_interests)).toBeTruthy()
    expect(screen.getByLabelText(hi.account_link)).toBeTruthy()
  })

  it('gives its text room to be taller: no box of a fixed height around a text, and a line as tall as Hindi needs', () => {
    show(empty({ feedError: 'network_error' }).node, { lang: 'hi' })
    expect(fixedHeightOffenders()).toEqual([])
    const line = flat(screen.getByText(hi.network_error).props.style).lineHeight as number
    expect(line).toBeGreaterThan(14 * 1.3)
  })

  it('is drawn in the dark theme', () => {
    show(empty().node, { mode: 'dark' })
    expect(styleOf('feed-empty').backgroundColor).toBe(DARK_PALETTE.bg)
    expect(flat(screen.getByText(en.empty_feed_detail).props.style).color).toBe(DARK_PALETTE.text2)
  })

  it('is centred, clear of the system bars, and has the menu button in the corner', () => {
    const onMenu = jest.fn()
    show(empty({ onMenu }).node, { insets: { top: 30, bottom: 20, left: 4, right: 6 } })
    const scroll = screen.UNSAFE_getByType(ScrollView)
    expect(flat(scroll.props.contentContainerStyle)).toMatchObject({
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 36,
      paddingRight: 38,
      paddingTop: 50,
      paddingBottom: 40,
      flexGrow: 1,
    })
    fireEvent.press(screen.getByLabelText(en.menu))
    expect(onMenu).toHaveBeenCalledTimes(1)
  })

  it('scrolls only when what is on it does not fit, so that it never fights a pager for a swipe', () => {
    show(empty().node)
    const scroll = () => screen.UNSAFE_getByType(ScrollView)
    expect(scroll().props.scrollEnabled).toBe(false)
    act(() => {
      fireEvent(scroll(), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 400 } } })
      fireEvent(scroll(), 'contentSizeChange', 360, 380)
    })
    expect(scroll().props.scrollEnabled).toBe(false)
    act(() => {
      fireEvent(scroll(), 'contentSizeChange', 360, 700)
    })
    expect(scroll().props.scrollEnabled).toBe(true)
  })

  it('draws a plain panel from the words it is given', () => {
    const press = jest.fn()
    show(<EmptyPanel icon="empty" title="Nothing" detail="Nothing here." button={{ label: 'Go', onPress: press }} link={{ label: 'More', onPress: press }} />)
    fireEvent.press(screen.getByLabelText('Go'))
    fireEvent.press(screen.getByLabelText('More'))
    expect(press).toHaveBeenCalledTimes(2)
  })
})

describe('the caught-up page', () => {
  it('says "You\'re all caught up", what it means, and offers to check for new stories', () => {
    const onCheck = jest.fn()
    show(<CaughtUpPage earlier={0} onCheck={onCheck} onEarlier={jest.fn()} />)
    expect(screen.getByRole('header', { name: en.caught_up })).toBeTruthy()
    expect(screen.getByText(en.caught_up_detail)).toBeTruthy()
    fireEvent.press(screen.getByLabelText(en.check_new))
    expect(onCheck).toHaveBeenCalledTimes(1)
  })

  it('offers to go back over the earlier stories, naming how many', () => {
    const onEarlier = jest.fn()
    const { rerender } = show(<CaughtUpPage earlier={3} onCheck={jest.fn()} onEarlier={onEarlier} />)
    fireEvent.press(screen.getByLabelText('Read 3 earlier stories'))
    expect(onEarlier).toHaveBeenCalledTimes(1)
    rerender(wrap(<CaughtUpPage earlier={1} onCheck={jest.fn()} onEarlier={onEarlier} />))
    expect(screen.getByLabelText('Read 1 earlier story')).toBeTruthy()
  })

  it('hides the control when there is nothing to go back to', () => {
    show(<CaughtUpPage earlier={0} onCheck={jest.fn()} onEarlier={jest.fn()} />)
    expect(screen.queryByTestId('caught-up-earlier')).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('has the badge of the native page: an 80 dp circle in the soft accent colour', () => {
    show(<CaughtUpPage earlier={0} onCheck={jest.fn()} onEarlier={jest.fn()} />)
    expect(styleOf('caught-up-badge')).toMatchObject({ width: 80, height: 80, borderRadius: 40, backgroundColor: LIGHT_PALETTE.accentSoft })
    expect(flat(screen.getByText(en.caught_up).props.style)).toMatchObject({ fontSize: 24, fontFamily: 'serif', fontWeight: '700', textAlign: 'center' })
  })

  it('keeps to a reading column: at most 640 dp wide, with 16 dp and the page\'s own 16 dp each side', () => {
    const padding = () => flat(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle).paddingLeft
    setWindow(360, 800)
    const { unmount } = show(<CaughtUpPage earlier={0} onCheck={jest.fn()} onEarlier={jest.fn()} />)
    expect(padding()).toBe(32)
    unmount()
    setWindow(1000, 700)
    show(<CaughtUpPage earlier={0} onCheck={jest.fn()} onEarlier={jest.fn()} />)
    expect(padding()).toBe(180 + 16)
  })

  it('is clear of the system bars and has the menu button in the corner', () => {
    const onMenu = jest.fn()
    show(<CaughtUpPage earlier={0} onCheck={jest.fn()} onEarlier={jest.fn()} onMenu={onMenu} />, { insets: { top: 30, bottom: 20 } })
    expect(flat(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle)).toMatchObject({ paddingTop: 46, paddingBottom: 36 })
    fireEvent.press(screen.getByLabelText(en.menu))
    expect(onMenu).toHaveBeenCalledTimes(1)
  })

  it('is in Hindi, with the plural of Hindi', () => {
    show(<CaughtUpPage earlier={3} onCheck={jest.fn()} onEarlier={jest.fn()} />, { lang: 'hi' })
    expect(screen.getByRole('header', { name: hi.caught_up })).toBeTruthy()
    expect(screen.getByText(hi.caught_up_detail)).toBeTruthy()
    expect(screen.getByLabelText(hi.check_new)).toBeTruthy()
    expect(screen.getByLabelText(translatePlural('hi', 'read_earlier', 3))).toBeTruthy()
    expect(translatePlural('hi', 'read_earlier', 3)).not.toBe(translatePlural('en', 'read_earlier', 3))
    expect(fixedHeightOffenders(['caught-up-badge'])).toEqual([])
  })

  it('is drawn in the dark theme', () => {
    show(<CaughtUpPage earlier={2} onCheck={jest.fn()} onEarlier={jest.fn()} />, { mode: 'dark' })
    expect(styleOf('caught-up').backgroundColor).toBe(DARK_PALETTE.bg)
    expect(styleOf('caught-up-badge').backgroundColor).toBe(DARK_PALETTE.accentSoft)
  })
})
