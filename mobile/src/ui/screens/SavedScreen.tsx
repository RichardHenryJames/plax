import { FlatList, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { bodyOf, type Story } from '../../data/story'
import { Icon } from '../Icon'
import { useT } from '../i18n-context'
import { DangerButton, Txt, withAlpha } from '../primitives'
import { useTheme } from '../theme'
import { EmptyPanel } from './FeedStates'
import { CornerMenu, useLeading } from './parts'

export interface SavedScreenProps {
  /** The saved stories, the newest saved first or in whatever order the reader should see them. */
  stories: readonly Story[]
  /** The saved stories cannot be changed now: they have not been read yet, or a change is being written (StoryAdapter's `saving` / `!storageReady`). */
  busy?: boolean
  /** A story's card: read it (its place in the list, for a pager that starts there). */
  onOpen: (story: Story, index: number) => void
  /** The bookmark of a story: take it off the saved stories. */
  onRemove: (story: Story) => void
  /** "Clear saved stories": the host asks first (ClearSavedDialog), then clears. */
  onClear: () => void
  onMenu?: () => void
}

function SavedCard({ story, index, busy, onOpen, onRemove }: { story: Story; index: number; busy: boolean; onOpen: SavedScreenProps['onOpen']; onRemove: SavedScreenProps['onRemove'] }) {
  const { t } = useT()
  const { palette } = useTheme()
  const leading = useLeading()
  const body = bodyOf(story)
  return (
    <View
      testID={`saved-${story.id}`}
      style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, overflow: 'hidden' }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => onOpen(story, index)}
        testID={`saved-open-${story.id}`}
        android_ripple={{ color: withAlpha(palette.text, 0.133) }}
        style={{ flex: 1, paddingLeft: 16, paddingTop: 14, paddingBottom: 14, paddingRight: 4 }}
      >
        <Txt font="sansMedium" size={12} color="text2">
          {story.source === '' ? t('source_unknown') : story.source}
        </Txt>
        <Txt font="serifBold" size={18} style={{ paddingTop: 6, lineHeight: leading(18, 1.1) }}>
          {story.title}
        </Txt>
        {body === '' ? null : (
          <Txt size={14} color="text2" numberOfLines={3} style={{ paddingTop: 6, lineHeight: leading(14, 1.2) }}>
            {body}
          </Txt>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('unsave_description')}
        accessibilityHint={story.title}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => onRemove(story)}
        testID={`saved-remove-${story.id}`}
        android_ripple={{ color: withAlpha(palette.text, 0.133), borderless: true, radius: 18 }}
        // The same bookmark as on the story: the 36 dp circle in a 44 by 48 dp touch target.
        style={{ width: 44, height: 48, marginTop: 6, marginRight: 4, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceAlt }}>
          <Icon name="bookmark_filled" size={20} color={palette.accentText} />
        </View>
      </Pressable>
    </View>
  )
}

/**
 * The saved stories as a list, and the page for when there are none. In the native app Saved is the pager showing the saved stories, and
 * this is its empty page ("Keep the good reads." with a bookmark); the list is for a host that wants one. It scrolls under the status
 * bar and the navigation bar, with the phone's insets as padding, and leaves the top clear of the menu button in the corner.
 */
export function SavedScreen({ stories, busy = false, onOpen, onRemove, onClear, onMenu }: SavedScreenProps) {
  const { t } = useT()
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  if (stories.length === 0) return <EmptyPanel icon="bookmark" title={t('empty_saved')} detail={t('empty_saved_detail')} onMenu={onMenu} testID="saved-empty" />
  return (
    <View testID="saved-screen" style={{ flex: 1, backgroundColor: palette.bg }}>
      <FlatList
        data={stories}
        keyExtractor={(story) => story.id}
        renderItem={({ item, index }) => <SavedCard story={item} index={index} busy={busy} onOpen={onOpen} onRemove={onRemove} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24, paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }}
        ListHeaderComponent={
          <Txt font="serifBold" size={28} accessibilityRole="header" style={{ paddingBottom: 16 }}>
            {t('saved')}
          </Txt>
        }
        ListFooterComponent={
          <View style={{ paddingTop: 8 }}>
            <DangerButton label={t('clear_saved')} onPress={onClear} testID="saved-clear" />
          </View>
        }
      />
      {onMenu ? <CornerMenu onPress={onMenu} /> : null}
    </View>
  )
}
