import { AdController, LOOKAHEAD, MAX_FAILURES, PAUSE_MS, STALE_MS } from '../ad-controller'
import { FakeNetwork, FakePage, type Request } from './helpers'

const LIST = 40

// A port of AdControllerTest.java: when a full-page ad is asked for, joins the pager and is let go. The network is a fake that answers
// when the test says, and the clock is the test's: nothing here touches Google.
describe('the full-page ads', () => {
  let network: FakeNetwork
  let now: number
  let changes: number
  let ads: AdController

  beforeEach(() => {
    network = new FakeNetwork()
    now = 1_000_000
    changes = 0
    ads = new AdController({ network, clock: () => now, every: 5 })
    ads.store.subscribe(() => {
      changes++
    })
    ads.ready()
  })

  it('asks for nothing before the reader has allowed it', () => {
    const early = new AdController({ network, clock: () => now, every: 5 })
    early.reader(2, LIST, -1)
    expect(network.requests).toHaveLength(0)
    early.ready()
    // Asked as soon as it may.
    expect(network.requests).toHaveLength(1)
  })

  it('asks for a slot when the reader is three stories before it and not sooner', () => {
    ads.reader(0, LIST, -1)
    ads.reader(1, LIST, -1)
    expect(network.requests).toHaveLength(0)
    ads.reader(2, LIST, -1)
    expect(network.requests).toHaveLength(1)
  })

  it('does not ask for a slot the reader has reached or passed, but asks for the next one', () => {
    ads.reader(5, LIST, -1)
    // Slot 5 is behind the reader and slot 10 is five stories away.
    expect(network.requests).toHaveLength(0)
    ads.reader(7, LIST, -1)
    expect(network.requests).toHaveLength(1)
  })

  it('still asks for a slot just ahead of the reader', () => {
    ads.reader(4, LIST, -1)
    expect(network.requests).toHaveLength(1)
  })

  it('asks for a slot once, however often the reader moves within its reach', () => {
    ads.reader(2, LIST, -1)
    ads.reader(3, LIST, -1)
    ads.reader(4, LIST, -1)
    expect(network.requests).toHaveLength(1)
  })

  it('asks for no slot where no story follows it', () => {
    ads.reader(2, 5, -1)
    // Five stories have no slot.
    expect(network.requests).toHaveLength(0)
  })

  it('lets an ad that arrives join the pager, and reports it once', () => {
    ads.reader(2, LIST, -1)
    const page = network.arrive(network.last())
    expect(ads.shown()).toEqual([5])
    expect(ads.page(1)).toBe(page)
    expect(changes).toBe(1)
    // There is no ad in slot 2.
    expect(ads.page(2)).toBeNull()
  })

  it('lets go of an ad that arrives after its slot was passed, and never shows it', () => {
    ads.reader(2, LIST, -1)
    const request = network.last()
    ads.reader(5, LIST, -1)
    // The request was given up on.
    expect(request.cancelled).toBe(true)
    const page = network.arrive(request)
    expect(page.destroyed).toBe(true)
    expect(ads.shown()).toHaveLength(0)
    expect(changes).toBe(0)
  })

  it('keeps an ad while the reader is within a story of it after seeing it, and lets it go beyond that', () => {
    ads.reader(2, LIST, -1)
    const page = network.arrive(network.last())
    ads.reader(4, LIST, -1)
    ads.reader(4, LIST, 5)
    // On the ad.
    expect(ads.shown()).toEqual([5])
    ads.reader(5, LIST, -1)
    // On the story after it.
    expect(ads.shown()).toEqual([5])
    expect(page.destroyed).toBe(false)
    const before = changes
    ads.reader(6, LIST, -1)
    // A story further on.
    expect(ads.shown()).toHaveLength(0)
    expect(page.destroyed).toBe(true)
    // The pager is told its ad page is gone.
    expect(changes).toBe(before + 1)
  })

  it('lets a seen ad go when the reader goes back two stories', () => {
    ads.reader(2, LIST, -1)
    const page = network.arrive(network.last())
    ads.reader(4, LIST, 5)
    ads.reader(3, LIST, -1)
    // One story back, the ad is two pages ahead.
    expect(ads.shown()).toHaveLength(0)
    expect(page.destroyed).toBe(true)
  })

  it('asks for a fresh ad for the next pass when the reader goes back over the ad', () => {
    ads.reader(2, LIST, -1)
    const first = network.arrive(network.last())
    ads.reader(4, LIST, 5)
    ads.reader(5, LIST, -1)
    ads.reader(6, LIST, -1)
    expect(first.destroyed).toBe(true)
    const asked = network.requests.length
    ads.reader(3, LIST, -1)
    // Slot 5 is asked for again.
    expect(network.requests).toHaveLength(asked + 1)
    const second = network.arrive(network.last())
    expect(second).not.toBe(first)
    expect(ads.shown()).toEqual([5])
  })

  it('keeps an ad the reader has not seen while it is still ahead', () => {
    ads.reader(2, LIST, -1)
    const page = network.arrive(network.last())
    ads.reader(0, LIST, -1)
    expect(ads.shown()).toEqual([5])
    expect(page.destroyed).toBe(false)
  })

  it('lets go of an ad the reader jumped past without seeing', () => {
    ads.reader(2, LIST, -1)
    const page = network.arrive(network.last())
    const before = changes
    ads.reader(8, LIST, -1)
    expect(page.destroyed).toBe(true)
    expect(ads.shown()).toHaveLength(0)
    expect(changes).toBe(before + 1)
  })

  it('lets go of an ad held too long without being seen, and asks for another', () => {
    ads.reader(2, LIST, -1)
    const old = network.arrive(network.last())
    now += STALE_MS + 1
    const asked = network.requests.length
    ads.reader(3, LIST, -1)
    expect(old.destroyed).toBe(true)
    expect(ads.shown()).toHaveLength(0)
    // And a fresh one is on its way.
    expect(network.requests).toHaveLength(asked + 1)
  })

  it('never treats a seen ad as stale', () => {
    ads.reader(2, LIST, -1)
    const page = network.arrive(network.last())
    ads.reader(4, LIST, 5)
    now += STALE_MS * 3
    ads.reader(5, LIST, -1)
    expect(page.destroyed).toBe(false)
  })

  it('stops the asking for a while after two misses in a row, and then starts again', () => {
    ads.reader(2, LIST, -1)
    network.last().listener.failed()
    ads.reader(7, LIST, -1)
    expect(network.requests).toHaveLength(2)
    network.last().listener.failed()
    ads.reader(12, LIST, -1)
    // Paused: no third request.
    expect(network.requests).toHaveLength(2)
    now += PAUSE_MS - 1
    ads.reader(12, LIST, -1)
    expect(network.requests).toHaveLength(2)
    now += 2
    ads.reader(12, LIST, -1)
    // The pause is over.
    expect(network.requests).toHaveLength(3)
  })

  it('clears the count of misses when an ad arrives', () => {
    ads.reader(2, LIST, -1)
    network.last().listener.failed()
    ads.reader(7, LIST, -1)
    network.arrive(network.last())
    ads.reader(12, LIST, -1)
    network.last().listener.failed()
    ads.reader(17, LIST, -1)
    // One miss since the last ad is not a streak.
    expect(network.requests).toHaveLength(4)
  })

  it('does not ask again for a missed slot while the reader stays near it, but does on the next pass', () => {
    ads.reader(2, LIST, -1)
    network.last().listener.failed()
    ads.reader(3, LIST, -1)
    ads.reader(4, LIST, -1)
    expect(network.requests).toHaveLength(1)
    ads.reader(7, LIST, -1)
    const asked = network.requests.length
    ads.reader(2, LIST, -1)
    // Slot 5 is asked for again on the way back.
    expect(network.requests).toHaveLength(asked + 1)
  })

  it('shows ads only where a story follows them', () => {
    ads.reader(2, LIST, -1)
    network.arrive(network.last())
    expect(ads.shown()).toEqual([5])
    ads.reader(2, 5, -1)
    // The list shrank to five stories.
    expect(ads.shown()).toHaveLength(0)
    ads.reader(2, LIST, -1)
    // And grew again.
    expect(ads.shown()).toEqual([5])
  })

  it('never asks in a build without full-page ads', () => {
    network.pages = false
    expect(ads.enabled()).toBe(false)
    ads.reader(2, LIST, -1)
    expect(network.requests).toHaveLength(0)
    expect(ads.shown()).toHaveLength(0)
  })

  it('leaves nothing hanging with a network that answers at once', () => {
    network.answerAtOnce = false
    ads.reader(2, LIST, -1)
    expect(network.requests).toHaveLength(1)
    expect(ads.shown()).toHaveLength(0)
    network.answerAtOnce = true
    ads.reader(7, LIST, -1)
    expect(ads.shown()).toEqual([10])
    expect(changes).toBe(1)
  })

  it('lets everything go when destroyed, and ignores what arrives later', () => {
    ads.reader(2, LIST, -1)
    const held = network.arrive(network.last())
    ads.reader(7, LIST, -1)
    const waiting = network.last()
    // The ad of slot 5 is behind the reader by now, so only the one being waited for is left to cancel.
    const before = changes
    ads.destroy()
    expect(waiting.cancelled).toBe(true)
    const late = network.arrive(waiting)
    expect(late.destroyed).toBe(true)
    expect(ads.shown()).toHaveLength(0)
    expect(changes).toBe(before)
    expect(held.destroyed).toBe(true)
  })

  it('shows each ad once and keeps at most two alive when reading through a long feed', () => {
    network.answerAtOnce = true
    const shownOnce: number[] = []
    for (let item = 0; item < LIST - 1; item++) {
      ads.reader(item, LIST, -1)
      // Swiping down one more page lands on the ad of the slot right after this story, if there is one.
      const next = item + 1
      for (const slot of ads.shown()) {
        if (slot === next) {
          ads.reader(item, LIST, slot)
          shownOnce.push(slot)
        }
      }
      const alive = network.made.filter((page) => !page.destroyed).length
      expect({ item, alive: alive <= 2 }).toEqual({ item, alive: true })
    }
    expect(shownOnce).toEqual([5, 10, 15, 20, 25, 30, 35])
    // Every ad is shown once, with no repeat.
    expect(network.made).toHaveLength(7)
  })

  it('finds an ad by the number of its slot whatever the step', () => {
    const wide = new AdController({ network, clock: () => now, every: 3 })
    wide.ready()
    wide.reader(0, LIST, -1)
    const page = network.arrive(network.last())
    expect(wide.page(1)).toBe(page)
    expect(wide.page(2)).toBeNull()
    expect(wide.shown()).toEqual([3])
  })
})

describe('the numbers of the full-page ads', () => {
  it('are the ones the native app has', () => {
    expect(LOOKAHEAD).toBe(3)
    expect(MAX_FAILURES).toBe(2)
    expect(PAUSE_MS).toBe(5 * 60_000)
    expect(STALE_MS).toBe(50 * 60_000)
  })
})

describe('what the controller adds to the native one', () => {
  let network: FakeNetwork
  let now: number

  beforeEach(() => {
    network = new FakeNetwork()
    now = 1_000_000
  })

  const make = (every?: number) => {
    const controller = new AdController({ network, clock: () => now, every })
    controller.ready()
    return controller
  }

  it('stands for five stories unless it is told another whole number', () => {
    expect(make().every()).toBe(5)
    for (const every of [0, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(make(every).every()).toBe(5)
    expect(make(7).every()).toBe(7)
    expect(make(1).every()).toBe(1)
  })

  it('can be told how many stories an ad stands for until the reader has been seen, and not after', () => {
    const controller = make()
    controller.setEvery(7)
    expect(controller.every()).toBe(7)
    controller.setEvery(0)
    controller.setEvery(2.5)
    controller.setEvery(Number.NaN)
    expect(controller.every()).toBe(7)
    controller.reader(4, LIST, -1)
    controller.setEvery(3)
    // No ad changes its slot.
    expect(controller.every()).toBe(7)
    expect(network.requests).toHaveLength(1)
  })

  it('cannot be told after it has been destroyed', () => {
    const controller = make()
    controller.destroy()
    controller.setEvery(9)
    expect(controller.every()).toBe(5)
  })

  it('keeps the slots its store names as the ads come and go, a new list each time', () => {
    const controller = make()
    const seen: (readonly number[])[] = []
    controller.store.subscribe(() => seen.push(controller.store.getState().shown))
    expect(controller.store.getState().shown).toEqual([])
    controller.reader(2, LIST, -1)
    network.arrive(network.last())
    expect(controller.store.getState().shown).toEqual([5])
    controller.reader(6, LIST, -1)
    expect(controller.store.getState().shown).toEqual([])
    expect(seen).toEqual([[5], []])
    expect(seen[0]).not.toBe(seen[1])
  })

  it('tells its store when a list that shrank or grew takes a page out of the pager or brings it back', () => {
    const controller = make()
    let changes = 0
    controller.store.subscribe(() => {
      changes++
    })
    controller.reader(2, LIST, -1)
    network.arrive(network.last())
    expect(changes).toBe(1)
    controller.reader(2, 5, -1)
    expect(controller.store.getState().shown).toEqual([])
    expect(changes).toBe(2)
    controller.reader(2, LIST, -1)
    expect(controller.store.getState().shown).toEqual([5])
    expect(changes).toBe(3)
    // Nothing changed, nothing is told.
    controller.reader(2, LIST, -1)
    controller.reader(3, LIST, -1)
    expect(changes).toBe(3)
  })

  it('lists the slots that hold an ad in ascending order, whatever order the ads arrived in', () => {
    const controller = make(1)
    controller.reader(0, LIST, -1)
    // With a slot after every story, the three nearest are asked for.
    expect(network.requests).toHaveLength(LOOKAHEAD)
    const [first, second, third] = network.requests
    network.arrive(third)
    network.arrive(first)
    network.arrive(second)
    expect(controller.shown()).toEqual([1, 2, 3])
    expect(controller.store.getState().shown).toEqual([1, 2, 3])
    expect(controller.page(1)).not.toBe(controller.page(2))
  })

  it('keeps an ad seen while the reader stays on it, and takes no notice of a page that holds none', () => {
    const controller = make()
    controller.reader(2, LIST, -1)
    const page = network.arrive(network.last())
    controller.reader(4, LIST, 5)
    // The same page, drawn again (a re-render of the pager): still the page the reader is on.
    controller.reader(4, LIST, 5)
    expect(controller.shown()).toEqual([5])
    expect(page.destroyed).toBe(false)
    // A page that has no ad, a slot that was never asked for, changes nothing.
    controller.reader(4, LIST, 10)
    expect(controller.shown()).toEqual([5])
    controller.reader(5, LIST, -1)
    expect(controller.shown()).toEqual([5])
    expect(page.destroyed).toBe(false)
  })

  it('says it is ready only once it was told so, and only once', () => {
    const controller = new AdController({ network, clock: () => now, every: 5 })
    expect(controller.isReady()).toBe(false)
    controller.ready()
    controller.ready()
    expect(controller.isReady()).toBe(true)
    controller.reader(2, LIST, -1)
    controller.ready()
    expect(network.requests).toHaveLength(1)
  })

  it('does nothing once destroyed', () => {
    const controller = make()
    controller.reader(2, LIST, -1)
    controller.destroy()
    controller.destroy()
    controller.reader(7, LIST, -1)
    controller.ready()
    expect(network.requests).toHaveLength(1)
    expect(controller.shown()).toEqual([])
    expect(controller.page(1)).toBeNull()
  })

  it('does not count a miss for a slot that was given up on', () => {
    const controller = make()
    controller.reader(2, LIST, -1)
    const given = network.last()
    // The slot is passed while its request is out; the network answers "no ad" afterwards.
    controller.reader(5, LIST, -1)
    given.listener.failed()
    controller.reader(7, LIST, -1)
    network.last().listener.failed()
    controller.reader(12, LIST, -1)
    // One real miss is not a streak, so the asking has not stopped.
    expect(network.requests).toHaveLength(3)
  })

  it('lets go of an ad that arrives for a slot already answered', () => {
    const controller = make()
    let changes = 0
    controller.store.subscribe(() => {
      changes++
    })
    controller.reader(2, LIST, -1)
    const request: Request = network.last()
    request.listener.failed()
    const late = network.arrive(request)
    expect(late.destroyed).toBe(true)
    expect(controller.shown()).toEqual([])
    expect(changes).toBe(0)

    controller.reader(7, LIST, -1)
    const second = network.last()
    const page = network.arrive(second)
    const again = new FakePage()
    second.listener.loaded(again)
    expect(again.destroyed).toBe(true)
    expect(page.destroyed).toBe(false)
    expect(controller.shown()).toEqual([10])
  })

  it('gives up on a request when the reader has gone far back from its slot', () => {
    const controller = make(10)
    controller.reader(7, LIST, -1)
    const request = network.last()
    controller.reader(5, LIST, -1)
    // Five stories before the slot is within what is waited for.
    expect(request.cancelled).toBe(false)
    controller.reader(4, LIST, -1)
    expect(request.cancelled).toBe(true)
  })

  it('asks again for a missed slot once the reader has gone further than the reach back from it', () => {
    const controller = make(10)
    controller.reader(7, LIST, -1)
    network.last().listener.failed()
    controller.reader(8, LIST, -1)
    controller.reader(9, LIST, -1)
    // Within reach of the slot it missed, it is not asked again.
    expect(network.requests).toHaveLength(1)
    controller.reader(6, LIST, -1)
    controller.reader(7, LIST, -1)
    expect(network.requests).toHaveLength(2)
  })

  it('keeps the ads it holds while the asking is paused, and asks again when the pause is over', () => {
    // One story to an ad puts three slots within reach at once.
    const controller = make(1)
    controller.reader(0, LIST, -1)
    expect(network.requests).toHaveLength(3)
    const [first, second, third] = network.requests
    second.listener.failed()
    third.listener.failed()
    const held = network.arrive(first)
    expect(controller.shown()).toEqual([1])
    controller.reader(0, LIST, -1)
    expect(network.requests).toHaveLength(3)
    expect(held.destroyed).toBe(false)
    // The reader moves on: the ad of slot 1 is behind them, and the asking is still paused.
    controller.reader(1, LIST, -1)
    expect(held.destroyed).toBe(true)
    expect(network.requests).toHaveLength(3)
    now += PAUSE_MS + 1
    controller.reader(1, LIST, -1)
    expect(network.requests).toHaveLength(4)
  })

  it('works with a reader that starts anywhere in the feed', () => {
    const controller = make()
    controller.reader(22, LIST, -1)
    expect(network.requests).toHaveLength(1)
    const page = network.arrive(network.last())
    expect(controller.shown()).toEqual([25])
    expect(controller.page(5)).toBe(page)
    expect(controller.page(1)).toBeNull()
  })

  it('lets go of every request and ad it holds when the reader is told to be gone', () => {
    const controller = make()
    controller.reader(2, LIST, -1)
    const page = network.arrive(network.last())
    controller.reader(7, LIST, -1)
    const request = network.last()
    controller.destroy()
    expect(page.destroyed).toBe(true)
    expect(request.cancelled).toBe(true)
  })

  it('asks the network nothing in a build whose network has no page ads, and keeps no position', () => {
    network.pages = false
    const controller = make()
    controller.reader(2, LIST, -1)
    network.pages = true
    controller.ready()
    // The position was never kept, so turning the network on later asks nothing until the reader moves.
    expect(network.requests).toHaveLength(0)
    controller.reader(2, LIST, -1)
    expect(network.requests).toHaveLength(1)
  })
})
