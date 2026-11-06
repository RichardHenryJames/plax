import { makeStory, type Story } from '@/data/story'
import type { Tokens } from './auth-api'
import { AccountError } from './errors'
import { isObject } from './transport'

/** The most changes made while signed in that wait for the account; past it the oldest go. */
export const QUEUE_LIMIT = 400

/** A change made while signed in that the account has not confirmed yet: a story saved (with its text), or the id of one removed. */
export interface Op {
  readonly id: string
  readonly story: Story | null
}

export const addOp = (story: Story): Op => ({ id: story.id, story: makeStory({ id: story.id, title: story.title, content: story.content, category: story.category }) })
export const removeOp = (id: string): Op => ({ id, story: null })

/** Everything the phone remembers of the account. It is kept in one piece, sealed in the secure store. */
export interface AccountData {
  session: Tokens | null
  /** The secret of a sign-in that is waiting for the browser, and when it was made. It lives for PENDING_MS at the most. */
  verifier: string | null
  verifierAt: number
  lastSync: number
  /** The account whose data this phone last merged: a different account never inherits what is on the phone. */
  synced: string | null
  /** The topics were changed on the phone and the account has not confirmed them yet. */
  dirty: boolean
  queue: Op[]
}

export const emptyData = (): AccountData => ({ session: null, verifier: null, verifierAt: 0, lastSync: 0, synced: null, dirty: false, queue: [] })

/** Nothing worth keeping: the stored entry is then removed instead of written. */
export const isEmpty = (data: AccountData): boolean =>
  data.session === null && data.verifier === null && data.synced === null && !data.dirty && data.queue.length === 0

const SCHEMA = 1

export function toJson(data: AccountData): string {
  const root: Record<string, unknown> = { schema: SCHEMA }
  if (data.session) {
    const { access, refresh, expiresAt, userId, email, name } = data.session
    root.session = { a: access, r: refresh, e: expiresAt, u: userId, m: email, n: name }
  }
  if (data.verifier !== null) {
    root.v = data.verifier
    root.va = data.verifierAt
  }
  if (data.synced !== null) root.s = data.synced
  root.ls = data.lastSync
  root.d = data.dirty
  root.queue = data.queue.map((op) => (op.story ? { id: op.id, t: op.story.title, c: op.story.content, g: op.story.category } : { id: op.id }))
  return JSON.stringify(root)
}

const unreadable = () => new AccountError('Unreadable account data')

function string(value: unknown): string {
  if (typeof value !== 'string') throw unreadable()
  return value
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw unreadable()
  return value
}

/** Reads what toJson wrote. Anything else (another shape, another version, a missing field) is an AccountError, never a half-read state. */
export function fromJson(text: string): AccountData {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    throw unreadable()
  }
  if (!isObject(root)) throw unreadable()
  if (root.schema !== SCHEMA) throw new AccountError('Unsupported account data')
  const data = emptyData()
  if (root.session !== undefined) {
    if (!isObject(root.session)) throw unreadable()
    const value = root.session
    const access = string(value.a)
    const refresh = string(value.r)
    if (access === '' || refresh === '') throw unreadable()
    data.session = { access, refresh, expiresAt: number(value.e), userId: string(value.u), email: string(value.m), name: string(value.n) }
  }
  if (root.v !== undefined) {
    data.verifier = string(root.v)
    data.verifierAt = number(root.va)
  }
  if (root.s !== undefined) data.synced = string(root.s)
  data.lastSync = number(root.ls)
  if (typeof root.d !== 'boolean') throw unreadable()
  data.dirty = root.d
  if (!Array.isArray(root.queue) || root.queue.length > QUEUE_LIMIT) throw unreadable()
  for (const element of root.queue as unknown[]) {
    if (!isObject(element)) throw unreadable()
    const id = string(element.id)
    data.queue.push(
      element.t !== undefined ? addOp(makeStory({ id, title: string(element.t), content: string(element.c), category: string(element.g) })) : removeOp(id),
    )
  }
  return data
}
