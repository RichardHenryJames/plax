import { Component, type ReactNode } from 'react'
import { Appearance, Pressable, Text, View } from 'react-native'
import { detectLanguage } from '../data/language'
import { translate } from '../i18n'
import { DARK_PALETTE, LIGHT_PALETTE } from '../ui/theme'

interface Props {
  readonly children: ReactNode
  /** The reader pressed Try again: whatever the screen was holding is let go before it is drawn again. */
  readonly onReset?: () => void
}

interface State {
  readonly failed: boolean
}

/**
 * The last line of defence: a screen that fails while it is drawn leaves the reader with a plain page and a button, not a closed app.
 * It depends on nothing the rest of the app provides (no theme, no language provider, no safe-area context): those may be what failed.
 * Nothing is logged or sent anywhere.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  private readonly reset = () => {
    this.props.onReset?.()
    this.setState({ failed: false })
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    const lang = detectLanguage()
    const palette = Appearance.getColorScheme() === 'dark' ? DARK_PALETTE : LIGHT_PALETTE
    return (
      <View testID="crash-page" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: palette.bg }}>
        <Text accessibilityRole="header" style={{ fontFamily: 'serif', fontWeight: '700', fontSize: 22, color: palette.text, textAlign: 'center', paddingBottom: 8 }}>
          {translate(lang, 'app_name')}
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: palette.text2, textAlign: 'center' }}>{translate(lang, 'service_error')}</Text>
        <Pressable
          testID="crash-retry"
          accessibilityRole="button"
          onPress={this.reset}
          style={{ marginTop: 24, minHeight: 48, paddingHorizontal: 28, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accent }}
        >
          <Text style={{ fontWeight: '500', fontSize: 15, color: palette.onAccent }}>{translate(lang, 'retry')}</Text>
        </Pressable>
      </View>
    )
  }
}
