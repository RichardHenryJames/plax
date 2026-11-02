import test from 'node:test'
import assert from 'node:assert/strict'
import { keepLayoutHeights } from './layout-guard.ts'

// A box with an inline style, and a MutationObserver that lets the test say when the style changed.
const box = (styles = {}) => {
  const values = new Map(Object.entries(styles))
  return {
    values,
    style: {
      getPropertyValue: (name) => values.get(name) ?? '',
      removeProperty: (name) => { values.delete(name) },
      setProperty: (name, value) => { values.set(name, value) },
    },
  }
}

const observers = []
globalThis.MutationObserver = class {
  constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; observers.push(this) }
  observe(target, options) { this.targets.push({ target, options }) }
  disconnect() { this.disconnected = true }
}

test('a height of auto that is set on a watched box is taken off, and any other height is left', () => {
  observers.length = 0
  const main = box({ height: '100dvh' })
  const inner = box()
  const stop = keepLayoutHeights([main, inner, null, undefined])
  const [watch] = observers
  assert.equal(watch.targets.length, 2, 'only the boxes that are there are watched')
  assert.ok(watch.targets.every(({ options }) => options.attributes && options.attributeFilter[0] === 'style'))
  // The page's own height stays.
  watch.callback([])
  assert.equal(main.values.get('height'), '100dvh')
  // The script sets auto: it is taken off as the observer reports it.
  main.style.setProperty('height', 'auto')
  inner.style.setProperty('height', 'auto')
  watch.callback([])
  assert.equal(main.values.has('height'), false)
  assert.equal(inner.values.has('height'), false)
  stop()
  assert.equal(watch.disconnected, true)
})

test('a box that has the height already when the watching starts is put right at once, and other styles are not touched', () => {
  observers.length = 0
  const main = box({ height: 'auto', 'overflow': 'hidden' })
  keepLayoutHeights([main])
  assert.equal(main.values.has('height'), false)
  assert.equal(main.values.get('overflow'), 'hidden')
})

test('nothing to watch is nothing to do', () => {
  observers.length = 0
  const stop = keepLayoutHeights([null])
  assert.equal(observers[0].targets.length, 0)
  stop()
})
