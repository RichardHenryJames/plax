import type { NativeAd } from 'react-native-google-mobile-ads'
import type { MockControls } from '../../../__mocks__/react-native-google-mobile-ads'
import type { AdNetwork, AdPage, Cancelable, NativeAdContent, PageListener } from '../ad-network'
import type { AdTheme } from '../NativeAdPage'
import { NEVER_SERVED, type BannerServed } from '../served'

/** The ads library's mock (see __mocks__): its enums, its calls, and in `__mock` the controls. Read through require, so that it is the module the code under test has. */
export const mockLibrary = (): typeof import('../../../__mocks__/react-native-google-mobile-ads') => require('react-native-google-mobile-ads')

/** The controls of the ads library's mock. */
export const library = (): MockControls => mockLibrary().__mock

/** Lets every promise that is already resolved run its continuation, without a timer (so it works while Jest's timers are fake). */
export async function settle(rounds = 30): Promise<void> {
  for (let round = 0; round < rounds; round++) await Promise.resolve()
}

export const THEME: AdTheme = {
  bg: '#F7F5F0',
  text: '#17171B',
  textSecondary: '#5B5B66',
  accent: '#F5B13A',
  onAccent: '#1A1203',
  surface: '#FFFFFF',
  border: '#E2DED4',
}

export function adContent(override: Partial<NativeAdContent> = {}): NativeAdContent {
  return {
    id: 'ad-content',
    headline: 'Save big on everything this season',
    body: 'Hundreds of offers from the shops you already use, on one screen.',
    callToAction: 'Install now',
    advertiser: 'Plax Test Advertiser',
    icon: { url: 'file:///ad/icon.png' },
    media: { aspectRatio: 1.91 },
    ...override,
  }
}

let serial = 0

/** A full-page ad that has loaded, of the plainest kind. */
export class FakePage implements AdPage {
  destroyed = false
  readonly content: NativeAdContent
  readonly ad: NativeAd

  constructor(override: Partial<NativeAdContent> = {}) {
    serial += 1
    this.content = adContent({ id: `fake-ad-${serial}`, ...override })
    this.ad = { responseId: this.content.id, destroy: jest.fn() } as unknown as NativeAd
  }

  destroy(): void {
    this.destroyed = true
  }
}

export class Request implements Cancelable {
  cancelled = false

  constructor(readonly listener: PageListener) {}

  cancel(): void {
    this.cancelled = true
  }
}

/** An ad network that answers when the test says (a port of the Network of AdControllerTest.java), and holds consent until it is given. */
export class FakeNetwork implements AdNetwork {
  readonly requests: Request[] = []
  readonly made: FakePage[] = []
  readonly starts: (() => void)[] = []
  pages = true
  bannerOn = false
  unit = 'ca-app-pub-1111111111111111/2222222222'
  privacy = false
  optionsShown = 0
  /** When set, a request is answered before loadPage returns: true with an ad, false with none. */
  answerAtOnce: boolean | null = null
  private readonly watchers = new Set<() => void>()

  banner(): boolean {
    return this.bannerOn
  }

  page(): boolean {
    return this.pages
  }

  bannerUnit(): string {
    return this.bannerOn ? this.unit : ''
  }

  start(ready: () => void): void {
    this.starts.push(ready)
  }

  /** The reader has given consent and the library is started: everyone who asked is told. */
  consent(): void {
    for (const ready of this.starts.splice(0)) ready()
  }

  privacyOptions(): boolean {
    return this.privacy
  }

  watchPrivacyOptions(listener: () => void): () => void {
    this.watchers.add(listener)
    return () => {
      this.watchers.delete(listener)
    }
  }

  setPrivacyOptions(applies: boolean): void {
    this.privacy = applies
    for (const watcher of [...this.watchers]) watcher()
  }

  async showPrivacyOptions(): Promise<void> {
    this.optionsShown += 1
  }

  loadPage(listener: PageListener): Cancelable {
    const request = new Request(listener)
    this.requests.push(request)
    if (this.answerAtOnce !== null) {
      if (this.answerAtOnce) {
        const page = new FakePage()
        this.made.push(page)
        listener.loaded(page)
      } else listener.failed()
    }
    return request
  }

  last(): Request {
    return this.requests[this.requests.length - 1]
  }

  /** The ad of this request arrives. */
  arrive(request: Request): FakePage {
    const page = new FakePage()
    this.made.push(page)
    request.listener.loaded(page)
    return page
  }
}

/** A place for the time of the last ad, which a test can look into. */
export function memoryServed(initial: BannerServed = NEVER_SERVED) {
  const memory = {
    record: initial,
    reads: 0,
    writes: [] as BannerServed[],
    failRead: false,
    failWrite: false,
    async read(): Promise<BannerServed> {
      memory.reads += 1
      if (memory.failRead) throw new Error('unreadable')
      return memory.record
    },
    async write(record: BannerServed): Promise<void> {
      if (memory.failWrite) throw new Error('unwritable')
      memory.writes.push(record)
      memory.record = record
    },
  }
  return memory
}
