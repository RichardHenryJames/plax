import { act, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { createStore, useStore } from '../store'
import { fakeClock } from '../../platform/clock'

describe('createStore', () => {
  it('merges a patch, replaces the state, and tells the listeners', () => {
    const store = createStore({ a: 1, b: 'x' })
    const seen: number[] = []
    const stop = store.subscribe(() => seen.push(store.getState().a))
    store.setState({ a: 2 })
    store.setState((state) => ({ a: state.a + 1 }))
    expect(store.getState()).toEqual({ a: 3, b: 'x' })
    store.replaceState({ a: 9, b: 'y' })
    expect(seen).toEqual([2, 3, 9])
    stop()
    store.setState({ a: 10 })
    expect(seen).toEqual([2, 3, 9])
  })

  it('lets a listener stop itself while it is being told', () => {
    const store = createStore({ n: 0 })
    let calls = 0
    const stop = store.subscribe(() => {
      calls++
      stop()
    })
    store.setState({ n: 1 })
    store.setState({ n: 2 })
    expect(calls).toBe(1)
  })
})

describe('useStore', () => {
  it('renders the selected part and renders again when it changes', () => {
    const store = createStore({ count: 1, other: 'a' })
    let renders = 0
    function Counter() {
      renders++
      return <Text>{`count ${useStore(store, (state) => state.count)}`}</Text>
    }
    render(<Counter />)
    expect(screen.getByText('count 1')).toBeTruthy()
    act(() => store.setState({ count: 2 }))
    expect(screen.getByText('count 2')).toBeTruthy()
    const before = renders
    act(() => store.setState({ other: 'b' }))
    expect(renders).toBe(before)
  })
})

describe('fakeClock', () => {
  it('stands still until moved', () => {
    const clock = fakeClock(1000)
    expect(clock()).toBe(1000)
    clock.advance(500)
    expect(clock()).toBe(1500)
    clock.set(7)
    expect(clock()).toBe(7)
  })
})
