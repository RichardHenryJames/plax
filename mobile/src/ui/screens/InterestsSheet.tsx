import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { topicLabel, type Topic } from '../../data/topic'
import { Icon } from '../Icon'
import { useT } from '../i18n-context'
import { PrimaryButton, Txt, withAlpha } from '../primitives'
import { useTheme } from '../theme'
import { Paragraph, SheetFrame } from './parts'

export interface InterestsSheetProps {
  visible: boolean
  /** The topics on offer (the website's list, or the built-in one). */
  topics: readonly Topic[]
  /** The topics chosen now (ids): what the sheet opens with. Nothing is kept until the reader saves. */
  selected: Iterable<string>
  /**
   * Save topics: the known topics that were picked, in a fixed order (by id), so that one choice always makes the same request. It is
   * never called with no topic. The sheet asks to be closed right after (`onClose`), as the native sheet dismissed itself.
   */
  onSave: (topicIds: string[]) => void
  /** The cross, the back button and a tap outside ask for this; so does a save. */
  onClose: () => void
}

function InterestTile({ topic, on, last, onPress }: { topic: Topic; on: boolean; last: boolean; onPress: () => void }) {
  const { t, lang } = useT()
  const { palette } = useTheme()
  const label = topicLabel(topic, lang)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      accessibilityValue={on ? { text: t('topic_selected') } : undefined}
      onPress={onPress}
      testID={`interest-${topic.id}`}
      android_ripple={{ color: withAlpha(palette.text, 0.133) }}
      style={{ flex: 1, minHeight: 56, marginBottom: 10, marginRight: last ? 0 : 10, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 12, borderRadius: 16, borderWidth: 1, overflow: 'hidden', borderColor: on ? palette.accent : palette.border, backgroundColor: on ? palette.accentSoft : palette.surface }}
    >
      <Txt size={20} accessible={false} importantForAccessibility="no">
        {topic.emoji}
      </Txt>
      <Txt font="sansMedium" size={14} numberOfLines={1} style={{ flex: 1, paddingLeft: 10, paddingRight: 6 }}>
        {label}
      </Txt>
      <View style={{ opacity: on ? 1 : 0 }}>
        <Icon name="check_circle" size={20} color={palette.accentText} />
      </View>
    </Pressable>
  )
}

/**
 * The choice of the topics that fill For you (InterestsSheet of the native app): a sheet 86% of the screen tall, so that the topics scroll
 * inside it and the count and the save button under them are always in reach. Saving needs at least one topic.
 */
export function InterestsSheet({ visible, topics, selected, onSave, onClose }: InterestsSheetProps) {
  const { t } = useT()
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(selected))
  const [wasVisible, setWasVisible] = useState(visible)
  // Each time the sheet opens it starts from what is chosen now, whatever was ticked and not saved before.
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) setChosen(new Set(selected))
  }
  const toggle = (id: string) =>
    setChosen((before) => {
      const next = new Set(before)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const save = () => {
    if (chosen.size === 0) return
    const known = new Set(topics.map((topic) => topic.id))
    onSave([...chosen].map((id) => id.trim()).filter((id) => known.has(id)).sort())
    onClose()
  }
  const rows: Topic[][] = []
  for (let index = 0; index < topics.length; index += 2) rows.push(topics.slice(index, index + 2))
  return (
    <SheetFrame
      visible={visible}
      onClose={onClose}
      icon="star"
      title={t('interests_title')}
      testID="interests-sheet"
      heightShare={0.86}
      bottomPadding={16}
      top={
        <Paragraph size={14} multiplier={1} color="text2" style={{ paddingTop: 4, paddingBottom: 12 }}>
          {t('interests_detail')}
        </Paragraph>
      }
      bottom={
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 12 }}>
          <Txt font="sansMedium" size={14} color="text2" accessibilityLiveRegion="polite" testID="interests-count" style={{ flex: 1, paddingRight: 12 }}>
            {chosen.size === 0 ? t('interests_none') : t('interests_selected', chosen.size)}
          </Txt>
          <PrimaryButton label={t('interests_save')} onPress={save} disabled={chosen.size === 0} testID="interests-save" />
        </View>
      }
    >
      {rows.map((row) => (
        <View key={row[0].id} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
          {row.map((topic, column) => (
            <InterestTile key={topic.id} topic={topic} on={chosen.has(topic.id)} last={column === 1} onPress={() => toggle(topic.id)} />
          ))}
          {row.length === 1 ? <View style={{ flex: 1, marginBottom: 10 }} /> : null}
        </View>
      ))}
    </SheetFrame>
  )
}
