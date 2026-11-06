import { Pressable, View } from 'react-native'
import type { StringKey } from '../../i18n'
import { useT } from '../i18n-context'
import { Dialog } from '../overlays'
import { Txt, withAlpha } from '../primitives'
import { useTheme, type ThemeMode } from '../theme'

export interface ThemeDialogProps {
  visible: boolean
  /** The theme in use now: its choice is marked. */
  mode: ThemeMode
  /** A choice (also the one already in use). The host closes the dialog and keeps the theme. */
  onChoose: (mode: ThemeMode) => void
  /** Cancel, the back button and a tap outside: nothing is changed. */
  onCancel: () => void
}

const CHOICES: readonly { mode: ThemeMode; label: StringKey }[] = [
  { mode: 'system', label: 'theme_system' },
  { mode: 'light', label: 'theme_light' },
  { mode: 'dark', label: 'theme_dark' },
]

/** One of the three choices: a ring with a dot in it for the one in use, and the name, 48 dp tall to touch. */
function Choice({ label, checked, onPress, testID }: { label: string; checked: boolean; onPress: () => void; testID: string }) {
  const { palette } = useTheme()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onPress}
      testID={testID}
      android_ripple={{ color: withAlpha(palette.text, 0.133) }}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}
    >
      <View style={{ width: 20, height: 20, marginRight: 16, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', borderColor: checked ? palette.accentText : palette.text2 }}>
        {checked ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette.accentText }} /> : null}
      </View>
      <Txt size={16} style={{ flex: 1 }}>
        {label}
      </Txt>
    </Pressable>
  )
}

/** The theme chooser (MainActivity.chooseTheme): System default, Light and Dark, one of them marked, and Cancel. */
export function ThemeDialog({ visible, mode, onChoose, onCancel }: ThemeDialogProps) {
  const { t } = useT()
  return (
    <Dialog visible={visible} title={t('theme')} onClose={onCancel} actions={[{ label: t('cancel'), onPress: onCancel }]} testID="theme-dialog">
      <View accessibilityRole="radiogroup">
        {CHOICES.map((choice) => (
          <Choice key={choice.mode} label={t(choice.label)} checked={choice.mode === mode} onPress={() => onChoose(choice.mode)} testID={`theme-${choice.mode}`} />
        ))}
      </View>
    </Dialog>
  )
}
