import { BUILT_IN_TOPICS } from '@/data/topic'
import { cleanTopics, sameTopics } from '../topics'

const known = [{ id: 'science' }, { id: 'space' }, { id: 'art' }, { id: 'cricket' }]

describe('cleanTopics', () => {
  it('keeps the known topics, in a fixed order, whatever order they came in', () => {
    expect([...cleanTopics(['space', 'science', 'art'], known)]).toEqual(['art', 'science', 'space'])
    expect([...cleanTopics(['art', 'space', 'science'], known)]).toEqual(['art', 'science', 'space'])
  })

  it('drops what is not on offer, and what is not even text', () => {
    expect([...cleanTopics(['space', 'bogus', '<b>', '', 'SPACE', 'Space'], known)]).toEqual(['space'])
    expect([...cleanTopics(['space', 7, null, undefined, {}, ['art'], true], known)]).toEqual(['space'])
  })

  it('reads a topic as it is written without the spaces around it', () => {
    expect([...cleanTopics([' space ', '\tart\n', 'sci ence'], known)]).toEqual(['art', 'space'])
  })

  it('holds a topic once', () => {
    expect([...cleanTopics(['art', 'art', ' art'], known)]).toEqual(['art'])
  })

  it('compares the code units of the names, as the native app\u2019s sorted set did', () => {
    const odd = [{ id: 'b' }, { id: 'B' }, { id: '\u00e9' }, { id: 'z' }, { id: 'a' }]
    expect([...cleanTopics(['\u00e9', 'z', 'b', 'a', 'B'], odd)]).toEqual(['B', 'a', 'b', 'z', '\u00e9'])
  })

  it('is empty when nothing is on offer or nothing is asked', () => {
    expect(cleanTopics(['space'], []).size).toBe(0)
    expect(cleanTopics([], known).size).toBe(0)
  })

  it('takes any collection, such as a set', () => {
    expect([...cleanTopics(new Set(['space', 'art']), known)]).toEqual(['art', 'space'])
  })

  it('knows the topics the app was made with', () => {
    expect(cleanTopics(BUILT_IN_TOPICS.map((topic) => topic.id), BUILT_IN_TOPICS).size).toBe(18)
    expect(cleanTopics(['cricket'], BUILT_IN_TOPICS).size).toBe(0)
  })
})

describe('sameTopics', () => {
  it('is true for the same topics in any order, and false otherwise', () => {
    expect(sameTopics(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
    expect(sameTopics(new Set(), new Set())).toBe(true)
    expect(sameTopics(new Set(['a']), new Set(['b']))).toBe(false)
    expect(sameTopics(new Set(['a']), new Set(['a', 'b']))).toBe(false)
    expect(sameTopics(new Set(['a', 'b']), new Set(['a']))).toBe(false)
    expect(sameTopics(new Set(['a', 'b']), new Set(['a', 'c']))).toBe(false)
  })
})
