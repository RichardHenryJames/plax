import { Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { topicLabel, type Topic } from '../../data/topic'
import { useT } from '../i18n-context'
import { Txt, withAlpha } from '../primitives'
import { useTheme } from '../theme'
import { CornerMenu, Paragraph, useLeading } from './parts'

export interface TopicsScreenProps {
  /** The topics on offer: the website's list, or the built-in one. */
  topics: readonly Topic[]
  /** The topic of the feed now: its card is marked "Reading now". */
  currentTopicId: string
  /** The topics the reader chose for For you (their ids, in the order they are to be named). */
  interests: Iterable<string>
  /** A topic card: the feed shows this topic (and the reader is taken to it). */
  onSelectTopic: (topic: Topic) => void
  /** The For you card: opens the choice of topics. */
  onChooseInterests: () => void
  /** The menu button in the corner (MainActivity's cornerMenu); with no callback no button is drawn. */
  onMenu?: () => void
}

/**
 * The card on the Topics screen that opens the choice of topics for For you (MainActivity.interests): with nothing chosen it invites the
 * choice; with some chosen it names up to two of them and says how many more, and offers to edit them.
 */
function InterestsCard({ topics, interests, onPress }: { topics: readonly Topic[]; interests: Iterable<string>; onPress: () => void }) {
  const { t, lang } = useT()
  const { palette } = useTheme()
  const chosen = [...interests]
  const names: string[] = []
  for (const id of chosen) {
    const topic = topics.find((candidate) => candidate.id === id)
    if (topic) names.push(topicLabel(topic, lang))
  }
  const none = chosen.length === 0
  const title = none ? t('interests_card_empty') : t('interests_title')
  const detail = none ? t('interests_card_detail') : names.length <= 2 ? names.join(', ') : t('interests_summary', names.slice(0, 2).join(', '), names.length - 2)
  const action = none ? t('interests_choose') : t('interests_edit')
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail === '' ? title : `${title}, ${detail}`}
      onPress={onPress}
      testID="interests-card"
      android_ripple={{ color: withAlpha(palette.text, 0.133) }}
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16, borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.accentSoft, overflow: 'hidden' }}
    >
      <View style={{ flex: 1 }}>
        <Txt font="sansMedium" size={15}>
          {title}
        </Txt>
        <Txt size={13} color="text2" style={{ paddingTop: 2 }}>
          {detail}
        </Txt>
      </View>
      <Txt font="sansMedium" size={13} color="accentText" style={{ paddingLeft: 12, paddingVertical: 8 }}>
        {action}
      </Txt>
    </Pressable>
  )
}

/** A topic card (MainActivity.tile): the emoji at the top, the name at the foot, and "Reading now" under it when it is the topic of the feed. */
function TopicTile({ topic, current, last, onPress }: { topic: Topic; current: boolean; last: boolean; onPress: () => void }) {
  const { t, lang } = useT()
  const { palette } = useTheme()
  const label = topicLabel(topic, lang)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: current }}
      onPress={onPress}
      testID={`topic-${topic.id}`}
      android_ripple={{ color: withAlpha(palette.text, 0.133) }}
      // A tile is at least as tall as the native one (96 dp) and grows with its text, so a large text or Hindi is never cut.
      style={{ flex: 1, minHeight: 96, marginBottom: 10, marginRight: last ? 0 : 10, paddingLeft: 14, paddingTop: 12, paddingRight: 14, paddingBottom: 10, borderRadius: 20, borderWidth: 1, overflow: 'hidden', borderColor: current ? palette.accent : palette.border, backgroundColor: current ? palette.accentSoft : palette.surface }}
    >
      <Txt size={26} accessible={false} importantForAccessibility="no">
        {topic.emoji}
      </Txt>
      <View style={{ flexGrow: 1, minHeight: 4 }} />
      <Txt font="sansMedium" size={15} numberOfLines={1}>
        {label}
      </Txt>
      {current ? (
        <Txt font="sansMedium" size={11} color="accentText" style={{ paddingTop: 2 }}>
          {t('topic_current')}
        </Txt>
      ) : null}
    </Pressable>
  )
}

/**
 * The Topics screen (MainActivity's topic scroll): a heading, the For you card, and the topics two to a row. It scrolls under the status
 * bar and the navigation bar, with the phone's insets as padding, and leaves the top clear of the menu button in the corner.
 */
export function TopicsScreen({ topics, currentTopicId, interests, onSelectTopic, onChooseInterests, onMenu }: TopicsScreenProps) {
  const { t } = useT()
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  const leading = useLeading()
  const rows: Topic[][] = []
  for (let index = 0; index < topics.length; index += 2) rows.push(topics.slice(index, index + 2))
  return (
    <View testID="topics-screen" style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24, paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }}
      >
        <Txt font="serifBold" size={28} accessibilityRole="header" style={{ lineHeight: leading(28, 1.1) }}>
          {t('choose_topic')}
        </Txt>
        <Paragraph size={14} multiplier={1} color="text2" style={{ paddingTop: 8, paddingBottom: 16 }}>
          {t('choose_topic_detail')}
        </Paragraph>
        <InterestsCard topics={topics} interests={interests} onPress={onChooseInterests} />
        {rows.map((row) => (
          // A plain row: both tiles stretch to the taller one's height.
          <View key={row[0].id} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
            {row.map((topic, column) => (
              <TopicTile key={topic.id} topic={topic} current={topic.id === currentTopicId} last={column === 1} onPress={() => onSelectTopic(topic)} />
            ))}
            {row.length === 1 ? <View style={{ flex: 1, marginBottom: 10 }} /> : null}
          </View>
        ))}
      </ScrollView>
      {onMenu ? <CornerMenu onPress={onMenu} /> : null}
    </View>
  )
}
