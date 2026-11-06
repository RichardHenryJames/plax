import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, BackHandler, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Txt } from './primitives'
import { useTheme } from './theme'
import { createContext, useContext } from 'react'
import { animationsEnabled } from './motion'

export { setAnimationsEnabled } from './motion'

/** Runs `handler` for the phone's back button while `active`; the most recently activated one runs first, and it consumes the press. */
export function useBackHandler(active: boolean, handler: () => void): void {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    if (!active) return undefined
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      latest.current()
      return true
    })
    return () => subscription.remove()
  }, [active])
}

/** 0 → 1 while `visible` becomes true, 1 → 0 when it becomes false; `mounted` stays true until the way out has finished. */
function useTransition(visible: boolean, durationMs: number): { progress: Animated.Value; mounted: boolean } {
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current
  const [mounted, setMounted] = useState(visible)
  useEffect(() => {
    if (visible) {
      setMounted(true)
      if (!animationsEnabled()) progress.setValue(1)
      else Animated.timing(progress, { toValue: 1, duration: durationMs, useNativeDriver: true }).start()
      return undefined
    }
    if (!animationsEnabled()) {
      progress.setValue(0)
      setMounted(false)
      return undefined
    }
    const animation = Animated.timing(progress, { toValue: 0, duration: durationMs * 0.8, useNativeDriver: true })
    animation.start(({ finished }) => {
      if (finished) setMounted(false)
    })
    return () => animation.stop()
  }, [visible, durationMs, progress])
  return { progress, mounted: mounted || visible }
}

/** The dimmed screen behind an overlay; a press on it closes the overlay. Without a label it is not offered to a screen reader (the overlay has its own buttons). */
function Scrim({ progress, onPress, label }: { progress: Animated.Value; onPress: () => void; label?: string }) {
  const { palette } = useTheme()
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim, opacity: progress }]}>
      <Pressable
        accessible={label !== undefined}
        importantForAccessibility={label === undefined ? 'no' : 'auto'}
        accessibilityRole={label === undefined ? undefined : 'button'}
        accessibilityLabel={label}
        style={StyleSheet.absoluteFill}
        onPress={onPress}
        testID="scrim"
      />
    </Animated.View>
  )
}

/** A sheet that rises from the foot of the screen, over the story: the account, Go deeper, Contact us, the topics for For you. */
export function Sheet({ visible, onClose, children, closeLabel, testID }: { visible: boolean; onClose: () => void; children: ReactNode; closeLabel: string; testID?: string }) {
  const { palette } = useTheme()
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { progress, mounted } = useTransition(visible, 260)
  useBackHandler(visible, onClose)
  if (!mounted) return null
  const maxHeight = height - insets.top - 24
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID={testID}>
      <Scrim progress={progress} onPress={onClose} label={closeLabel} />
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]} pointerEvents="box-none">
        <Animated.View
          style={{
            maxHeight,
            backgroundColor: palette.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingBottom: insets.bottom,
            overflow: 'hidden',
            transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [maxHeight, 0] }) }],
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }} accessible={false} importantForAccessibility="no-hide-descendants">
            <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: palette.border }} />
          </View>
          {children}
        </Animated.View>
      </View>
    </View>
  )
}

/** A panel that slides in from the left over the screen, with a dimmed screen beside it: the menu. */
export function SidePanel({ visible, onClose, children, closeLabel, width, testID }: { visible: boolean; onClose: () => void; children: ReactNode; closeLabel: string; width?: number; testID?: string }) {
  const { palette } = useTheme()
  const window = useWindowDimensions()
  const { progress, mounted } = useTransition(visible, 240)
  useBackHandler(visible, onClose)
  if (!mounted) return null
  const panelWidth = width ?? Math.min(window.width * 0.86, 360)
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID={testID}>
      <Scrim progress={progress} onPress={onClose} label={closeLabel} />
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: panelWidth,
          backgroundColor: palette.surface,
          transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-panelWidth, 0] }) }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  )
}

export interface DialogAction {
  label: string
  onPress: () => void
}

/** A centred question or message with one to three text buttons: the notice, the update, clear saved, delete the account, the theme. */
export function Dialog({ visible, title, message, children, actions, onClose, testID }: { visible: boolean; title?: string; message?: string; children?: ReactNode; actions: DialogAction[]; onClose: () => void; testID?: string }) {
  const { palette } = useTheme()
  const { progress, mounted } = useTransition(visible, 180)
  useBackHandler(visible, onClose)
  if (!mounted) return null
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID={testID}>
      <Scrim progress={progress} onPress={onClose} />
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', padding: 24 }]} pointerEvents="box-none">
        <Animated.View
          accessibilityRole="alert"
          style={{ width: '100%', maxWidth: 560, backgroundColor: palette.surface, borderRadius: 28, padding: 24, opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}
        >
          {title ? (
            <Txt font="serif" size={20} accessibilityRole="header" style={{ marginBottom: 12 }}>
              {title}
            </Txt>
          ) : null}
          {message ? (
            <Txt size={15} color="text2" style={{ lineHeight: 22 }}>
              {message}
            </Txt>
          ) : null}
          {children}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 20, columnGap: 8 }}>
            {actions.map((action) => (
              <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={{ minHeight: 48, paddingHorizontal: 12, justifyContent: 'center' }}>
                <Txt font="sansMedium" size={14} color="accentText">
                  {action.label}
                </Txt>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </View>
  )
}

export interface ToastApi {
  /** Shows a short message at the foot of the screen; `long` keeps it a little longer (for something the reader must read). */
  show(message: string, long?: boolean): void
}

const ToastContext = createContext<ToastApi>({ show: () => undefined })

export const useToast = (): ToastApi => useContext(ToastContext)

/** Shows the messages the app gives the reader in passing ("Saved on this phone"). They are live regions, so a screen reader says them. */
export function ToastProvider({ children, bottomOffset = 72 }: { children: ReactNode; bottomOffset?: number }) {
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = useCallback((text: string, long = false) => {
    if (timer.current) clearTimeout(timer.current)
    setMessage(text)
    timer.current = setTimeout(() => setMessage(null), long ? 3500 : 2000)
  }, [])
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), [])
  const api = useRef<ToastApi>({ show }).current
  return (
    <ToastContext.Provider value={api}>
      {children}
      {message ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: insets.bottom + bottomOffset }]}>
          <View accessibilityLiveRegion="polite" testID="toast" style={{ maxWidth: '88%', backgroundColor: palette.text, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12 }}>
            <Txt size={14} color={palette.bg}>
              {message}
            </Txt>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  )
}
