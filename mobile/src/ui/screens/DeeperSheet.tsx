import { Text, View, type TextStyle } from 'react-native'
import { parseMarkdown } from '../../data/markdown'
import type { Lang, StringKey } from '../../i18n'
import { useT } from '../i18n-context'
import { Chip, PrimaryButton, Pulse, Txt } from '../primitives'
import { useTheme } from '../theme'
import { Paragraph, SheetFrame, useLeading } from './parts'

/** What Go deeper has to show: it is being asked for, it failed, or here are the facts (each one a short text with **bold**, *italic* and "* " bullets). */
export type DeeperView =
  | { readonly status: 'loading' }
  /** `message` is the string of the reason; Go deeper has one reason for every failure (deeper_error). */
  | { readonly status: 'error'; readonly message?: StringKey }
  | { readonly status: 'content'; readonly insights: readonly string[] }

export interface DeeperSheetProps {
  visible: boolean
  /** The language the facts are asked for or shown in: its chip is selected. */
  language: Lang
  view: DeeperView
  /** The other language's chip: the host shows what it has for it, or asks. Never called for the language that is already chosen. */
  onLanguage: (lang: Lang) => void
  /** "Try again", under the error. */
  onRetry: () => void
  /** The cross, the back button and a tap outside: the host cancels a request still on its way. */
  onClose: () => void
}

const BOLD: TextStyle = { fontWeight: '700' }
const ITALIC: TextStyle = { fontStyle: 'italic' }

/** One insight in a card of its own, numbered, as on the website; its text can be selected. */
function Insight({ text, number }: { text: string; number: number }) {
  const { palette } = useTheme()
  const leading = useLeading()
  return (
    <View testID={`insight-${number}`} style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 12, marginBottom: 10, borderRadius: 14, backgroundColor: palette.surfaceAlt }}>
      <View testID={`insight-badge-${number}`} style={{ width: 24, height: 24, marginTop: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentSoft }}>
        <Txt font="sansMedium" size={11} color="accentText">
          {String(number)}
        </Txt>
      </View>
      <Txt size={16} selectable style={{ flex: 1, marginLeft: 12, lineHeight: leading(16, 1.35) }}>
        {parseMarkdown(text).map((span, index) => (
          <Text key={index} style={span.bold ? BOLD : span.italic ? ITALIC : undefined}>
            {span.text}
          </Text>
        ))}
      </Txt>
    </View>
  )
}

/** "Finding more…" and five blocks that pulse where the lines will be. */
function Loading() {
  const { t } = useT()
  return (
    <View testID="deeper-loading">
      <Txt size={14} color="text2" accessibilityLiveRegion="polite">
        {t('deeper_loading')}
      </Txt>
      {(['100%', '100%', '100%', '100%', 200] as const).map((width, index) => (
        <Pulse key={index} style={{ width, height: 14, marginTop: 12, borderRadius: 6 }} />
      ))}
    </View>
  )
}

function Failure({ message, onRetry }: { message: StringKey; onRetry: () => void }) {
  const { t } = useT()
  return (
    <View testID="deeper-error">
      <Paragraph size={14} multiplier={1.25} color="text2" accessibilityLiveRegion="polite">
        {t(message)}
      </Paragraph>
      <View style={{ marginTop: 16, alignSelf: 'flex-start' }}>
        <PrimaryButton label={t('retry')} onPress={onRetry} testID="deeper-retry" />
      </View>
    </View>
  )
}

/**
 * Go deeper (DeeperSheet of the native app): a sheet with a few short facts that build on one story, in English or Hindi. The title bar
 * and the two language chips stay put; the facts scroll, with the note that they were written by AI under them. Asking for the facts,
 * keeping the ones already written and abandoning a request are the host's (see loadDeeper in src/data/deeper-api.ts).
 */
export function DeeperSheet({ visible, language, view, onLanguage, onRetry, onClose }: DeeperSheetProps) {
  const { t } = useT()
  const choose = (lang: Lang) => {
    if (lang !== language) onLanguage(lang)
  }
  return (
    <SheetFrame
      visible={visible}
      onClose={onClose}
      icon="sparkle"
      title={t('go_deeper')}
      testID="deeper-sheet"
      bottomPadding={20}
      top={
        <View style={{ flexDirection: 'row' }}>
          <View style={{ marginRight: 8 }}>
            <Chip label={t('language_english')} selected={language === 'en'} onPress={() => choose('en')} testID="deeper-english" />
          </View>
          <Chip label={t('language_hindi')} selected={language === 'hi'} onPress={() => choose('hi')} testID="deeper-hindi" />
        </View>
      }
      bottom={
        <Paragraph size={11} multiplier={1.25} color="text2">
          {t('deeper_note')}
        </Paragraph>
      }
    >
      <View style={{ paddingVertical: 8 }}>
        {view.status === 'loading' ? <Loading /> : null}
        {view.status === 'error' ? <Failure message={view.message ?? 'deeper_error'} onRetry={onRetry} /> : null}
        {view.status === 'content' ? view.insights.map((insight, index) => <Insight key={index} text={insight} number={index + 1} />) : null}
      </View>
    </SheetFrame>
  )
}
