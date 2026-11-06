import { act, fireEvent, render, screen, type RenderResult } from '@testing-library/react-native'
import { AppState, BackHandler, FlatList } from 'react-native'
import { NO_CLOUD } from '../../data/cloud'
import { SIGNED_OUT, type AccountManager, type AccountState } from '../../account'
import { AdsProvider, createAdsSession, resetSharedAdsSession, type AdsSession } from '../../ads'
import { FakeNetwork } from '../../ads/__tests__/helpers'
import { answer, configText, memoryStorage, type MemoryStorage } from '../../config/__tests__/helpers'
import type { RequestFn } from '../../config/site-file'
import { FakeSource, stories as makeStories } from '../../data/__tests__/helpers'
import type { DeeperSource } from '../../data/deeper-api'
import type { ShareSource } from '../../data/share-links'
import type { Story } from '../../data/story'
import { fakeClock } from '../../platform/clock'
import { createStore } from '../../state/store'
import { flushPromises, setVariant } from '../../test/helpers'
import { createServices, type Services } from '../container'
import type { Host } from '../host'
import { Root } from '../Root'

export const SITE = 'https://plax-rouge.vercel.app/news'
export const NOW = 1_780_000_000_000

export interface FakeAccount extends AccountManager {
  readonly calls: string[]
  /** Changes what the account says it is. */
  set(patch: Partial<AccountState>): void
}

/** An account the test drives: what the screens ask of it is written down, and its state is whatever the test sets. */
export function fakeAccount(): FakeAccount {
  const store = createStore<AccountState>(SIGNED_OUT)
  const calls: string[] = []
  return {
    store,
    calls,
    set: (patch) => store.setState(patch),
    restore: async () => void calls.push('restore'),
    signIn: async () => void calls.push('signIn'),
    cancel: async () => void calls.push('cancel'),
    complete: async (address) => void calls.push(`complete ${address}`),
    ours: (address) => address.startsWith('com.plaxlabs.news://'),
    signOut: async () => void calls.push('signOut'),
    deleteAccount: async () => void calls.push('deleteAccount'),
    resume: async () => void calls.push('resume'),
    cloud: () => NO_CLOUD,
    idle: async () => undefined,
  }
}

export interface FakeHost extends Host {
  readonly browser: string[]
  readonly urls: string[]
  readonly copied: string[]
  readonly shared: { message: string; title: string }[]
  exits: number
  ticks: number
  confirms: number
  /** What the phone answers: no browser, no mail app, no share sheet. */
  noBrowser: boolean
  noMailApp: boolean
  noShare: boolean
  sdkLevel: number
}

export function fakeHost(): FakeHost {
  const host: FakeHost = {
    browser: [],
    urls: [],
    copied: [],
    shared: [],
    exits: 0,
    ticks: 0,
    confirms: 0,
    noBrowser: false,
    noMailApp: false,
    noShare: false,
    sdkLevel: 34,
    get sdk() {
      return host.sdkLevel
    },
    openBrowser: async (url) => {
      if (host.noBrowser) throw new Error('no browser')
      host.browser.push(url)
    },
    openUrl: async (url) => {
      if (host.noMailApp) throw new Error('no app')
      host.urls.push(url)
    },
    copy: async (text) => void host.copied.push(text),
    share: async (message, title) => {
      if (host.noShare) return false
      host.shared.push({ message, title })
      return true
    },
    exit: () => void (host.exits += 1),
    tick: () => void (host.ticks += 1),
    confirm: () => void (host.confirms += 1),
  }
  return host
}

export interface AppRig {
  readonly services: Services
  readonly host: FakeHost
  readonly account: FakeAccount
  readonly source: FakeSource
  readonly storage: MemoryStorage
  readonly clock: ReturnType<typeof fakeClock>
  readonly network: FakeNetwork
  readonly session: AdsSession
  /** What the website answers at each address (the settings file, the update feed); anything else is a failure. */
  readonly website: Map<string, string>
  readonly requests: string[]
  readonly view: RenderResult
  /** Answers the feed's first request with these stories and draws the pager at a phone's size. */
  loadFirstPage(page: readonly Story[]): Promise<void>
  /** Lets everything that can run, run. */
  settle(): Promise<void>
  /** The app goes to the background or comes back to the front. */
  appState(next: 'active' | 'background'): Promise<void>
  unmount(): void
}

export interface MountOptions {
  variant?: 'play' | 'preview' | 'e2e'
  /** Files of the website that are there from the start. */
  website?: Record<string, string>
  storage?: Record<string, string>
  deeper?: DeeperSource
  share?: ShareSource
  /** Shows the app at once with the pager drawn (the first page loaded); default true. */
  stories?: readonly Story[] | null
  bannerOn?: boolean
  pagesOn?: boolean
}

const mounted: AppRig[] = []

// Whatever a test leaves running (the pager's skeleton pulses for ever) must not keep the next one, or Jest, waiting.
afterEach(async () => {
  for (const rig of mounted.splice(0)) {
    rig.unmount()
    rig.services.stop()
    await rig.services.engine.dispose()
  }
  jest.restoreAllMocks()
})

/** The pages of the pager, one swipe each: the reader is on page `page` (0 is the first story) when the pager has come to rest. */
export async function swipeTo(page: number): Promise<void> {
  const list = screen.UNSAFE_getByType(FlatList)
  await act(async () => {
    list.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 0, y: page * PHONE.height } } })
    await flushPromises()
  })
}

/** A finger on the pager that has not yet let go. */
export async function startSwipe(): Promise<void> {
  const list = screen.UNSAFE_getByType(FlatList)
  await act(async () => {
    list.props.onScrollBeginDrag()
    await flushPromises()
  })
}

export const press = async (element: Parameters<typeof fireEvent.press>[0]): Promise<void> => {
  await act(async () => {
    fireEvent.press(element)
    await flushPromises()
  })
}

/** Presses the menu button of the story (or the page) in view. */
export async function openMenu(): Promise<void> {
  await press(screen.getAllByTestId('menu-button')[0])
}

/** Opens the menu and chooses one of its rows by its testID ("menu-topics"). */
export async function chooseFromMenu(testID: string): Promise<void> {
  await openMenu()
  await press(screen.getByTestId(testID))
}

/** The phone's back button: the handlers the app has registered are asked from the latest to the first, and the first that takes it ends it. */
export async function pressBack(): Promise<void> {
  await act(async () => {
    for (const handler of [...backHandlers].reverse()) if (handler()) break
    await flushPromises()
  })
}

let backHandlers: (() => boolean | null | undefined)[] = []

export const PHONE = { x: 0, y: 0, width: 392, height: 780 }

/** The whole app, in a phone that is a set of fakes: its storage, its feed, its account, its browser, its ad network and its clock. */
export async function mountApp(options: MountOptions = {}): Promise<AppRig> {
  setVariant(options.variant ?? 'preview')
  resetSharedAdsSession()
  // The phone's own report of coming to the front and leaving is a list of listeners the test calls.
  const appStateListeners = new Set<(state: string) => void>()
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: (state: string) => void) => {
    appStateListeners.add(listener)
    return { remove: () => void appStateListeners.delete(listener) }
  }) as never)
  // `currentState` is a function in the phone-less mock of AppState: the test makes it what the phone says.
  Object.defineProperty(AppState, 'currentState', { value: 'active', writable: true, configurable: true })
  // So is the back button.
  backHandlers = []
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_type: string, handler: () => boolean) => {
    backHandlers.push(handler)
    return { remove: () => void backHandlers.splice(backHandlers.indexOf(handler), 1) }
  }) as never)
  const storage = memoryStorage(options.storage)
  const clock = fakeClock(NOW)
  const source = new FakeSource()
  const account = fakeAccount()
  const host = fakeHost()
  const network = new FakeNetwork()
  network.bannerOn = options.bannerOn ?? false
  network.pages = options.pagesOn ?? false
  const session = createAdsSession({ network, clock, screen: { widthDp: PHONE.width, heightDp: PHONE.height } })
  const website = new Map<string, string>([[`${SITE}/app-config.json`, configText()], ...Object.entries(options.website ?? {})])
  const requests: string[] = []
  const request: RequestFn = async (url) => {
    requests.push(url)
    const text = website.get(url)
    if (text === undefined) return answer('', { status: 404 })
    return answer(text)
  }
  const services = createServices({
    clock,
    storage,
    feed: source,
    request,
    account,
    deeper: options.deeper,
    share: options.share,
    legacyFiles: { readText: async () => null },
    playBuild: (options.variant ?? 'preview') === 'play',
    installed: 20,
    sdk: 34,
    updates: { isEnabled: false, channel: null, runtimeVersion: null, updateId: null, isEmbeddedLaunch: true, checkForUpdateAsync: async () => ({ isAvailable: false }), fetchUpdateAsync: async () => ({ isNew: false }), reloadAsync: async () => undefined },
    openUrl: async (url) => {
      host.urls.push(url)
      return true
    },
    engine: { dwellMs: 600_000, glanceMs: 600_000 },
  })
  const view = render(
    <AdsProvider session={session}>
      <Root services={services} host={host} />
    </AdsProvider>,
  )
  const rig: AppRig = {
    services,
    host,
    account,
    source,
    storage,
    clock,
    network,
    session,
    website,
    requests,
    view,
    settle: () => act(async () => void (await flushPromises())),
    async appState(next) {
      ;(AppState as unknown as { currentState: string }).currentState = next
      await act(async () => {
        for (const listener of [...appStateListeners]) listener(next)
        await flushPromises()
      })
    },
    async loadFirstPage(page) {
      await rig.settle()
      await act(async () => {
        source.last.resolve([...page])
        await flushPromises()
      })
      await rig.settle()
      const pager = screen.queryByTestId('feed-pager')
      if (pager) fireEvent(pager, 'layout', { nativeEvent: { layout: PHONE } })
      await rig.settle()
    },
    unmount: () => {
      if (unmounted) return
      unmounted = true
      session.destroy()
      view.unmount()
    },
  }
  let unmounted = false
  mounted.push(rig)
  if (options.stories !== null) await rig.loadFirstPage(options.stories ?? makeStories('s', 12))
  return rig
}
