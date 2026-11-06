import { Contact } from '../ui/screens'
import { isWebLink } from '../data/story'
import type { StringKey } from '../i18n'

export interface LinkOpenerDeps {
  /** Opens the address in the phone's browser (a Custom Tab). Rejects when there is no browser. */
  readonly browser: (url: string) => Promise<unknown>
  readonly say: (key: StringKey) => void
  /** Whether this address may be opened (default: an https address with a host: isWebLink). */
  readonly allowed?: (url: string) => boolean
}

export interface LinkOpener {
  /** Opens a link of the website or of a publisher. Anything that is not a plain https address is refused, and the reader is told. */
  open(link: string): void
}

/** MainActivity.open: what is not a web link is never handed to the phone, and a phone with no browser is told so. */
export function createLinkOpener(deps: LinkOpenerDeps): LinkOpener {
  const allowed = deps.allowed ?? isWebLink
  return {
    open(link) {
      if (!allowed(link)) {
        deps.say('source_unavailable')
        return
      }
      deps.browser(link).catch(() => deps.say('browser_unavailable'))
    },
  }
}

export interface ContactDeps {
  /** Opens an address in the phone: a mail app for mailto:. Rejects when there is nothing to open it. */
  readonly openUrl: (url: string) => Promise<unknown>
  readonly copy: (text: string) => Promise<unknown>
  readonly say: (key: StringKey, long?: boolean) => void
  readonly appName: () => string
  readonly versionName: () => string
  /** The phone's Android API level. */
  readonly sdk: number
}

export interface ContactActions {
  /** Opens a new message to us in the reader's mail app. With no mail app the address is copied, so it is never a dead end. */
  email(): Promise<void>
  /** Puts the address on the clipboard. From Android 13 the system says so itself. */
  copy(): Promise<void>
}

export function createContactActions(deps: ContactDeps): ContactActions {
  async function copy(noMailApp: boolean): Promise<void> {
    try {
      await deps.copy(Contact.EMAIL)
    } catch {
      return
    }
    if (noMailApp) deps.say('contact_no_mail', true)
    else if (deps.sdk < 33) deps.say('contact_copied')
  }
  return {
    async email() {
      const subject = encodeURIComponent(Contact.subject(deps.appName(), deps.versionName()))
      try {
        await deps.openUrl(`${Contact.mailto()}?subject=${subject}`)
      } catch {
        await copy(true)
      }
    },
    copy: () => copy(false),
  }
}
