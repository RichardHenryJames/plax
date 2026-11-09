import { ActivityIndicator, View } from 'react-native'
import { useT } from '../i18n-context'
import { Pulse, Txt } from '../primitives'
import { useTheme } from '../theme'
import type { Box } from './layout'

/** Bars the width of lines of text, as the website draws while it translates a card: two for the headline and five for the summary. */
const TITLE_BARS: readonly `${number}%`[] = ['82%', '58%']
const BODY_BARS: readonly `${number}%`[] = ['92%', '98%', '85%', '96%', '70%']
const TITLE_BAR = 26
const BODY_BAR = 14
const GAP = 12

/**
 * What stands where the headline and the summary will be while their translation is on its way, so that the page never shows words in
 * the wrong language meanwhile. It fills the room the two had (`title` down to the end of `body`), never more, and says what it is doing
 * to a screen reader.
 */
export function TranslatingBars({ title, body, hasBody }: { title: Box; body: Box; hasBody: boolean }) {
  const { palette } = useTheme()
  const { t } = useT()
  const bottom = hasBody ? body.top + body.height : title.top + title.height
  return (
    <View
      testID="translating"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('translating')}
      accessibilityState={{ busy: true }}
      style={{ position: 'absolute', left: title.left, top: title.top, width: title.width, height: Math.max(0, bottom - title.top), overflow: 'hidden', paddingTop: 12 }}
    >
      {TITLE_BARS.map((width, index) => (
        <Pulse key={`title${index}`} style={{ width, height: TITLE_BAR, borderRadius: 8, marginBottom: GAP }} />
      ))}
      <View style={{ height: GAP }} />
      {BODY_BARS.map((width, index) => (
        <Pulse key={`body${index}`} style={{ width, height: BODY_BAR, borderRadius: 7, marginBottom: GAP }} />
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <ActivityIndicator size={14} color={palette.accentText} />
        <Txt font="sansMedium" size={12} color="accentText" style={{ marginLeft: 8 }}>
          {t('translating')}
        </Txt>
      </View>
    </View>
  )
}
