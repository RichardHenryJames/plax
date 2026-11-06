import type { ReactNode } from 'react'
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { format, translate } from '../../../i18n'
import { en } from '../../../i18n/en'
import { hi } from '../../../i18n/hi'
import { LIGHT_PALETTE, DARK_PALETTE } from '../../theme'
import { AboutDialog, type AboutDialogProps } from '../AboutDialog'
import { ClearSavedDialog, DeleteAccountDialog } from '../ConfirmDialogs'
import { Contact } from '../ContactSheet'
import { NoticeDialog, type NoticeDialogProps } from '../NoticeDialog'
import { ThemeDialog } from '../ThemeDialog'
import { StoreUpdateDialog, UpdateOfferDialog } from '../UpdateDialogs'
import { LONG_HINDI, backButton, fixedHeightOffenders, resetWindow, setWindow, show, styleOf, wrap } from './helpers'

const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>

let calls: string[] = []
const log = (name: string) => () => {
  calls.push(name)
}

beforeEach(() => {
  calls = []
})
afterEach(resetWindow)

describe('the About dialog', () => {
  const about = (overrides: Partial<AboutDialogProps> = {}) => <AboutDialog visible versionName="2.0.0-preview" withAds={false} storeBuild={false} onPrivacy={log('privacy')} onDone={log('done')} {...overrides} />
  const text = () => screen.getByTestId('about-text').props.children as string

  it('is titled "About Plax", with Privacy policy and Done, and no third button', () => {
    show(about())
    expect(screen.getByRole('header', { name: en.about })).toBeTruthy()
    const buttons = screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)
    expect(buttons).toEqual([en.privacy_policy, en.done])
  })

  it('tells the website build the version, the address, how updates work and what it reads from the website', () => {
    show(about())
    expect(text()).toBe(`${translate('en', 'about_text', '2.0.0-preview', Contact.EMAIL)}\n\n${en.about_updates}\n\n${en.about_settings}\n\n${en.about_code}`)
    expect(text()).toContain('Version 2.0.0-preview.')
    // The address has a line to itself, so that it is never split across two.
    expect(text()).toContain(`\n${Contact.EMAIL}\n`)
  })

  it('does not describe the update check to the Google Play build, which Google Play updates', () => {
    show(about({ storeBuild: true, versionName: '2.0.0' }))
    expect(text()).toBe(`${translate('en', 'about_text', '2.0.0', Contact.EMAIL)}\n\n${en.about_settings}\n\n${en.about_code}`)
    expect(text()).not.toContain('Check for updates')
  })

  it('tells of the ads, and of the choices the reader has, in a build that shows them', () => {
    show(about({ withAds: true, storeBuild: true }))
    expect(text()).toBe(`${translate('en', 'about_text_ads', '2.0.0-preview', Contact.EMAIL)}\n\n${en.about_settings}\n\n${en.about_code}`)
    expect(text()).toContain('Plax shows ads from Google')
    expect(text()).toContain(`\n${Contact.EMAIL}\n`)
  })

  it('opens the privacy policy, and says Done from Done', () => {
    show(about())
    fireEvent.press(screen.getByLabelText(en.privacy_policy))
    fireEvent.press(screen.getByLabelText(en.done))
    expect(calls).toEqual(['privacy', 'done'])
  })

  it('is closed by a tap outside it and by the back button as by Done', () => {
    show(about())
    fireEvent.press(screen.getByTestId('scrim'))
    expect(calls).toEqual(['done'])
  })

  it('does not draw when it is not visible', () => {
    show(about({ visible: false }))
    expect(screen.queryByTestId('about-dialog')).toBeNull()
  })

  it('scrolls its text inside the dialog, which is never taller than the screen leaves it room for', () => {
    setWindow(360, 640)
    show(about(), { insets: { top: 24, bottom: 48 } })
    expect(flat(screen.getByTestId('about-scroll').props.style).maxHeight).toBe(640 - 24 - 48 - 280)
  })

  it('leaves room for the buttons on a very short screen too', () => {
    setWindow(640, 300)
    show(about())
    expect(flat(screen.getByTestId('about-scroll').props.style).maxHeight).toBe(120)
  })

  it('is in Hindi, with the address on a line of its own', () => {
    show(about(), { lang: 'hi' })
    expect(screen.getByRole('header', { name: hi.about })).toBeTruthy()
    expect(text()).toBe(`${translate('hi', 'about_text', '2.0.0-preview', Contact.EMAIL)}\n\n${hi.about_updates}\n\n${hi.about_settings}\n\n${hi.about_code}`)
    expect(text()).toContain(`\n${Contact.EMAIL}\n`)
    expect(screen.getByLabelText(hi.privacy_policy)).toBeTruthy()
    expect(screen.getByLabelText(hi.done)).toBeTruthy()
    expect(fixedHeightOffenders()).toEqual([])
  })

  it('is drawn in the dark theme', () => {
    show(about(), { mode: 'dark' })
    expect(flat(screen.getByTestId('about-text').props.style).color).toBe(DARK_PALETTE.text2)
  })
})

describe('the theme chooser', () => {
  const chooser = (mode: 'system' | 'light' | 'dark', visible = true) => <ThemeDialog visible={visible} mode={mode} onChoose={(chosen) => calls.push(`choose:${chosen}`)} onCancel={log('cancel')} />

  it('offers System default, Light and Dark, and Cancel', () => {
    show(chooser('system'))
    expect(screen.getByRole('header', { name: en.theme })).toBeTruthy()
    expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel)).toEqual([en.theme_system, en.theme_light, en.theme_dark])
    expect(screen.getByLabelText(en.cancel)).toBeTruthy()
  })

  it('marks the theme in use', () => {
    for (const [mode, label] of [['system', en.theme_system], ['light', en.theme_light], ['dark', en.theme_dark]] as const) {
      const { unmount } = show(chooser(mode))
      for (const other of [en.theme_system, en.theme_light, en.theme_dark]) {
        if (other === label) expect(screen.getByLabelText(other)).toBeChecked()
        else expect(screen.getByLabelText(other)).not.toBeChecked()
      }
      unmount()
    }
  })

  it('takes a press on a choice as the theme, the one in use included', () => {
    show(chooser('light'))
    fireEvent.press(screen.getByLabelText(en.theme_dark))
    fireEvent.press(screen.getByLabelText(en.theme_system))
    fireEvent.press(screen.getByLabelText(en.theme_light))
    expect(calls).toEqual(['choose:dark', 'choose:system', 'choose:light'])
  })

  it('changes nothing from Cancel, a tap outside or the back button', () => {
    show(chooser('dark'))
    fireEvent.press(screen.getByLabelText(en.cancel))
    fireEvent.press(screen.getByTestId('scrim'))
    expect(calls).toEqual(['cancel', 'cancel'])
  })

  it('does not draw when it is not visible', () => {
    show(chooser('dark', false))
    expect(screen.queryByTestId('theme-dialog')).toBeNull()
  })

  it('has choices 48 dp tall to touch, which grow with a large text', () => {
    show(chooser('system'))
    expect(styleOf('theme-light')).toMatchObject({ minHeight: 48 })
    expect(fixedHeightOffenders()).toEqual([])
  })

  it('is in Hindi', () => {
    show(chooser('dark'), { lang: 'hi' })
    expect(screen.getByRole('header', { name: hi.theme })).toBeTruthy()
    expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel)).toEqual([hi.theme_system, hi.theme_light, hi.theme_dark])
    expect(screen.getByLabelText(hi.theme_dark)).toBeChecked()
    expect(screen.getByLabelText(hi.cancel)).toBeTruthy()
  })

  it('draws the ring of the choice in the accent text colour of each theme', () => {
    const ringOf = () => {
      const radio = screen.getByLabelText(en.theme_dark)
      return flat((radio.children[0] as { props: { style: unknown } }).props.style).borderColor
    }
    const { unmount } = show(chooser('dark'))
    expect(ringOf()).toBe(LIGHT_PALETTE.accentText)
    unmount()
    show(chooser('dark'), { mode: 'dark' })
    expect(ringOf()).toBe(DARK_PALETTE.accentText)
  })
})

describe('a notice from the website', () => {
  const notice = (overrides: Partial<NoticeDialogProps> = {}) => (
    <NoticeDialog visible title="Scheduled maintenance" body="Plax will be briefly unavailable on Sunday." hasLink onDone={log('done')} onMore={log('more')} onCancel={log('cancel')} {...overrides} />
  )

  it('shows the title and the text it is given, with Learn more and Done', () => {
    show(notice())
    expect(screen.getByRole('header', { name: 'Scheduled maintenance' })).toBeTruthy()
    expect(screen.getByText('Plax will be briefly unavailable on Sunday.')).toBeTruthy()
    expect(screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual([en.notice_more, en.done])
  })

  it('has no Learn more when the notice has no link', () => {
    show(notice({ hasLink: false }))
    expect(screen.queryByLabelText(en.notice_more)).toBeNull()
    expect(screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual([en.done])
  })

  it('tells Done, Learn more and leaving apart', () => {
    show(notice())
    fireEvent.press(screen.getByLabelText(en.done))
    fireEvent.press(screen.getByLabelText(en.notice_more))
    fireEvent.press(screen.getByTestId('scrim'))
    expect(calls).toEqual(['done', 'more', 'cancel'])
  })

  it('does not draw when it is not visible', () => {
    show(notice({ visible: false }))
    expect(screen.queryByTestId('notice-dialog')).toBeNull()
  })

  it('shows the website\'s own Hindi text whole, in a dialog that grows no taller than the screen', () => {
    setWindow(360, 640)
    show(notice({ title: 'रखरखाव की सूचना', body: LONG_HINDI }), { lang: 'hi' })
    expect(screen.getByText(LONG_HINDI)).toBeTruthy()
    expect(screen.getByRole('header', { name: 'रखरखाव की सूचना' })).toBeTruthy()
    expect(screen.getByLabelText(hi.notice_more)).toBeTruthy()
    expect(screen.getByLabelText(hi.done)).toBeTruthy()
    expect(flat(screen.getByTestId('notice-scroll').props.style).maxHeight).toBe(640 - 280)
    expect(fixedHeightOffenders()).toEqual([])
  })

  it('is drawn in the dark theme', () => {
    show(notice(), { mode: 'dark' })
    expect(flat(screen.getByTestId('notice-body').props.style).color).toBe(DARK_PALETTE.text2)
  })
})

describe('the offer of a newer file for the website build', () => {
  const offer = (visible = true) => <UpdateOfferDialog visible={visible} versionName="9.9.9" onLater={log('later')} onDownload={log('download')} />

  it('says a newer Plax is ready, and offers Later and Download', () => {
    show(offer())
    expect(screen.getByRole('header', { name: 'Update available' })).toBeTruthy()
    expect(screen.getByText(format(en.update_message, ['9.9.9']))).toBeTruthy()
    expect(screen.getByText(/Plax 9\.9\.9 is ready/)).toBeTruthy()
    expect(screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual(['Later', 'Download'])
  })

  it('puts the offer off from Later and from leaving, and downloads from Download', () => {
    show(offer())
    fireEvent.press(screen.getByLabelText(en.update_later))
    fireEvent.press(screen.getByTestId('scrim'))
    fireEvent.press(screen.getByLabelText(en.update_download))
    expect(calls).toEqual(['later', 'later', 'download'])
  })

  it('does not draw when it is not visible', () => {
    show(offer(false))
    expect(screen.queryByTestId('update-dialog')).toBeNull()
  })

  it('is in Hindi', () => {
    show(offer(), { lang: 'hi' })
    expect(screen.getByText(hi.update_title)).toBeTruthy()
    expect(screen.getByText(format(hi.update_message, ['9.9.9']))).toBeTruthy()
    expect(screen.getByLabelText(hi.update_later)).toBeTruthy()
    expect(screen.getByLabelText(hi.update_download)).toBeTruthy()
  })
})

describe('the word that a newer version is on Google Play', () => {
  const store = (required: boolean, visible = true) => <StoreUpdateDialog visible={visible} versionName="9.9.9" required={required} onLater={log('later')} onUpdate={log('update')} />

  it('offers Update on Google Play, and Later', () => {
    show(store(false))
    expect(screen.getByRole('header', { name: en.update_title })).toBeTruthy()
    expect(screen.getByText(format(en.update_play_message, ['9.9.9']))).toBeTruthy()
    expect(screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual([en.update_later, en.update_play_button])
  })

  it('says that this version is out of date and may stop working, when the website requires the update', () => {
    show(store(true))
    expect(screen.getByText(format(en.update_play_required, ['9.9.9']))).toBeTruthy()
    expect(screen.queryByText(format(en.update_play_message, ['9.9.9']))).toBeNull()
    expect(en.update_play_required).toContain('out of date')
  })

  it('has Later in the required offer too, as the native dialog did', () => {
    show(store(true))
    fireEvent.press(screen.getByLabelText(en.update_later))
    fireEvent.press(screen.getByLabelText(en.update_play_button))
    fireEvent.press(screen.getByTestId('scrim'))
    expect(calls).toEqual(['later', 'update', 'later'])
  })

  it('does not draw when it is not visible', () => {
    show(store(false, false))
    expect(screen.queryByTestId('store-update-dialog')).toBeNull()
  })

  it('is in Hindi, in both words', () => {
    const { unmount } = show(store(false), { lang: 'hi' })
    expect(screen.getByText(format(hi.update_play_message, ['9.9.9']))).toBeTruthy()
    expect(screen.getByLabelText(hi.update_play_button)).toBeTruthy()
    unmount()
    show(store(true), { lang: 'hi' })
    expect(screen.getByText(format(hi.update_play_required, ['9.9.9']))).toBeTruthy()
  })
})

describe('the questions before something cannot be undone', () => {
  it('asks before every saved story is removed, in the words for a reader who has no account', () => {
    show(<ClearSavedDialog visible signedIn={false} onCancel={log('cancel')} onConfirm={log('confirm')} />)
    expect(screen.getByRole('header', { name: en.clear_saved })).toBeTruthy()
    expect(screen.getByText(en.clear_confirm)).toBeTruthy()
    expect(screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual([en.cancel, en.clear])
  })

  it('says that a signed-in reader\'s saved stories are removed from the account too', () => {
    show(<ClearSavedDialog visible signedIn onCancel={log('cancel')} onConfirm={log('confirm')} />)
    expect(screen.getByText(en.clear_confirm_account)).toBeTruthy()
    expect(screen.queryByText(en.clear_confirm)).toBeNull()
  })

  it('clears from Clear and keeps the stories from Cancel and from leaving', () => {
    show(<ClearSavedDialog visible signedIn={false} onCancel={log('cancel')} onConfirm={log('confirm')} />)
    fireEvent.press(screen.getByLabelText(en.cancel))
    fireEvent.press(screen.getByTestId('scrim'))
    expect(calls).toEqual(['cancel', 'cancel'])
    fireEvent.press(screen.getByLabelText(en.clear))
    expect(calls).toEqual(['cancel', 'cancel', 'confirm'])
  })

  it('asks before the account is deleted, and says what goes and what stays', () => {
    show(<DeleteAccountDialog visible onCancel={log('cancel')} onConfirm={log('confirm')} />)
    expect(screen.getByRole('header', { name: 'Delete your Plax account?' })).toBeTruthy()
    expect(screen.getByTestId('delete-account-message').props.children).toBe(en.account_delete_message)
    expect(en.account_delete_message).toContain('Topics and saved stories already on this phone stay here.')
    expect(screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual([en.cancel, 'Delete permanently'])
  })

  it('deletes only from Delete permanently', () => {
    show(<DeleteAccountDialog visible onCancel={log('cancel')} onConfirm={log('confirm')} />)
    fireEvent.press(screen.getByLabelText(en.cancel))
    fireEvent.press(screen.getByTestId('scrim'))
    expect(calls).toEqual(['cancel', 'cancel'])
    fireEvent.press(screen.getByLabelText(en.account_delete_confirm))
    expect(calls).toEqual(['cancel', 'cancel', 'confirm'])
  })

  it('does not draw when it is not visible', () => {
    const { rerender } = show(<DeleteAccountDialog visible onCancel={log('cancel')} onConfirm={log('confirm')} />)
    rerender(wrap(<DeleteAccountDialog visible={false} onCancel={log('cancel')} onConfirm={log('confirm')} />))
    expect(screen.queryByTestId('delete-account-dialog')).toBeNull()
    rerender(wrap(<ClearSavedDialog visible={false} signedIn={false} onCancel={log('cancel')} onConfirm={log('confirm')} />))
    expect(screen.queryByTestId('clear-saved-dialog')).toBeNull()
  })

  it('is in Hindi, and scrolls the long warning of the account on a short screen', () => {
    setWindow(360, 600)
    const { unmount } = show(<DeleteAccountDialog visible onCancel={log('cancel')} onConfirm={log('confirm')} />, { lang: 'hi' })
    expect(screen.getByRole('header', { name: hi.account_delete_title })).toBeTruthy()
    expect(screen.getByTestId('delete-account-message').props.children).toBe(hi.account_delete_message)
    expect(screen.getByLabelText(hi.account_delete_confirm)).toBeTruthy()
    expect(flat(screen.getByTestId('delete-account-scroll').props.style).maxHeight).toBe(600 - 280)
    expect(fixedHeightOffenders()).toEqual([])
    unmount()
    show(<ClearSavedDialog visible signedIn onCancel={log('cancel')} onConfirm={log('confirm')} />, { lang: 'hi' })
    expect(screen.getByText(hi.clear_confirm_account)).toBeTruthy()
    expect(screen.getByLabelText(hi.clear)).toBeTruthy()
    expect(screen.getByLabelText(hi.cancel)).toBeTruthy()
  })
})

describe('the back button', () => {
  it('answers every dialog as a tap outside it does: the same way as leaving, never as a choice', () => {
    const cases: [string, ReactNode, string][] = [
      ['About', <AboutDialog key="about" visible versionName="2.0.0" withAds={false} storeBuild={false} onPrivacy={log('privacy')} onDone={log('done')} />, 'done'],
      ['the theme', <ThemeDialog key="theme" visible mode="system" onChoose={(mode) => calls.push(`choose:${mode}`)} onCancel={log('cancel')} />, 'cancel'],
      ['a notice', <NoticeDialog key="notice" visible title="Title" body="Body" hasLink onDone={log('done')} onMore={log('more')} onCancel={log('cancel')} />, 'cancel'],
      ['an offer', <UpdateOfferDialog key="offer" visible versionName="9.9.9" onLater={log('later')} onDownload={log('download')} />, 'later'],
      ['the Google Play word', <StoreUpdateDialog key="store" visible versionName="9.9.9" required onLater={log('later')} onUpdate={log('update')} />, 'later'],
      ['clearing', <ClearSavedDialog key="clear" visible signedIn={false} onCancel={log('cancel')} onConfirm={log('confirm')} />, 'cancel'],
      ['deleting the account', <DeleteAccountDialog key="delete" visible onCancel={log('cancel')} onConfirm={log('confirm')} />, 'cancel'],
    ]
    for (const [name, node, expected] of cases) {
      calls = []
      const back = backButton()
      const { unmount } = show(node)
      expect({ name, answered: back.press(), calls }).toEqual({ name, answered: true, calls: [expected] })
      unmount()
      back.restore()
    }
  })

  it('is not listened to by a dialog that is not visible', () => {
    const back = backButton()
    show(<ClearSavedDialog visible={false} signedIn={false} onCancel={log('cancel')} onConfirm={log('confirm')} />)
    expect(back.listening()).toBe(0)
    expect(back.press()).toBe(false)
    back.restore()
  })
})
