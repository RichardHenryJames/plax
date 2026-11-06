import * as screens from '../index'

describe('what the folder gives the shell', () => {
  it('has every screen, sheet, dialog and state of the native app that is not a story', () => {
    const names = [
      'MenuPanel',
      'TopicsScreen',
      'InterestsSheet',
      'SavedScreen',
      'DeeperSheet',
      'AccountSheet',
      'ContactSheet',
      'Contact',
      'AboutDialog',
      'ThemeDialog',
      'NoticeDialog',
      'UpdateOfferDialog',
      'StoreUpdateDialog',
      'ClearSavedDialog',
      'DeleteAccountDialog',
      'FeedLoading',
      'FeedEmpty',
      'EmptyPanel',
      'FeedBanner',
      'NewStoriesPill',
      'RefreshSpinner',
      'CaughtUpPage',
      'NoInsets',
    ]
    for (const name of names) expect({ name, kind: typeof (screens as Record<string, unknown>)[name] }).toEqual({ name, kind: name === 'Contact' ? 'object' : 'function' })
  })
})
