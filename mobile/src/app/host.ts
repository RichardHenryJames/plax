import * as Clipboard from 'expo-clipboard'
import * as WebBrowser from 'expo-web-browser'
import { BackHandler, Linking, Platform, Share } from 'react-native'
import { confirm, reportFullyDrawn, tick } from '../platform/native'

/** What the app asks of the phone itself: the browser, the mail app, the clipboard, the share sheet. The shell takes it as a parameter, so that a test can stand in for the phone. */
export interface Host {
  /** Opens an address in the phone's browser, as a Custom Tab over the app. Rejects when there is no browser. */
  openBrowser(url: string): Promise<unknown>
  /** Hands an address to whatever app on the phone handles it (a mail app for mailto:, the browser for the update). Rejects when none does. */
  openUrl(url: string): Promise<unknown>
  copy(text: string): Promise<unknown>
  /** Opens the share sheet with this text. Resolves false when the phone has no app to share to. */
  share(message: string, title: string): Promise<boolean>
  /** Leaves the app (the back button on the first screen). */
  exit(): void
  /** The touch feedback the native app gave: a light tick as a page changes, a firmer one when a story is saved. */
  tick(): void
  confirm(): void
  /** The first stories are on the screen (once per start): the system measures the time the app took to show them. */
  fullyDrawn(): void
  /** The phone's Android API level. */
  readonly sdk: number
}

export const phoneHost: Host = {
  openBrowser: (url) => WebBrowser.openBrowserAsync(url, { showTitle: true, createTask: false }),
  openUrl: (url) => Linking.openURL(url),
  copy: (text) => Clipboard.setStringAsync(text),
  async share(message, title) {
    try {
      await Share.share({ message }, { dialogTitle: title })
      return true
    } catch {
      return false
    }
  },
  exit: () => BackHandler.exitApp(),
  tick,
  confirm,
  fullyDrawn: reportFullyDrawn,
  sdk: Number(Platform.Version),
}
