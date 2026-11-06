import { EVERGREEN_CACHE_MS, NEWS_CACHE_MS, Session } from '../feed-session'
import { caughtUp, isCaughtUp } from '../story'
import { ids, stories, story } from './helpers'

describe('the stories a feed holds', () => {
  it('knows whether it is one topic and whether the news is in it', () => {
    const flags = (categories: string) => {
      const session = new Session('key', categories, 'en')
      return [session.single, session.news]
    }
    expect(flags('news')).toEqual([true, true])
    expect(flags('science')).toEqual([true, false])
    expect(flags('science,space')).toEqual([false, false])
    expect(flags('news,space')).toEqual([false, true])
    expect(flags('space,news')).toEqual([false, true])
    expect(flags('')).toEqual([false, false])
    expect(flags('newsletter')).toEqual([true, false])
  })

  it('lets the news be shown from the cache for two hours and anything else for a week', () => {
    expect(new Session('k', 'news', 'en').cacheLimit()).toBe(NEWS_CACHE_MS)
    expect(new Session('k', 'science', 'en').cacheLimit()).toBe(EVERGREEN_CACHE_MS)
    expect(new Session('k', 'news,science', 'en').cacheLimit()).toBe(NEWS_CACHE_MS)
    expect([NEWS_CACHE_MS, EVERGREEN_CACHE_MS]).toEqual([2 * 3_600_000, 7 * 24 * 3_600_000])
  })

  it('starts with nothing loaded, held or asked for', () => {
    const session = new Session('news-en', 'news', 'en')
    expect(session).toMatchObject({ key: 'news-en', categories: 'news', lang: 'en', exhausted: false, networkDone: false, loadedAt: null, shownAt: 0, pending: null })
    expect(session.stories).toEqual([])
    expect(session.earlier).toEqual([])
    expect(session.revealed).toEqual([])
    expect(session.positions.size).toBe(0)
  })

  it('withholds what was seen and what the reader brought back', () => {
    const session = new Session('k', 'news', 'en')
    expect(session.withheld()).toBe(session.earlier)
    session.earlier = stories('e', 2)
    session.revealed = stories('r', 1)
    expect(ids(session.withheld())).toEqual(['e1', 'e2', 'r1'])
  })

  it('shows all of its stories, or those of a section, and the same list while nothing changes', () => {
    const session = new Session('k', 'news', 'en')
    session.stories = [story('a', 'A', 1, { section: 'india' }), story('b', 'B', 1, { section: 'world' }), story('c', 'C', 1, { section: 'india' })]
    expect(session.shown('')).toBe(session.stories)
    const india = session.shown('india')
    expect(ids(india)).toEqual(['a', 'c'])
    expect(session.shown('india')).toBe(india)
    expect(session.shown('world')).not.toBe(india)
    expect(ids(session.shown('tech'))).toEqual([])
    session.stories = [...session.stories, story('d', 'D', 1, { section: 'india' })]
    expect(ids(session.shown('india'))).toEqual(['a', 'c', 'd'])
  })

  it('has the caught-up card and the revealed stories after its stories when told to, the same list while nothing changes', () => {
    const session = new Session('k', 'news', 'en')
    session.stories = stories('n', 2)
    expect(session.items('', false)).toBe(session.stories)
    const withMarker = session.items('', true)
    expect(withMarker).toHaveLength(3)
    expect(isCaughtUp(withMarker[2])).toBe(true)
    expect(session.items('', true)).toBe(withMarker)
    session.revealed = stories('r', 2)
    const revealed = session.items('', true)
    expect(ids(revealed)).toEqual(['n1', 'n2', caughtUp().id, 'r1', 'r2'])
    expect(revealed).not.toBe(withMarker)
    session.stories = stories('m', 1)
    expect(ids(session.items('', true))).toEqual(['m1', caughtUp().id, 'r1', 'r2'])
  })
})
