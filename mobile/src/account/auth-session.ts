import * as WebBrowser from 'expo-web-browser'
import type { OpenAuthSession } from './account-manager'

/**
 * The system browser (a Chrome Custom Tab) for the sign-in. It opens in the app's own task, as the native app's did, so that the
 * browser's return finds the app where it was. What it returns is passed on as it is: only a callback address ("success") signs anyone in.
 */
export const openAuthSession: OpenAuthSession = (url, redirectUrl) =>
  WebBrowser.openAuthSessionAsync(url, redirectUrl, { showTitle: true, createTask: false })
