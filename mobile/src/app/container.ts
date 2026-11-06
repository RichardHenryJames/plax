import { File, Paths } from 'expo-file-system'
import * as Updates from 'expo-updates'
import { AppState } from 'react-native'
import { createAccountManager, openAuthSession, type AccountManager } from '../account'
import { isPlayBuild, site, versionCode } from '../build'
import { hasSection } from '../config/app-config'
import { createAppConfigStore, type AppConfigStore } from '../config/app-config-store'
import { createConfigPrompts, type ConfigPrompts } from '../config/config-prompts'
import { createDeeperApi, type DeeperSource } from '../data/deeper-api'
import { createFeedApi, type FeedSource } from '../data/feed-api'
import { FeedEngine, type FeedEngineOptions } from '../data/feed-engine'
import { importLegacyData, type LegacyFiles } from '../data/legacy-import'
import { Prefs } from '../data/prefs'
import { SavedStories } from '../data/saved-stories'
import { createShareLinks, type ShareSource } from '../data/share-links'
import type { RequestFn } from '../config/site-file'
import { systemClock, type Clock } from '../platform/clock'
import { readLegacyPreferences } from '../platform/native'
import { storage as phoneStorage, type KeyValueStore } from '../platform/storage'
import { createUpdateFeed } from '../updates/apk-updates'
import { createOtaManager, type OtaManager, type UpdatesModule } from '../updates/ota'
import { createUpdateManager, type UpdateManager } from '../updates/update-manager'
import { phoneHost } from './host'

/** Everything the app is made of, once: the engines that hold its rules, built from the phone's own parts. The screens ask for them here. */
export interface Services {
  readonly clock: Clock
  readonly storage: KeyValueStore
  readonly prefs: Prefs
  readonly appConfig: AppConfigStore
  readonly prompts: ConfigPrompts
  readonly apkUpdates: UpdateManager
  readonly ota: OtaManager
  readonly account: AccountManager
  readonly engine: FeedEngine
  readonly deeper: DeeperSource
  readonly share: ShareSource
  /**
   * Gets the app ready, in the order it needs: what the native 1.x app left on the phone is taken over (once), the settings and what the
   * reader has been told are read, the account's session is opened (no network), and the feed engine starts. Never throws.
   */
  start(): Promise<void>
  /** Stops what runs in the background. */
  stop(): void
}

export interface ServiceOverrides {
  readonly clock?: Clock
  readonly storage?: KeyValueStore
  readonly legacyFiles?: LegacyFiles
  readonly updates?: UpdatesModule
  readonly openUrl?: (url: string) => Promise<boolean>
  readonly installed?: number
  readonly playBuild?: boolean
  /** The phone's Android API level (default: the phone's own). */
  readonly sdk?: number
  /** Where the stories come from (default: the website's feed). */
  readonly feed?: FeedSource
  /** Asks the website for its settings file and the update feed (default: the phone's own requests). */
  readonly request?: RequestFn
  readonly deeper?: DeeperSource
  readonly share?: ShareSource
  /** The account (default: the real one, signing in through the phone's browser). */
  readonly account?: AccountManager
  readonly engine?: Partial<FeedEngineOptions>
}

/** The files of the native 1.x app, which the new app finds where it kept them: the app's own files folder (the package id is the same), and its settings file beside it. */
export const nativeAppFiles: LegacyFiles = {
  readText: async (name) => {
    try {
      const file = new File(Paths.document, name)
      return file.exists ? await file.text() : null
    } catch {
      return null
    }
  },
  readPreferences: readLegacyPreferences,
}

export function createServices(overrides: ServiceOverrides = {}): Services {
  const clock = overrides.clock ?? systemClock
  const storage = overrides.storage ?? phoneStorage
  const playBuild = overrides.playBuild ?? isPlayBuild()
  const installed = overrides.installed ?? versionCode()
  const openUrl = overrides.openUrl ?? ((url: string) => phoneHost.openUrl(url).then(() => true, () => false))

  const prefs = new Prefs(storage)
  const appConfig = createAppConfigStore({ storage, clock, site, request: overrides.request })
  const prompts = createConfigPrompts({ storage, playBuild, installed })
  const apkUpdates = createUpdateManager({
    storage, clock, installed, sdk: overrides.sdk ?? phoneHost.sdk, openUrl,
    feed: createUpdateFeed({ site, request: overrides.request }),
  })
  const ota = createOtaManager({ updates: overrides.updates ?? Updates, clock, storage })
  const savedStories = new SavedStories(storage)

  // The account needs to know the topics and the saved stories the engine holds, and the engine needs the account's cloud: the engine is found through this.
  let engineRef: FeedEngine | undefined
  const account =
    overrides.account ??
    createAccountManager({
      openAuthSession,
      clock,
      localTopics: () => engineRef?.getState().interests ?? new Set<string>(),
      localSaved: () => savedStories.read().catch(() => []),
      topics: () => appConfig.active().topics,
    })
  const engine = new FeedEngine({
    source: overrides.feed ?? createFeedApi(),
    storage, clock, savedStories, prefs,
    cloud: account.cloud(),
    topics: () => appConfig.active().topics,
    hasSection: (id) => hasSection(appConfig.active(), id),
    ...overrides.engine,
  })
  engineRef = engine

  let stopOta: (() => void) | undefined
  let started: Promise<void> | undefined
  return {
    clock, storage, prefs, appConfig, prompts, apkUpdates, ota, account, engine,
    deeper: overrides.deeper ?? createDeeperApi(),
    share: overrides.share ?? createShareLinks(),
    start() {
      started ??= (async () => {
        // What the website last said is read first: the topics it lists decide which of the old topics are kept.
        await Promise.all([appConfig.load(), prompts.load(), apkUpdates.load(), ota.load()].map((step) => step.catch(() => undefined)))
        await importLegacyData({ files: overrides.legacyFiles ?? nativeAppFiles, storage, clock, topics: () => appConfig.active().topics }).catch(() => undefined)
        await account.restore().catch(() => undefined)
        await engine.start().catch(() => undefined)
        stopOta = ota.watch(AppState)
      })()
      return started
    },
    stop() {
      stopOta?.()
      stopOta = undefined
    },
  }
}
