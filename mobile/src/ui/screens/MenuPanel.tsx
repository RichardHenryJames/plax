import { useRef, type ReactNode } from 'react'
import { ScrollView, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NEWS_TOPIC } from '../../data/topic'
import type { Lang, StringKey } from '../../i18n'
import { Icon, type IconName } from '../Icon'
import { useT } from '../i18n-context'
import { SidePanel } from '../overlays'
import { Chip, Divider, IconButton, Touchable, Txt } from '../primitives'
import { useTheme } from '../theme'
import type { FeedScreen } from './parts'

/** A chip of the news sections: the website's list, or the six the app was made with (the same shape as `Section` of src/config). */
export interface MenuSection {
  readonly id: string
  readonly en: string
  readonly hi: string
}

/** Who a link of the website is for: both builds, the Google Play build, or the website's own. */
export type LinkBuild = 'all' | 'play' | 'direct'

/** A row the website added to the menu (the same shape as `Link` of src/config). */
export interface MenuLink {
  readonly id: string
  readonly en: string
  readonly hi: string
  readonly url: string
  readonly build: LinkBuild
}

export interface MenuPanelProps {
  visible: boolean
  /** The place the reader is in: it is marked. */
  screen: FeedScreen
  /** The topic of the feed (the news sections are offered for the news only). */
  topicId: string
  /** The section the news is narrowed to, or '' for all: it is marked. */
  section: string
  sections: readonly MenuSection[]
  /** The links the website listed; the ones for the other build are left out here. */
  links: readonly MenuLink[]
  /** The Google Play build: its update row opens Google Play, and the website's links for the other build are hidden. */
  storeBuild: boolean
  /** Whether the consent tool says the ad choices apply (MenuSheet's `adChoices`): a row "Privacy and ad choices" is added. */
  adChoices: boolean
  /** The panel asks to be closed: the cross, the back button, a tap beside it, a swipe to the left, and every choice (before its own callback). */
  onClose: () => void
  onScreen: (screen: FeedScreen) => void
  /** The reader chose the other language (not called for the one already in use). */
  onLanguage: (lang: Lang) => void
  /** A section chip: its id, or '' for All. */
  onSection: (id: string) => void
  onAccount: () => void
  onTheme: () => void
  onAbout: () => void
  onContact: () => void
  onPrivacy: () => void
  /** A link of the website: its address. */
  onLink: (url: string) => void
  onAdChoices: () => void
  onUpdate: () => void
  onClearSaved: () => void
}

/** A panel 320 dp wide, and never more than 86% of the screen. */
export const MENU_WIDTH = 320
/** How far a swipe to the left has to go, and how much more sideways than up or down, to close the panel (MenuSheet.SwipeAway). */
const SWIPE_AWAY_DP = 60
const SWIPE_AWAY_RATIO = 1.4
/** A drag to the left of this much, and plainly sideways, is the panel's own: it is taken from what is under the finger. */
const SWIPE_GRAB_DP = 12

export const isSwipeAway = (dx: number, dy: number): boolean => dx < -SWIPE_AWAY_DP && Math.abs(dx) > Math.abs(dy) * SWIPE_AWAY_RATIO

const PLACES: readonly { screen: FeedScreen; icon: IconName; label: StringKey; testID: string }[] = [
  { screen: 'feed', icon: 'feed', label: 'feed', testID: 'menu-feed' },
  { screen: 'forYou', icon: 'star', label: 'for_you', testID: 'menu-for-you' },
  { screen: 'topics', icon: 'grid', label: 'topics', testID: 'menu-topics' },
  { screen: 'saved', icon: 'bookmark', label: 'saved', testID: 'menu-saved' },
]

const linkApplies = (link: MenuLink, storeBuild: boolean): boolean => link.build === 'all' || (link.build === 'play') === storeBuild

/** The name of a section or a link in the reader's language (the English one when the website gave no Hindi one). */
const nameIn = (entry: { readonly en: string; readonly hi: string }, lang: Lang): string => (lang === 'hi' && entry.hi !== '' ? entry.hi : entry.en)

/**
 * A swipe to the left anywhere on the screen closes the panel, whatever the finger touches first (MenuSheet.SwipeAway). Once a drag is
 * plainly sideways and to the left, this takes it from the row or the scrim under the finger, so that the row is not pressed as well
 * (the native panel took the touch away from its children in the same way); a tap, and a drag up or down, are left to them.
 */
function SwipeAway({ onAway, children }: { onAway: () => void; children: ReactNode }) {
  const from = useRef<{ x: number; y: number } | null>(null)
  const moved = (event: GestureResponderEvent) => {
    const start = from.current
    return start === null ? null : { dx: event.nativeEvent.pageX - start.x, dy: event.nativeEvent.pageY - start.y }
  }
  return (
    <View
      testID="menu-swipe"
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onTouchStart={(event) => {
        from.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
      }}
      onMoveShouldSetResponderCapture={(event) => {
        const move = moved(event)
        return move !== null && move.dx < -SWIPE_GRAB_DP && Math.abs(move.dx) > Math.abs(move.dy) * SWIPE_AWAY_RATIO
      }}
      onResponderTerminationRequest={() => false}
      onResponderRelease={(event) => {
        const move = moved(event)
        from.current = null
        if (move !== null && isSwipeAway(move.dx, move.dy)) onAway()
      }}
      onResponderTerminate={() => {
        from.current = null
      }}
    >
      {children}
    </View>
  )
}

function Heading({ label }: { label: string }) {
  const { lang } = useT()
  return (
    <Txt
      font="sansMedium"
      size={11}
      color="text2"
      accessibilityRole="header"
      accessibilityLabel={label}
      // Capitals and wide spacing are Latin ways of setting a small heading; Devanagari has no capitals and keeps its marks close.
      style={{ paddingHorizontal: 12, paddingTop: 18, paddingBottom: 8, letterSpacing: lang === 'en' ? 0.66 : 0 }}
    >
      {label.toUpperCase()}
    </Txt>
  )
}

/** One line of the menu: a glyph and a label, 48 dp tall to touch; the place the reader is in is marked. */
function MenuRow({ icon, label, selected, onPress, testID }: { icon: IconName; label: string; selected?: boolean; onPress: () => void; testID?: string }) {
  const { palette } = useTheme()
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      testID={testID}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderRadius: 14, overflow: 'hidden', backgroundColor: selected ? palette.accentSoft : 'transparent' }}
    >
      <Icon name={icon} size={22} color={selected ? palette.accentText : palette.text2} />
      <Txt font={selected ? 'sansMedium' : 'sans'} size={15} style={{ flex: 1, paddingLeft: 14, paddingVertical: 6 }}>
        {label}
      </Txt>
    </Touchable>
  )
}

/** The feed language: the two words in one pill, the one in use filled; read to a screen reader as "Read in English" and "Read in Hindi". */
function LanguageSwitch({ onPick }: { onPick: (lang: Lang) => void }) {
  const { t, lang } = useT()
  const { palette } = useTheme()
  const segment = (value: Lang, label: string, description: string) => {
    const selected = lang === value
    return (
      <Touchable
        key={value}
        accessibilityRole="button"
        accessibilityLabel={description}
        accessibilityState={{ selected }}
        onPress={() => onPick(value)}
        testID={`menu-language-${value}`}
        // 44 dp drawn inside the pill, 48 dp to touch.
        hitSlop={{ top: 2, bottom: 2 }}
        style={{ flex: 1, minHeight: 44, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: selected ? palette.accent : 'transparent' }}
      >
        <Txt font="sansMedium" size={14} color={selected ? 'onAccent' : 'text2'}>
          {label}
        </Txt>
      </Touchable>
    )
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 4, padding: 3, borderRadius: 24, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt }}>
      {segment('en', t('language_english'), t('read_in_english'))}
      {segment('hi', t('language_hindi'), t('read_in_hindi'))}
    </View>
  )
}

/**
 * The menu: everything the header and the bottom bar used to hold, in one panel that slides in from the left (MenuSheet of the native
 * app). The feed language, the four places (Feed, For you, Topics, Saved), the news sections, the account, the theme, About, Contact us,
 * the privacy policy, the ad choices (where they apply), the website's own links, the update row and Clear saved stories. A choice
 * closes the panel first and then does what it says. It stands behind the system bars: the list scrolls under the navigation bar and
 * its last row comes clear of it.
 */
export function MenuPanel(props: MenuPanelProps) {
  const { visible, screen, topicId, section, sections, links, storeBuild, adChoices, onClose } = props
  const { t, lang } = useT()
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  const width = Math.min(MENU_WIDTH, Math.round(window.width * 0.86))
  const choose = (action: () => void) => () => {
    onClose()
    action()
  }
  // Hindi cards carry no section tag, so the sections only apply to English headlines of the news.
  const showSections = sections.length > 0 && screen === 'feed' && topicId === NEWS_TOPIC.id && lang === 'en'
  const shownLinks = links.filter((link) => linkApplies(link, storeBuild))
  const sectionChip = (id: string, label: string) => (
    <View key={id === '' ? 'all' : id} style={{ marginRight: 2 }}>
      <Chip label={label} selected={id === section} onPress={choose(() => props.onSection(id))} testID={`menu-section-${id === '' ? 'all' : id}`} />
    </View>
  )
  const dividerGap = (
    <View style={{ marginHorizontal: 4, marginTop: 12, marginBottom: 8 }}>
      <Divider />
    </View>
  )

  return (
    <SwipeAway onAway={onClose}>
      <SidePanel visible={visible} onClose={onClose} closeLabel={t('close_menu')} width={width} testID="menu-panel">
        <View testID="menu-content" style={{ flex: 1, paddingTop: insets.top, paddingLeft: insets.left }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingLeft: 20, paddingRight: 4 }}>
            <Icon name="plax" size={28} color={palette.text} />
            <Txt font="serifBold" size={22} style={{ flex: 1, paddingLeft: 8 }}>
              {t('app_name')}
            </Txt>
            <IconButton icon="close" label={t('close_menu')} onPress={onClose} tint={palette.text} testID="menu-close" />
          </View>
          <ScrollView testID="menu-list" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 + insets.bottom }}>
            <Heading label={t('feed_language')} />
            <LanguageSwitch
              onPick={(value) => {
                onClose()
                // The language already in use is not asked for again.
                if (value !== lang) props.onLanguage(value)
              }}
            />

            <View style={{ marginTop: 12 }}>
              {PLACES.map((place) => (
                <MenuRow key={place.screen} icon={place.icon} label={t(place.label)} selected={place.screen === screen} onPress={choose(() => props.onScreen(place.screen))} testID={place.testID} />
              ))}
            </View>

            {showSections ? (
              <>
                <Heading label={t('sections')} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 }}>
                  {sectionChip('', t('all'))}
                  {sections.map((entry) => sectionChip(entry.id, nameIn(entry, lang)))}
                </View>
              </>
            ) : null}

            {dividerGap}
            <MenuRow icon="person" label={t('account')} onPress={choose(props.onAccount)} testID="menu-account" />
            <MenuRow icon="theme" label={t('theme')} onPress={choose(props.onTheme)} testID="menu-theme" />
            {dividerGap}
            <MenuRow icon="info" label={t('about')} onPress={choose(props.onAbout)} testID="menu-about" />
            <MenuRow icon="mail" label={t('contact_us')} onPress={choose(props.onContact)} testID="menu-contact" />
            <MenuRow icon="shield" label={t('privacy_policy')} onPress={choose(props.onPrivacy)} testID="menu-privacy" />
            {adChoices ? <MenuRow icon="info" label={t('ad_choices')} onPress={choose(props.onAdChoices)} testID="menu-ad-choices" /> : null}
            {shownLinks.map((link) => (
              <MenuRow key={link.id} icon="info" label={nameIn(link, lang)} onPress={choose(() => props.onLink(link.url))} testID={`menu-link-${link.id}`} />
            ))}
            <MenuRow icon="download" label={t(storeBuild ? 'update_play' : 'update_check')} onPress={choose(props.onUpdate)} testID="menu-update" />
            <MenuRow icon="trash" label={t('clear_saved')} onPress={choose(props.onClearSaved)} testID="menu-clear-saved" />
          </ScrollView>
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 1, backgroundColor: palette.border }} />
        </View>
      </SidePanel>
    </SwipeAway>
  )
}
