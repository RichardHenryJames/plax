import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { FlatList, Text } from 'react-native'
import { Pager, pageAt, type PagerHandle } from '../Pager'

const items = Array.from({ length: 12 }, (_, index) => ({ id: `s${index}` }))

function setup(props: { index?: number; onIndexChange?: jest.Mock; onEndReached?: jest.Mock; count?: number } = {}) {
  const onIndexChange = props.onIndexChange ?? jest.fn()
  const ref = createRef<PagerHandle>()
  const view = render(
    <Pager ref={ref} items={items.slice(0, props.count ?? 12)} index={props.index ?? 0} onIndexChange={onIndexChange} onEndReached={props.onEndReached} renderPage={(item, at) => <Text>{`page ${at} ${item.id}`}</Text>} testID="pager" />,
  )
  fireEvent(screen.getByTestId('pager'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } } })
  return { onIndexChange, ref, ...view }
}

describe('which page a scroll is on', () => {
  it('is the nearest, within the list', () => {
    expect(pageAt(0, 800, 12)).toBe(0)
    expect(pageAt(399, 800, 12)).toBe(0)
    expect(pageAt(401, 800, 12)).toBe(1)
    expect(pageAt(800 * 11, 800, 12)).toBe(11)
    expect(pageAt(99999, 800, 12)).toBe(11)
    expect(pageAt(-50, 800, 12)).toBe(0)
    expect(pageAt(100, 0, 12)).toBe(0)
    expect(pageAt(100, 800, 0)).toBe(0)
  })
})

describe('the pager', () => {
  it('shows nothing until it knows its size, then the page it is on', () => {
    render(<Pager items={items} index={0} onIndexChange={jest.fn()} renderPage={(item) => <Text>{item.id}</Text>} testID="pager" />)
    expect(screen.queryByText('s0')).toBeNull()
    fireEvent(screen.getByTestId('pager'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } } })
    expect(screen.getByText('s0')).toBeTruthy()
  })

  it('gives each page its size', () => {
    const sizes: unknown[] = []
    render(<Pager items={items.slice(0, 2)} index={0} onIndexChange={jest.fn()} renderPage={(item, _at, size) => { sizes.push(size); return <Text>{item.id}</Text> }} testID="pager" />)
    fireEvent(screen.getByTestId('pager'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } } })
    expect(sizes[0]).toEqual({ width: 400, height: 800 })
  })

  it('pages one under the other, one swipe each, with nothing to scroll sideways or show as a bar', () => {
    setup()
    const list = screen.UNSAFE_getByType(FlatList)
    expect(list.props.pagingEnabled).toBe(true)
    expect(list.props.snapToInterval).toBe(800)
    expect(list.props.disableIntervalMomentum).toBe(true)
    expect(list.props.showsVerticalScrollIndicator).toBe(false)
    expect(list.props.getItemLayout(null, 3)).toEqual({ length: 800, offset: 2400, index: 3 })
  })

  it('reports the page the reader swiped to, once', () => {
    const { onIndexChange } = setup()
    const list = screen.UNSAFE_getByType(FlatList)
    act(() => list.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 0, y: 800 } } }))
    expect(onIndexChange).toHaveBeenCalledTimes(1)
    expect(onIndexChange).toHaveBeenCalledWith(1)
    act(() => list.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 0, y: 810 } } }))
    expect(onIndexChange).toHaveBeenCalledTimes(1)
  })

  it('takes a slow drag that ends where it stands as a swipe too', () => {
    const { onIndexChange } = setup()
    const list = screen.UNSAFE_getByType(FlatList)
    act(() => list.props.onScrollEndDrag({ nativeEvent: { contentOffset: { x: 0, y: 1600 }, velocity: { x: 0, y: 0 } } }))
    expect(onIndexChange).toHaveBeenCalledWith(2)
  })

  it('moves to the page the owner asks for, and does not report that move as a swipe', () => {
    const onIndexChange = jest.fn()
    const view = setup({ onIndexChange })
    const scroll = jest.spyOn(screen.UNSAFE_getByType(FlatList).instance as FlatList<unknown>, 'scrollToOffset')
    view.rerender(<Pager items={items} index={5} onIndexChange={onIndexChange} renderPage={(item, at) => <Text>{`page ${at} ${item.id}`}</Text>} testID="pager" />)
    expect(scroll).toHaveBeenCalledWith({ offset: 4000, animated: false })
    expect(onIndexChange).not.toHaveBeenCalled()
  })

  it('moves when told to by the one that holds it', () => {
    const { ref } = setup()
    const scroll = jest.spyOn(screen.UNSAFE_getByType(FlatList).instance as FlatList<unknown>, 'scrollToOffset')
    act(() => ref.current?.scrollTo(3, true))
    expect(scroll).toHaveBeenCalledWith({ offset: 2400, animated: true })
    act(() => ref.current?.scrollTo(99, false))
    expect(scroll).toHaveBeenLastCalledWith({ offset: 800 * 11, animated: false })
  })

  it('asks for more when the reader is near the end', () => {
    const onEndReached = jest.fn()
    setup({ onEndReached })
    act(() => screen.UNSAFE_getByType(FlatList).props.onEndReached({ distanceFromEnd: 100 }))
    expect(onEndReached).toHaveBeenCalledTimes(1)
  })

  it('has no page to go to when it has no items', () => {
    const { ref, onIndexChange } = setup({ count: 0 })
    act(() => ref.current?.scrollTo(2))
    expect(onIndexChange).not.toHaveBeenCalled()
  })
})
