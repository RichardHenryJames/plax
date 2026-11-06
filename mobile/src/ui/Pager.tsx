import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactElement, type Ref } from 'react'
import { FlatList, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'

export interface PagerItem {
  readonly id: string
}

export interface PageSize {
  readonly width: number
  readonly height: number
}

export interface PagerHandle {
  /** Moves to a page, at once or with the scroll. */
  scrollTo(index: number, animated?: boolean): void
}

export interface PagerProps<T extends PagerItem> {
  readonly items: readonly T[]
  /** The page that is shown. A change from outside (the engine says to start over, a saved position is restored) moves the pager there. */
  readonly index: number
  /** The reader swiped to this page. */
  readonly onIndexChange: (index: number) => void
  /** The reader is near the last pages: more can be asked for. */
  readonly onEndReached?: () => void
  /** A finger is on the pager, or it is still gliding to its page (true), or it is at rest (false). Pages are put in and taken out only at rest. */
  readonly onMovingChange?: (moving: boolean) => void
  readonly renderPage: (item: T, index: number, size: PageSize) => ReactElement
  readonly testID?: string
}

/** The page nearest to a scroll offset. */
export const pageAt = (offset: number, height: number, count: number): number => (height <= 0 || count <= 0 ? 0 : Math.max(0, Math.min(count - 1, Math.round(offset / height))))

function PagerInner<T extends PagerItem>({ items, index, onIndexChange, onEndReached, onMovingChange, renderPage, testID }: PagerProps<T>, ref: Ref<PagerHandle>) {
  const [size, setSize] = useState<PageSize | null>(null)
  const list = useRef<FlatList<T>>(null)
  // The page the pager is showing, as far as it knows: what stops a change it reports from being taken as one that was asked for.
  const shown = useRef(index)
  // How tall the list has been laid out, and a page asked for that it was not yet tall enough to reach (a longer list is on its way).
  const content = useRef(0)
  const pending = useRef<number | null>(null)
  const moving = useRef(false)

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setSize((previous) => (previous && previous.width === width && previous.height === height ? previous : { width, height }))
  }, [])

  const scrollTo = useCallback(
    (target: number, animated = false) => {
      if (!size || items.length === 0) return
      const clamped = Math.max(0, Math.min(items.length - 1, target))
      shown.current = clamped
      const offset = clamped * size.height
      // A scroll past the end of what is laid out would stop at the end, so it waits for the list to grow to the page.
      if (content.current > 0 && content.current < offset + size.height) {
        pending.current = clamped
        return
      }
      pending.current = null
      list.current?.scrollToOffset({ offset, animated })
    },
    [size, items.length],
  )
  useImperativeHandle(ref, () => ({ scrollTo }), [scrollTo])

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      content.current = height
      const target = pending.current
      if (target === null || !size) return
      if (height >= (target + 1) * size.height) {
        pending.current = null
        list.current?.scrollToOffset({ offset: target * size.height, animated: false })
      }
    },
    [size],
  )

  const setMoving = useCallback(
    (next: boolean) => {
      if (moving.current === next) return
      moving.current = next
      onMovingChange?.(next)
    },
    [onMovingChange],
  )

  // Moves to the page the owner asks for, unless the pager is already there.
  useEffect(() => {
    if (size && index !== shown.current) scrollTo(index, false)
  }, [index, size, scrollTo])

  // A new size (the phone turned) keeps the page.
  useEffect(() => {
    if (size) list.current?.scrollToOffset({ offset: shown.current * size.height, animated: false })
  }, [size?.height, size?.width]) // eslint-disable-line react-hooks/exhaustive-deps

  const settle = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setMoving(false)
      if (!size) return
      const next = pageAt(event.nativeEvent.contentOffset.y, size.height, items.length)
      if (next !== shown.current) {
        shown.current = next
        onIndexChange(next)
      }
    },
    [size, items.length, onIndexChange, setMoving],
  )

  return (
    <View style={{ flex: 1 }} onLayout={onLayout} testID={testID}>
      {size && size.height > 0 ? (
        <FlatList
          ref={list}
          data={items as T[]}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index: at }) => renderPage(item, at, size)}
          getItemLayout={(_, at) => ({ length: size.height, offset: size.height * at, index: at })}
          initialScrollIndex={Math.min(Math.max(0, shown.current), Math.max(0, items.length - 1))}
          pagingEnabled
          snapToInterval={size.height}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          windowSize={5}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          updateCellsBatchingPeriod={30}
          removeClippedSubviews={false}
          onContentSizeChange={onContentSizeChange}
          onScrollBeginDrag={() => setMoving(true)}
          onMomentumScrollEnd={settle}
          onScrollEndDrag={(event) => {
            // A drag that ends with no momentum (a slow, short one) stops where it stands.
            if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) settle(event)
          }}
          onEndReached={onEndReached}
          onEndReachedThreshold={2}
          onScrollToIndexFailed={() => undefined}
        />
      ) : null}
    </View>
  )
}

/** Pages one under the other, one swipe to the next, each as large as the pager. The native app's RecyclerView with a snap helper. */
export const Pager = forwardRef(PagerInner) as <T extends PagerItem>(props: PagerProps<T> & { ref?: Ref<PagerHandle> }) => ReactElement
