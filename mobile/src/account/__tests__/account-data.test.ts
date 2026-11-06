import { makeStory } from '@/data/story'
import { addOp, emptyData, fromJson, isEmpty, QUEUE_LIMIT, removeOp, toJson, type AccountData } from '../account-data'
import { AccountError } from '../errors'
import { USER_A } from './helpers'

const session = { access: 'access-token', refresh: 'refresh-token', expiresAt: 1_800_003_600_000, userId: USER_A, email: 'a@example.com', name: 'Asha Rao' }

function full(): AccountData {
  return {
    session,
    verifier: 'verifier-value',
    verifierAt: 1_800_000_000_000,
    lastSync: 1_800_000_100_000,
    synced: USER_A,
    dirty: true,
    queue: [addOp(makeStory({ id: 'a-1', title: 'Title', content: 'Content', category: 'science', source: 'Publisher', sourceUrl: 'https://example.com/a' })), removeOp('b-2')],
  }
}

describe('what the phone remembers of the account', () => {
  it('is nothing at first, and nothing is worth keeping when nothing is left', () => {
    const data = emptyData()
    expect(isEmpty(data)).toBe(true)
    for (const change of [{ session }, { verifier: 'v' }, { synced: USER_A }, { dirty: true }, { queue: [removeOp('x')] }] as Partial<AccountData>[]) {
      expect(isEmpty({ ...data, ...change })).toBe(false)
    }
    // When it was last synced is not worth keeping by itself.
    expect(isEmpty({ ...data, lastSync: 5, verifierAt: 7 })).toBe(true)
  })

  it('is written and read back whole', () => {
    const data = full()
    const read = fromJson(toJson(data))
    expect(read).toEqual({ ...data, queue: [addOp(makeStory({ id: 'a-1', title: 'Title', content: 'Content', category: 'science' })), removeOp('b-2')] })
  })

  it('keeps of a queued story only what the account takes: id, title, text and category', () => {
    const op = addOp(makeStory({ id: 'a-1', title: 'T', content: 'C', category: 'g', source: 'S', sourceUrl: 'https://example.com', image: 'https://example.com/i.jpg', publishedAt: 7, sig: 'f'.repeat(32) }))
    expect(op.story).toEqual(makeStory({ id: 'a-1', title: 'T', content: 'C', category: 'g' }))
    const root = JSON.parse(toJson({ ...emptyData(), queue: [op, removeOp('b')] })) as { queue: unknown[] }
    expect(root.queue).toEqual([{ id: 'a-1', t: 'T', c: 'C', g: 'g' }, { id: 'b' }])
  })

  it('is written in the compact form the native app used, with the session only when there is one', () => {
    expect(JSON.parse(toJson(emptyData()))).toEqual({ schema: 1, ls: 0, d: false, queue: [] })
    expect(JSON.parse(toJson(full()))).toEqual({
      schema: 1,
      session: { a: 'access-token', r: 'refresh-token', e: 1_800_003_600_000, u: USER_A, m: 'a@example.com', n: 'Asha Rao' },
      v: 'verifier-value',
      va: 1_800_000_000_000,
      s: USER_A,
      ls: 1_800_000_100_000,
      d: true,
      queue: [{ id: 'a-1', t: 'Title', c: 'Content', g: 'science' }, { id: 'b-2' }],
    })
  })

  it('is read without a session, a verifier or a marker when it had none', () => {
    const read = fromJson(toJson(emptyData()))
    expect(read).toEqual(emptyData())
  })

  it('is refused when it is not text of this shape, with a message that holds none of it', () => {
    const good = JSON.parse(toJson(full())) as Record<string, unknown>
    const broken: unknown[] = [
      '{not json',
      '',
      'null',
      '[]',
      '"text"',
      '{}',
      { ...good, schema: 2 },
      { ...good, schema: '1' },
      { ...good, session: 'x' },
      { ...good, session: { ...(good.session as object), a: 5 } },
      { ...good, session: { ...(good.session as object), a: '' } },
      { ...good, session: { ...(good.session as object), r: '' } },
      { ...good, session: { ...(good.session as object), e: 'soon' } },
      { ...good, session: { ...(good.session as object), u: undefined } },
      { ...good, session: { ...(good.session as object), m: null } },
      { ...good, v: 5 },
      { ...good, va: undefined },
      { ...good, va: 'x' },
      { ...good, s: 7 },
      { ...good, ls: 'x' },
      { ...good, ls: null },
      { ...good, d: 'true' },
      { ...good, d: undefined },
      { ...good, queue: {} },
      { ...good, queue: undefined },
      { ...good, queue: [1] },
      { ...good, queue: [{ id: 5 }] },
      { ...good, queue: [{ t: 'x' }] },
      { ...good, queue: [{ id: 'a', t: 'x' }] },
      { ...good, queue: [{ id: 'a', t: 'x', c: 'y', g: 5 }] },
      { ...good, queue: Array.from({ length: QUEUE_LIMIT + 1 }, (_, index) => ({ id: `s${index}` })) },
    ]
    for (const text of broken) {
      const input = typeof text === 'string' ? text : JSON.stringify(text)
      const failure = (() => {
        try {
          fromJson(input)
        } catch (error) {
          return error as Error
        }
        return null
      })()
      expect({ input: input.slice(0, 60), failure: failure instanceof AccountError }).toEqual({ input: input.slice(0, 60), failure: true })
      expect(failure?.message).not.toMatch(/access-token|refresh-token|verifier-value/)
    }
  })

  it('may hold as many waiting changes as the limit allows', () => {
    const queue = Array.from({ length: QUEUE_LIMIT }, (_, index) => removeOp(`s${index}`))
    expect(fromJson(toJson({ ...emptyData(), queue })).queue).toHaveLength(QUEUE_LIMIT)
    expect(QUEUE_LIMIT).toBe(400)
  })
})
