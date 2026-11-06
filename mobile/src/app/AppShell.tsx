import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Linking, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { accountOccupied, isSignedIn, toastFor, type AccountStatus } from '../account'
import { AdStrip, useAds } from '../ads'
import { site, versionLabel, E2E_SITE, variant } from '../build'
import { noticeBody, noticeTitle } from '../config/app-config'
import type { ConfigPrompt } from '../config/config-prompts'
import { isWebLink, type Story } from '../data/story'
import type { StringKey } from '../i18n'
import { useStore } from '../state/store'
import { PLAY_URL, type Release } from '../updates/apk-updates'
import type { UpdateHost } from '../updates/update-manager'
import { useT } from '../ui/i18n-context'
import { useBackHandler, useToast } from '../ui/overlays'
import {
  AboutDialog,
  AccountSheet,
  ClearSavedDialog,
  Contact,
  ContactSheet,
  DeeperSheet,
  DeleteAccountDialog,
  FeedEmpty,
  FeedLoading,
  InterestsSheet,
  MenuPanel,
  NewStoriesPill,
  NoticeDialog,
  RefreshSpinner,
  StoreUpdateDialog,
  ThemeDialog,
  TopicsScreen,
  UpdateOfferDialog,
  type AccountView,
} from '../ui/screens'
import { useTheme, type ThemeMode } from '../ui/theme'
import type { Services } from './container'
import { FeedView, type StoryActions } from './FeedView'
import { phoneHost, type Host } from './host'
import { createContactActions, createLinkOpener } from './links'
import { createSharer } from './sharer'
import { useDeeper } from './use-deeper'

type Sheet = { readonly kind: 'menu' | 'interests' | 'account' | 'contact' } | { readonly kind: 'deeper'; readonly story: Story }

type NoticePrompt = Extract<ConfigPrompt, { kind: 'notice' }>
type UpdatePrompt = Extract<ConfigPrompt, { kind: 'update' }>

type Dialog =
  | { readonly kind: 'about' | 'theme' | 'clear' | 'delete' }
  | { readonly kind: 'notice'; readonly prompt: NoticePrompt }
  | { readonly kind: 'storeUpdate'; readonly prompt: UpdatePrompt }
  | { readonly kind: 'update'; readonly release: Release }

export interface AppShellProps {
  readonly services: Services
  readonly host?: Host
  /** The theme the reader chose, and the way to change it (the root keeps it, so that the whole app is drawn in it). */
  readonly themeMode: ThemeMode
  readonly onThemeMode: (mode: ThemeMode) => void
}

/** The latest of a value, for the callbacks that must stay the same for as long as the app runs. */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value)
  ref.current = value
  return ref
}

const privacyUrl = (): string => `${site()}/privacy`

/** The test build's own website is plain http, on the host; no other address but a plain https one is ever opened. */
const isTestSite = (link: string): boolean => variant() === 'e2e' && link.startsWith(`${E2E_SITE}/`)

/**
 * The app's one screen (MainActivity of the native app): the feed, For you, Topics or Saved, the menu and everything that opens from it,
 * and the ads. The engines hold the rules (src/data, src/account, src/config, src/updates, src/ads); this puts them in front of the
 * reader and carries the reader's choices back to them.
 */
export function AppShell({ services, host = phoneHost, themeMode, onThemeMode }: AppShellProps) {
  const { engine, appConfig, account, prompts, apkUpdates, prefs, clock } = services
  const state = useStore(engine.store, (current) => current)
  const config = useStore(appConfig.store, (current) => current.config)
  const accountState = useStore(account.store, (current) => current)
  const { t } = useT()
  const { palette, dark } = useTheme()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const ads = useAds({ ads: config.features.ads, pages: config.features.adPages, every: config.adPageEvery })

  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const nothingOpen = sheet === null && dialog === null && !accountOccupied(accountState)
  const latest = useLatest({ state, config, nothingOpen, dialog, t })

  const say = useCallback((key: StringKey, long = false) => toast.show(latest.current.t(key), long), [toast, latest])
  const links = useMemo(() => createLinkOpener({ browser: host.openBrowser, say, allowed: (link) => isWebLink(link) || isTestSite(link) }), [host, say])
  const contact = useMemo(
    () => createContactActions({ openUrl: host.openUrl, copy: host.copy, say, appName: () => latest.current.t('app_name'), versionName: versionLabel, sdk: host.sdk }),
    [host, say, latest],
  )
  const sharer = useMemo(
    () =>
      createSharer({
        links: services.share,
        pagesOn: () => latest.current.config.features.shareLinks,
        appName: () => latest.current.t('app_name'),
        send: (message) => host.share(message, latest.current.t('share_chooser')),
        say,
        visible: () => AppState.currentState === 'active',
      }),
    [services.share, host, say, latest],
  )
  useEffect(() => () => sharer.cancel(), [sharer])

  const actions = useMemo<StoryActions>(
    () => ({
      onMenu: () => setSheet((open) => (open?.kind === 'menu' ? open : { kind: 'menu' })),
      onSave: (story) => {
        host.confirm()
        engine.toggleSaved(story)
      },
      onShare: (story) => sharer.share(story),
      onDeeper: (story) => {
        if (!latest.current.config.features.deeper) return
        setSheet((open) => (open?.kind === 'deeper' ? open : { kind: 'deeper', story }))
      },
      onOpenSource: (story) => links.open(story.sourceUrl),
    }),
    [engine, sharer, links, latest, host],
  )

  const closeSheet = useCallback((kind: Sheet['kind']) => setSheet((open) => (open?.kind === kind ? null : open)), [])
  const closeDialog = useCallback((kind: Dialog['kind']) => setDialog((open) => (open?.kind === kind ? null : open)), [])

  // ─── What the website says: a notice, or that a newer version is on Google Play ───
  const showPrompt = useCallback(() => {
    if (!latest.current.nothingOpen) return
    const prompt = prompts.next(latest.current.config, clock())
    if (prompt === null) return
    prompts.shown(prompt)
    setDialog(prompt.kind === 'notice' ? { kind: 'notice', prompt } : { kind: 'storeUpdate', prompt })
  }, [prompts, clock, latest])
  const finishPrompt = useCallback(
    (acknowledged: boolean) => {
      const open = latest.current.dialog
      setDialog(null)
      if (open?.kind === 'notice' || open?.kind === 'storeUpdate') void prompts.closed(open.prompt, acknowledged, clock())
    },
    [prompts, clock, latest],
  )
  useEffect(() => {
    showPrompt()
  }, [config, showPrompt])

  // ─── The screen the update manager offers a newer APK on ───
  const updateHost = useMemo<UpdateHost>(
    () => ({
      idle: () => latest.current.nothingOpen,
      offer: (release) => setDialog({ kind: 'update', release }),
      say: (message) => say(message, true),
      openListing: () => links.open(PLAY_URL),
    }),
    [latest, say, links],
  )

  // ─── Coming to the front and leaving ───
  useEffect(() => {
    const resume = () => {
      engine.foreground()
      void account.resume().catch(() => undefined)
      void appConfig.refresh().catch(() => undefined)
      void apkUpdates.attach(updateHost).catch(() => undefined)
      showPrompt()
    }
    const pause = () => {
      engine.background()
      apkUpdates.detach(updateHost)
    }
    resume()
    const subscription = AppState.addEventListener('change', (next) => (next === 'active' ? resume() : pause()))
    return () => {
      subscription.remove()
      apkUpdates.detach(updateHost)
    }
  }, [engine, account, appConfig, apkUpdates, updateHost, showPrompt])

  // ─── The browser returns from Google sign-in through the app's own address ───
  useEffect(() => {
    const returned = (address: string | null | undefined) => {
      if (!address || !account.ours(address)) return
      void account.complete(address)
      setSheet({ kind: 'account' })
    }
    void Linking.getInitialURL().then(returned, () => undefined)
    const subscription = Linking.addEventListener('url', (event) => returned(event.url))
    return () => subscription.remove()
  }, [account])

  // ─── Words for the reader, once ───
  const told = useRef<AccountStatus | null>(null)
  useEffect(() => {
    const key = toastFor(told.current, accountState)
    told.current = accountState.status
    if (key !== null) say(key, key !== 'account_signed_in')
  }, [accountState, say])
  useEffect(() => {
    if (state.notice === null) return
    say(state.notice)
    engine.acknowledgeNotice()
  }, [state.notice, engine, say])

  // ─── The back button: what is open closes first (each overlay takes the press itself), then the other places lead to the feed ───
  useBackHandler(true, () => {
    if (latest.current.state.screen !== 'feed') engine.screen('feed')
    else host.exit()
  })

  // ─── Go deeper ───
  const deeper = useDeeper(services.deeper, sheet?.kind === 'deeper' ? sheet.story : null, state.lang)

  const accountView = useMemo<AccountView>(
    () => ({
      phase: accountState.status === 'signedIn' ? 'signed_in' : accountState.status === 'signingIn' ? 'waiting' : 'signed_out',
      name: accountState.name,
      email: accountState.email,
      message: accountState.message,
      busy: accountState.busy,
    }),
    [accountState],
  )

  const saveInterests = useCallback(
    (topics: string[]) => {
      const before = engine.getState()
      engine.setInterests(topics)
      if (before.interests.size === 0 && before.screen !== 'forYou') engine.screen('forYou')
      say('interests_saved')
    },
    [engine, say],
  )

  const moving = useRef(false)
  const still = useCallback(() => !moving.current, [])
  const onMovingChange = useCallback((now: boolean) => {
    moving.current = now
  }, [])

  const browsing = state.screen === 'feed' || state.screen === 'forYou'
  const noStories = state.stories.length === 0
  const showTopics = state.screen === 'topics'
  const showSkeleton = browsing && noStories && state.feedError === null && (state.loading || !state.ready)
  const showEmpty = !showTopics && noStories && !showSkeleton
  const showFeed = !showTopics && !noStories
  const stripWanted = browsing && !noStories
  const overlayOpen = sheet !== null || dialog !== null
  const storeBuild = apkUpdates.storeBuild()
  // The last prompt stays drawn while its dialog goes, as every other overlay does.
  const keptPrompts = useRef<{ notice: NoticePrompt | null; update: UpdatePrompt | null; release: Release | null }>({ notice: null, update: null, release: null })
  if (dialog?.kind === 'notice') keptPrompts.current.notice = dialog.prompt
  if (dialog?.kind === 'storeUpdate') keptPrompts.current.update = dialog.prompt
  if (dialog?.kind === 'update') keptPrompts.current.release = dialog.release
  const kept = keptPrompts.current

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }} testID="app-shell">
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/* What is behind a sheet or a dialog is not offered to a screen reader. */}
      <View style={{ flex: 1 }} importantForAccessibility={overlayOpen ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={overlayOpen}>
        {showTopics ? (
          <TopicsScreen
            topics={config.topics}
            currentTopicId={state.topic.id}
            interests={state.interests}
            onSelectTopic={(topic) => engine.topic(topic)}
            onChooseInterests={() => setSheet({ kind: 'interests' })}
            onMenu={actions.onMenu}
          />
        ) : null}
        {showSkeleton ? <FeedLoading onMenu={actions.onMenu} /> : null}
        {showEmpty ? (
          <FeedEmpty
            screen={state.screen}
            feedError={state.feedError}
            section={state.section}
            exhausted={state.exhausted}
            hasInterests={state.interests.size > 0}
            signedIn={isSignedIn(accountState)}
            onChooseInterests={() => setSheet({ kind: 'interests' })}
            onRetry={() => engine.retry()}
            onRefresh={() => engine.refresh()}
            onMore={() => engine.more()}
            onAccount={() => setSheet({ kind: 'account' })}
            onMenu={actions.onMenu}
          />
        ) : null}
        {showFeed ? (
          <FeedView key={state.screen} state={state} engine={engine} config={config} ads={ads} actions={actions} onMovingChange={onMovingChange} onTick={host.tick} />
        ) : null}
        <RefreshSpinner visible={state.refreshing} />
        <NewStoriesPill visible={state.fresh} onPress={() => engine.applyFresh()} />
      </View>
      {/* The strip of ads stays where it is for as long as the app runs, so that going to Topics and back does not ask for another banner.
          The pages of the pager stand above the navigation bar; the other screens pad themselves. */}
      <View style={{ paddingLeft: insets.left, paddingRight: insets.right, paddingBottom: showFeed ? insets.bottom : 0 }}>
        <AdStrip ads={ads} wanted={stripWanted} still={still} theme={{ bg: palette.bg, border: palette.border }} />
      </View>

      <MenuPanel
        visible={sheet?.kind === 'menu'}
        screen={state.screen}
        topicId={state.topic.id}
        section={state.section}
        sections={config.sections}
        links={config.links}
        storeBuild={storeBuild}
        adChoices={ads.privacyOptions}
        onClose={() => closeSheet('menu')}
        onScreen={(screen) => engine.screen(screen)}
        onLanguage={(language) => engine.language(language)}
        onSection={(id) => engine.section(id)}
        onAccount={() => setSheet({ kind: 'account' })}
        onTheme={() => setDialog({ kind: 'theme' })}
        onAbout={() => setDialog({ kind: 'about' })}
        onContact={() => setSheet({ kind: 'contact' })}
        onPrivacy={() => links.open(privacyUrl())}
        onLink={(url) => links.open(url)}
        onAdChoices={() => void ads.showPrivacyOptions().catch(() => undefined)}
        onUpdate={() => void apkUpdates.check(true).catch(() => undefined)}
        onClearSaved={() => setDialog({ kind: 'clear' })}
      />
      <InterestsSheet visible={sheet?.kind === 'interests'} topics={config.topics} selected={state.interests} onSave={saveInterests} onClose={() => closeSheet('interests')} />
      <AccountSheet
        visible={sheet?.kind === 'account'}
        account={accountView}
        onSignIn={() => void account.signIn()}
        onCancelSignIn={() => void account.cancel()}
        onSignOut={() => void account.signOut()}
        onInterests={() => setSheet({ kind: 'interests' })}
        onWebsite={() => links.open(site())}
        onDeleteAccount={() => setDialog({ kind: 'delete' })}
        onPrivacy={() => links.open(privacyUrl())}
        onClose={() => closeSheet('account')}
      />
      <ContactSheet
        visible={sheet?.kind === 'contact'}
        onEmail={() => void contact.email()}
        onCopy={() => void contact.copy()}
        onPage={() => links.open(Contact.pageUrl())}
        onClose={() => closeSheet('contact')}
      />
      <DeeperSheet visible={sheet?.kind === 'deeper'} language={deeper.language} view={deeper.view} onLanguage={deeper.choose} onRetry={deeper.retry} onClose={() => closeSheet('deeper')} />

      <AboutDialog
        visible={dialog?.kind === 'about'}
        versionName={versionLabel()}
        withAds={ads.hasAds}
        storeBuild={storeBuild}
        onPrivacy={() => links.open(privacyUrl())}
        onDone={() => closeDialog('about')}
      />
      <ThemeDialog
        visible={dialog?.kind === 'theme'}
        mode={themeMode}
        onChoose={(mode) => {
          closeDialog('theme')
          if (mode !== themeMode) {
            onThemeMode(mode)
            void prefs.setTheme(mode).catch(() => undefined)
          }
        }}
        onCancel={() => closeDialog('theme')}
      />
      <ClearSavedDialog
        visible={dialog?.kind === 'clear'}
        signedIn={isSignedIn(accountState)}
        onCancel={() => closeDialog('clear')}
        onConfirm={() => {
          closeDialog('clear')
          engine.clearSaved()
        }}
      />
      <DeleteAccountDialog
        visible={dialog?.kind === 'delete'}
        onCancel={() => closeDialog('delete')}
        onConfirm={() => {
          closeDialog('delete')
          void account.deleteAccount()
        }}
      />
      {kept.notice === null ? null : (
        <NoticeDialog
          visible={dialog?.kind === 'notice'}
          title={noticeTitle(kept.notice.notice, state.lang)}
          body={noticeBody(kept.notice.notice, state.lang)}
          hasLink={kept.notice.notice.url !== ''}
          onDone={() => finishPrompt(true)}
          onMore={() => {
            finishPrompt(true)
            if (kept.notice) links.open(kept.notice.notice.url)
          }}
          onCancel={() => finishPrompt(false)}
        />
      )}
      {kept.update === null ? null : (
        <StoreUpdateDialog
          visible={dialog?.kind === 'storeUpdate'}
          versionName={kept.update.update.latestVersionName}
          required={kept.update.required}
          onLater={() => finishPrompt(false)}
          onUpdate={() => {
            finishPrompt(true)
            links.open(PLAY_URL)
          }}
        />
      )}
      {kept.release === null ? null : (
        <UpdateOfferDialog
          visible={dialog?.kind === 'update'}
          versionName={kept.release.versionName}
          onLater={() => {
            closeDialog('update')
            if (kept.release) void apkUpdates.dismiss(kept.release)
          }}
          onDownload={() => {
            closeDialog('update')
            if (kept.release) {
              void apkUpdates.download(kept.release).then((opened) => {
                if (!opened) say('update_no_browser', true)
              })
            }
          }}
        />
      )}
    </View>
  )
}
