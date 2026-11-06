import { ActivityIndicator, Pressable, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { StringKey } from '../../i18n'
import { Icon, type IconName } from '../Icon'
import { useT } from '../i18n-context'
import { PrimaryButton, SecondaryButton, SkeletonCard, Txt, withAlpha } from '../primitives'
import { useTheme } from '../theme'
import { CornerMenu, FitScroll, Paragraph, type FeedScreen } from './parts'

/** The words of a line over the stories (the same shape as `Banner` of the feed engine's feedBanner()). */
export interface BannerView {
  readonly key: StringKey
  /** Tapping the line tries again: it names a failure to load stories. */
  readonly retryable: boolean
}

/**
 * The line at the top of a feed (MainActivity's bannerMessage): why the stories are not as they should be, or that more are on their way,
 * or that the reader has reached the end. These are also the "load more" states: "Finding more stories…", "You are caught up. Refresh
 * for new stories.", and a failure, which is a button that says so to a screen reader ("… Retry loading more"). With no banner it is not there.
 */
export function FeedBanner({ banner, onRetry }: { banner: BannerView | null; onRetry: () => void }) {
  const { t } = useT()
  const insets = useSafeAreaInsets()
  if (!banner) return null
  const message = t(banner.key)
  const spacing = { paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right, paddingTop: insets.top + 6, paddingBottom: 6 }
  if (!banner.retryable) {
    return (
      <View testID="feed-banner" style={spacing}>
        <Txt font="sansMedium" size={12} color="accentText" accessibilityLiveRegion="polite">
          {message}
        </Txt>
      </View>
    )
  }
  return (
    <Pressable
      testID="feed-banner"
      accessibilityRole="button"
      accessibilityLabel={`${message} ${t('retry_more')}`}
      accessibilityLiveRegion="polite"
      onPress={onRetry}
      // The strip is 12 sp of text in a few dp of padding: the touch area is taller than what is drawn.
      hitSlop={{ top: 10, bottom: 10 }}
      style={spacing}
    >
      <Txt font="sansMedium" size={12} color="accentText">
        {message}
      </Txt>
    </Pressable>
  )
}

/** The sign that stories are being looked for, where the old header's refresh button was: top right, small, on dark glass. */
export function RefreshSpinner({ visible }: { visible: boolean }) {
  const { t } = useT()
  const insets = useSafeAreaInsets()
  if (!visible) return null
  return (
    <View
      testID="refresh-spinner"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('refreshing')}
      accessibilityState={{ busy: true }}
      pointerEvents="none"
      style={{ position: 'absolute', top: insets.top + 12, right: insets.right + 16, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,12,16,0.55)' }}
    >
      <ActivityIndicator size={22} color="#FFFFFF" />
    </View>
  )
}

/** "New stories": a pill at the top centre that brings the reader to the stories found while they read. */
export function NewStoriesPill({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const { t } = useT()
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  if (!visible) return null
  return (
    <View testID="new-stories-slot" pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 12, left: 0, right: 0, alignItems: 'center' }}>
      <Pressable
        testID="new-stories-pill"
        accessibilityRole="button"
        accessibilityLabel={t('new_stories_description')}
        accessibilityLiveRegion="polite"
        onPress={onPress}
        android_ripple={{ color: withAlpha(palette.text, 0.133) }}
        // Drawn 10 dp above and below its text, as it was; the touch area is 48 dp tall.
        hitSlop={{ top: 6, bottom: 6 }}
        style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 18, paddingVertical: 10, borderRadius: 24, backgroundColor: palette.accent, elevation: 6, overflow: 'hidden' }}
      >
        <Icon name="arrow_up" size={16} color={palette.onAccent} />
        <Txt font="sansMedium" size={13} color="onAccent" style={{ paddingLeft: 6 }}>
          {t('new_stories')}
        </Txt>
      </Pressable>
    </View>
  )
}

/** The page while the first stories are on their way: blocks shaped like a story card, announced as "Finding your next read…". */
export function FeedLoading({ onMenu }: { onMenu?: () => void }) {
  const { t } = useT()
  const { palette } = useTheme()
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  return (
    <View testID="feed-loading" style={{ flex: 1, backgroundColor: palette.bg }}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('loading')}
        accessibilityState={{ busy: true }}
        style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}
      >
        <SkeletonCard compact={height < 700} />
      </View>
      {onMenu ? <CornerMenu onPress={onMenu} /> : null}
    </View>
  )
}

export interface EmptyPanelProps {
  icon: IconName
  title: string
  detail: string
  /** The main button: its words, whether it can be pressed now (a dimmed button for one that cannot), and what it does. */
  button?: { label: string; enabled?: boolean; onPress: () => void }
  /** A quieter button under it. */
  link?: { label: string; onPress: () => void }
  onMenu?: () => void
  testID?: string
}

/**
 * A page with nothing on it but a picture, a heading, a few words and at most two buttons, in the middle of the screen (MainActivity's
 * `empty`). It scrolls only when a large text or a short screen leaves it no room.
 */
export function EmptyPanel({ icon, title, detail, button, link, onMenu, testID = 'feed-empty' }: EmptyPanelProps) {
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: palette.bg }}>
      <FitScroll
        contentStyle={{ alignItems: 'center', justifyContent: 'center', paddingLeft: 32 + insets.left, paddingRight: 32 + insets.right, paddingTop: 20 + insets.top, paddingBottom: 20 + insets.bottom }}
      >
        <View style={{ opacity: 0.7 }}>
          <Icon name={icon} size={56} color={palette.text2} />
        </View>
        <Txt font="serifBold" size={22} accessibilityRole="header" style={{ textAlign: 'center', paddingTop: 20, paddingBottom: 8 }}>
          {title}
        </Txt>
        <Paragraph size={14} color="text2" style={{ textAlign: 'center' }}>
          {detail}
        </Paragraph>
        {button ? (
          <View style={{ marginTop: 24 }}>
            <PrimaryButton label={button.label} onPress={button.onPress} disabled={button.enabled === false} testID="empty-button" />
          </View>
        ) : null}
        {link ? (
          <View style={{ marginTop: 12 }}>
            <SecondaryButton label={link.label} onPress={link.onPress} testID="empty-link" />
          </View>
        ) : null}
      </FitScroll>
      {onMenu ? <CornerMenu onPress={onMenu} /> : null}
    </View>
  )
}

export interface EmptyInput {
  screen: FeedScreen
  /** Why stories could not be loaded: network_error, rate_error, service_error or invalid_feed; null when nothing failed. */
  feedError: StringKey | null
  /** The section the news is narrowed to, or '' for all. */
  section: string
  /** The server has no older stories to give this feed. */
  exhausted: boolean
  /** The reader chose topics for For you. */
  hasInterests: boolean
  signedIn: boolean
}

/** What to do when the button of an empty page is pressed. */
export type EmptyAction = 'chooseInterests' | 'retry' | 'refresh' | 'more'

export interface EmptyDescription {
  icon: IconName
  title: StringKey
  detail: StringKey
  /** The words of the main button, or null for none (nothing is saved yet: there is nothing to try). */
  button: StringKey | null
  buttonEnabled: boolean
  action: EmptyAction
  /** "I have a Plax account" is offered: For you with no topics, to a reader who is not signed in. */
  accountLink: boolean
}

/** Which of the empty pages this is, and what it says and offers (MainActivity.emptyState and the click of its button). */
export function describeEmpty({ screen, feedError, section, exhausted, hasInterests, signedIn }: EmptyInput): EmptyDescription {
  const saved = screen === 'saved'
  const failed = feedError !== null
  const forYouEmpty = screen === 'forYou' && !hasInterests
  return {
    icon: saved ? 'bookmark' : forYouEmpty ? 'star' : failed ? 'cloud_off' : 'empty',
    title: saved ? 'empty_saved' : forYouEmpty ? 'for_you_title' : section === '' ? 'empty_feed' : 'empty_section',
    detail: saved ? 'empty_saved_detail' : forYouEmpty ? 'for_you_detail' : feedError ?? 'empty_feed_detail',
    button: saved ? null : forYouEmpty ? 'choose_interests' : section !== '' && !failed ? 'load_more' : 'retry',
    buttonEnabled: forYouEmpty || !exhausted || section === '' || failed,
    action: forYouEmpty ? 'chooseInterests' : failed ? 'retry' : section === '' ? 'refresh' : 'more',
    accountLink: forYouEmpty && !signedIn,
  }
}

export interface FeedEmptyProps extends EmptyInput {
  /** For you with no topics: the button opens the choice of topics. */
  onChooseInterests: () => void
  /** The feed could not be loaded: try again. */
  onRetry: () => void
  /** A feed with no stories (and no failure): look for stories. */
  onRefresh: () => void
  /** A section with no stories (and no failure): load more of the feed, in case this section is in the next page. */
  onMore: () => void
  /** "I have a Plax account": opens the account sheet. */
  onAccount: () => void
  onMenu?: () => void
}

/**
 * The page of a feed that has no stories: Saved with nothing saved, For you with no topics, a section that has none, a feed that came
 * back empty, and a feed that could not be loaded (the reason is its detail, and the button is Try again).
 */
export function FeedEmpty(props: FeedEmptyProps) {
  const { t } = useT()
  const description = describeEmpty(props)
  const press = { chooseInterests: props.onChooseInterests, retry: props.onRetry, refresh: props.onRefresh, more: props.onMore }[description.action]
  return (
    <EmptyPanel
      icon={description.icon}
      title={t(description.title)}
      detail={t(description.detail)}
      button={description.button === null ? undefined : { label: t(description.button), enabled: description.buttonEnabled, onPress: press }}
      link={description.accountLink ? { label: t('account_link'), onPress: props.onAccount } : undefined}
      onMenu={props.onMenu}
    />
  )
}

export interface CaughtUpPageProps {
  /** How many stories the reader has seen and can go back over; the second button is there only when there are some. */
  earlier: number
  /** "Check for new stories". */
  onCheck: () => void
  /** "Read 3 earlier stories": goes back over the stories already seen. */
  onEarlier: () => void
  onMenu?: () => void
}

/** The last page of a feed (StoryAdapter's caught-up card): a badge, "You're all caught up", what it means, and the two ways forward. */
export function CaughtUpPage({ earlier, onCheck, onEarlier, onMenu }: CaughtUpPageProps) {
  const { t, tp } = useT()
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  // The reading column is never wider than 640 dp: on a tablet or in landscape the page keeps to the middle of the screen.
  const side = Math.max(16, (width - Math.min(width, 640)) / 2) + 16
  return (
    <View testID="caught-up" style={{ flex: 1, backgroundColor: palette.bg }}>
      <FitScroll
        contentStyle={{ alignItems: 'center', justifyContent: 'center', paddingLeft: side + insets.left, paddingRight: side + insets.right, paddingTop: 16 + insets.top, paddingBottom: 16 + insets.bottom }}
      >
        <View testID="caught-up-badge" style={{ width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentSoft }}>
          <Icon name="check_circle" size={40} color={palette.accentText} />
        </View>
        <Txt font="serifBold" size={24} accessibilityRole="header" style={{ textAlign: 'center', paddingTop: 20, paddingBottom: 8 }}>
          {t('caught_up')}
        </Txt>
        <Paragraph size={15} color="text2" style={{ textAlign: 'center' }}>
          {t('caught_up_detail')}
        </Paragraph>
        <View style={{ marginTop: 28 }}>
          <PrimaryButton label={t('check_new')} onPress={onCheck} testID="caught-up-check" />
        </View>
        {earlier > 0 ? (
          <View style={{ marginTop: 12 }}>
            <SecondaryButton label={tp('read_earlier', earlier)} onPress={onEarlier} testID="caught-up-earlier" />
          </View>
        ) : null}
      </FitScroll>
      {onMenu ? <CornerMenu onPress={onMenu} /> : null}
    </View>
  )
}
