import type { StringKey } from '@/i18n'
import type { KeyValueStore } from '@/platform/storage'
import { noticeApplies, type AppConfig, type Notice, type StoreUpdate } from './app-config'
import { DAY, dueAfter } from './limits'
import { remembered } from './remember'

/** An update that the reader put off (Later) is not offered again for this long, but a newer one is offered at once. */
export const UPDATE_REMINDER_INTERVAL = DAY

/** The two messages of the Google Play update: that a newer version is there, and that this one is out of date. */
export type PlayUpdateMessage = Extract<StringKey, 'update_play_message' | 'update_play_required'>

/**
 * What to put in front of the reader: one notice, or, in a Google Play build, that a newer version is on Google Play. Never both at once,
 * and never blocking: every one can be put off. For an update, `messageKey` is the text (its one argument is
 * `update.latestVersionName`), and `required` says the build is below the least supported version.
 */
export type ConfigPrompt =
  | { readonly kind: 'notice'; readonly notice: Notice }
  | { readonly kind: 'update'; readonly update: StoreUpdate; readonly required: boolean; readonly messageKey: PlayUpdateMessage }

export interface ConfigPromptsDeps {
  /** Where what the reader has seen is kept. */
  storage: KeyValueStore
  /** Whether this is the Google Play build. */
  playBuild: boolean
  /** The version code installed. */
  installed: number
}

export interface ConfigPrompts {
  /** Reads what was remembered from the last starts. Call it when the app starts: until it has finished, nothing is put up. */
  load(): Promise<void>
  /** What is to be shown now, or null. Nothing is shown before `load` has finished, so that a notice already seen is not put up again. */
  next(config: AppConfig, now: number): ConfigPrompt | null
  /** The prompt is on the screen: it is not put up again in this run of the app. */
  shown(prompt: ConfigPrompt): void
  /** The reader closed the prompt. `acknowledged` is Done (or Learn more, or Update); any other way out is not. */
  closed(prompt: ConfigPrompt, acknowledged: boolean, now: number): Promise<void>
}

/**
 * Decides which of the website's messages to put in front of the reader now. Pure rules and a little memory, so that they can be tested
 * without a screen. A port of ConfigPrompts.java.
 *
 * - A notice is shown once for each id, to the builds and versions it is for, until the time it names. One marked important is shown
 *   again at the next start until the reader has said Done; any other is counted as read however it was closed.
 * - An update is offered to a Google Play build older than the newest version the website names, and not again for a day once the
 *   reader said Later (a newer version is offered at once). A build below the least supported version is offered it at every start.
 *   The website's build never sees it: it has its own update feed (src/updates).
 */
export function createConfigPrompts(deps: ConfigPromptsDeps): ConfigPrompts {
  const { playBuild, installed } = deps
  const memory = remembered(deps.storage, 'plax.prompts', { noticeSeen: '', updateVersion: 0, updateAt: 0 })
  let ready = false
  let loading: Promise<void> | null = null
  /** Not put up twice in one run of the app, whatever the reader did with it. */
  let noticeShown = ''
  let requiredShown = false

  function load(): Promise<void> {
    if (loading === null) {
      loading = memory.load().then(() => {
        ready = true
      })
    }
    return loading
  }

  function next(config: AppConfig, now: number): ConfigPrompt | null {
    if (!ready) return null
    const { notice, update } = config
    const seen = memory.value.noticeSeen
    if (notice !== null && noticeApplies(notice, { playBuild, versionCode: installed, now }) && notice.id !== seen && notice.id !== noticeShown) {
      return { kind: 'notice', notice }
    }
    if (playBuild && update !== null && installed < update.latestVersionCode) {
      const required = installed < update.minSupportedVersionCode
      const wanted = required
        ? !requiredShown
        : update.latestVersionCode !== memory.value.updateVersion || dueAfter(now, memory.value.updateAt, UPDATE_REMINDER_INTERVAL)
      if (wanted) return { kind: 'update', update, required, messageKey: required ? 'update_play_required' : 'update_play_message' }
    }
    return null
  }

  function shown(prompt: ConfigPrompt): void {
    if (prompt.kind === 'notice') noticeShown = prompt.notice.id
    else if (prompt.required) requiredShown = true
  }

  function closed(prompt: ConfigPrompt, acknowledged: boolean, now: number): Promise<void> {
    if (prompt.kind === 'update') return memory.set({ updateVersion: prompt.update.latestVersionCode, updateAt: now })
    return acknowledged || !prompt.notice.important ? memory.set({ noticeSeen: prompt.notice.id }) : Promise.resolve()
  }

  return { load, next, shown, closed }
}
