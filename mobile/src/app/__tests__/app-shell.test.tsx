import * as SplashScreen from 'expo-splash-screen'
import { act, screen } from '@testing-library/react-native'
import { stories as makeStories, story } from '../../data/__tests__/helpers'
import { caughtUp } from '../../data/story'
import { flushPromises } from '../../test/helpers'
import { measureEverything } from '../../test/measure'
import { forgetMeasures } from '../../ui/story/measure'
import { chooseFromMenu, mountApp, openMenu, pressBack, press, swipeTo } from './rig'

beforeEach(() => {
  forgetMeasures()
  jest.mocked(SplashScreen.hideAsync).mockClear()
})

const shown = (text: string) => screen.queryAllByText(text).length > 0

describe('starting', () => {
  it('keeps the splash screen up until the feed has answered, then lets it go', async () => {
    const rig = await mountApp({ stories: null })
    expect(screen.queryByTestId('app-shell')).toBeNull()
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled()
    await rig.loadFirstPage(makeStories('s', 6))
    expect(screen.getByTestId('app-shell')).toBeTruthy()
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1)
  })

  it('shows the first story, in the reader’s language, with the tag and the age and no publisher', async () => {
    await mountApp()
    measureEverything(360)
    expect(screen.getByText('Headline s1')).toBeTruthy()
    expect(screen.getAllByTestId('tag')[0]).toHaveTextContent('HEADLINES')
    expect(screen.getAllByTestId('credit')[0]).not.toHaveTextContent('Publisher')
  })

  it('tells the system once that the first stories are on the screen, and not before', async () => {
    const rig = await mountApp({ stories: null })
    await rig.settle()
    expect(rig.host.drawn).toBe(0)
    await rig.loadFirstPage(makeStories('s', 6))
    expect(rig.host.drawn).toBe(1)
    await swipeTo(2)
    await chooseFromMenu('menu-topics')
    await chooseFromMenu('menu-feed')
    expect(rig.host.drawn).toBe(1)
  })

  it('does not show a blank screen when the feed is slow: after the splash limit it shows the loading page', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] })
    const rig = await mountApp({ stories: null })
    expect(screen.queryByTestId('app-shell')).toBeNull()
    await act(async () => {
      jest.advanceTimersByTime(2000)
      await flushPromises()
    })
    expect(screen.getByTestId('app-shell')).toBeTruthy()
    expect(screen.getByTestId('feed-loading')).toBeTruthy()
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1)
    await rig.loadFirstPage(makeStories('s', 3))
    expect(screen.queryByTestId('feed-loading')).toBeNull()
    expect(screen.getByTestId('feed-pager')).toBeTruthy()
  })

  it('shows what the feed could not give: a page that says so and a button to try again', async () => {
    const rig = await mountApp({ stories: null })
    await rig.settle()
    await act(async () => {
      rig.source.last.fail('network_error')
      await flushPromises()
    })
    expect(screen.getByTestId('feed-empty')).toBeTruthy()
    expect(screen.getByText('Could not load stories. Check your connection and try again.')).toBeTruthy()
    const asked = rig.source.calls.length
    await press(screen.getByText('Try again'))
    expect(rig.source.calls.length).toBe(asked + 1)
  })

  it('says there are no stories, and asks the feed again from the button, when the feed comes back empty', async () => {
    const rig = await mountApp({ stories: [] })
    expect(screen.getByText('No stories right now')).toBeTruthy()
    const asked = rig.source.calls.length
    await press(screen.getByText('Try again'))
    expect(rig.source.calls.length).toBe(asked + 1)
  })
})

describe('paging', () => {
  it('tells the engine where the reader is, and ticks, once for each page', async () => {
    const rig = await mountApp()
    expect(rig.services.engine.currentPosition()).toBe(0)
    await swipeTo(1)
    expect(rig.services.engine.currentPosition()).toBe(1)
    expect(rig.host.ticks).toBe(1)
    await swipeTo(1)
    expect(rig.host.ticks).toBe(1)
    await swipeTo(2)
    expect(rig.services.engine.currentPosition()).toBe(2)
    expect(rig.host.ticks).toBe(2)
    await swipeTo(1)
    expect(rig.services.engine.currentPosition()).toBe(1)
  })

  it('asks for more stories when the reader nears the end, and says it is looking', async () => {
    const rig = await mountApp({ stories: makeStories('s', 8) })
    const asked = rig.source.calls.length
    await swipeTo(5)
    expect(rig.source.calls.length).toBe(asked + 1)
    expect(screen.getByTestId('feed-banner')).toHaveTextContent('Finding more stories…')
    await act(async () => {
      rig.source.last.resolve(makeStories('t', 8))
      await flushPromises()
    })
    expect(screen.queryByTestId('feed-banner')).toBeNull()
  })

  it('says the reader is offline over the stories they have, and tries again when it is tapped', async () => {
    const rig = await mountApp({ stories: makeStories('s', 8) })
    await swipeTo(5)
    await act(async () => {
      rig.source.last.fail('network_error')
      await flushPromises()
    })
    const banner = screen.getByTestId('feed-banner')
    expect(banner).toHaveTextContent('You are offline. Showing the last stories we loaded. Tap to retry.')
    const asked = rig.source.calls.length
    await press(banner)
    expect(rig.source.calls.length).toBe(asked + 1)
  })

  it('shows a new page of stories the reader is told about, and takes them to it when the pill is pressed', async () => {
    const rig = await mountApp()
    await swipeTo(3)
    const apply = jest.spyOn(rig.services.engine, 'applyFresh')
    expect(screen.queryByTestId('new-stories-pill')).toBeNull()
    act(() => rig.services.engine.store.setState({ fresh: true }))
    await press(screen.getByTestId('new-stories-pill'))
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('shows that stories are being looked for', async () => {
    const rig = await mountApp()
    expect(screen.queryByTestId('refresh-spinner')).toBeNull()
    act(() => rig.services.engine.store.setState({ refreshing: true }))
    expect(screen.getByTestId('refresh-spinner')).toBeTruthy()
  })

  it('draws the caught-up page at the end of the new stories, with its two ways forward', async () => {
    const rig = await mountApp({ stories: makeStories('s', 3) })
    // The pager draws only the pages near the reader, so the card is put where the reader is.
    act(() => rig.services.engine.store.setState({ stories: [caughtUp()], earlier: 2 }))
    expect(screen.getByTestId('caught-up')).toBeTruthy()
    expect(screen.getByText('Read 2 earlier stories')).toBeTruthy()
    const refresh = jest.spyOn(rig.services.engine, 'refresh').mockImplementation(() => undefined)
    await press(screen.getByTestId('caught-up-check'))
    expect(refresh).toHaveBeenCalledTimes(1)
    const reveal = jest.spyOn(rig.services.engine, 'revealEarlier').mockImplementation(() => undefined)
    await press(screen.getByTestId('caught-up-earlier'))
    expect(reveal).toHaveBeenCalledTimes(1)
  })

  it('tells the reader what the engine says, once, and then forgets it', async () => {
    const rig = await mountApp()
    const first = story('s1')
    await act(async () => {
      rig.services.engine.toggleSaved(first)
      await flushPromises()
    })
    expect(screen.getByTestId('toast')).toHaveTextContent('Saved on this phone')
    expect(rig.services.engine.getState().notice).toBeNull()
  })
})

describe('moving between the places of the app', () => {
  it('goes to Topics from the menu, and back to the feed with the back button, and leaves the app from the feed', async () => {
    const rig = await mountApp()
    await chooseFromMenu('menu-topics')
    expect(screen.getByText('Follow your curiosity.')).toBeTruthy()
    expect(screen.queryByTestId('feed-pager')).toBeNull()
    await pressBack()
    expect(rig.services.engine.getState().screen).toBe('feed')
    expect(screen.getByTestId('feed-pager')).toBeTruthy()
    expect(rig.host.exits).toBe(0)
    await pressBack()
    expect(rig.host.exits).toBe(1)
  })

  it('closes the menu with the back button before anything else', async () => {
    const rig = await mountApp()
    await chooseFromMenu('menu-topics')
    await openMenu()
    expect(screen.getByTestId('menu-panel')).toBeTruthy()
    await pressBack()
    expect(screen.queryByTestId('menu-panel')).toBeNull()
    expect(rig.services.engine.getState().screen).toBe('topics')
  })

  it('shows Saved with nothing saved, and says what it is for', async () => {
    await mountApp()
    await chooseFromMenu('menu-saved')
    expect(screen.getByText('Keep the good reads.')).toBeTruthy()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('shows For you with no topics as an invitation, with the choice of topics and the account', async () => {
    await mountApp()
    await chooseFromMenu('menu-for-you')
    expect(screen.getByText('Make Plax yours')).toBeTruthy()
    expect(screen.getByText('Choose topics')).toBeTruthy()
    expect(screen.getByText('I have a Plax account')).toBeTruthy()
  })

  it('puts a topic’s stories on the feed when its card is pressed', async () => {
    const rig = await mountApp()
    await chooseFromMenu('menu-topics')
    const asked = rig.source.calls.length
    await press(screen.getByLabelText('Science'))
    expect(rig.services.engine.getState().screen).toBe('feed')
    expect(rig.services.engine.getState().topic.id).toBe('science')
    expect(rig.source.calls.length).toBe(asked + 1)
    expect(rig.source.last.request.categories).toContain('science')
  })

  it('does not let the reader reach Saved, For you or Topics from a back press on the feed', async () => {
    const rig = await mountApp()
    await pressBack()
    expect(rig.host.exits).toBe(1)
    expect(shown('Follow your curiosity.')).toBe(false)
  })
})
