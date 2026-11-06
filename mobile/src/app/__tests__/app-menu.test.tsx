import { act, screen } from '@testing-library/react-native'
import { story, stories as makeStories } from '../../data/__tests__/helpers'
import { hi } from '../../i18n/hi'
import { configText } from '../../config/__tests__/helpers'
import { flushPromises } from '../../test/helpers'
import { measureEverything } from '../../test/measure'
import { forgetMeasures } from '../../ui/story/measure'
import { chooseFromMenu, mountApp, openMenu, press, SITE } from './rig'

beforeEach(() => forgetMeasures())

describe('the language', () => {
  it('reads the feed in the other language and speaks it everywhere', async () => {
    const rig = await mountApp()
    await chooseFromMenu('menu-language-hi')
    expect(rig.services.engine.getState().lang).toBe('hi')
    expect(rig.source.last.request.lang).toBe('hi')
    expect(await rig.services.prefs.language()).toBe('hi')
    await openMenu()
    expect(screen.getByTestId('menu-topics')).toHaveTextContent(hi.topics)
    expect(screen.getByTestId('menu-account')).toHaveTextContent(hi.account)
  })

  it('goes back to English the same way', async () => {
    const rig = await mountApp({ storage: { 'plax.language': 'hi' } })
    expect(rig.services.engine.getState().lang).toBe('hi')
    await chooseFromMenu('menu-language-en')
    expect(rig.services.engine.getState().lang).toBe('en')
    expect(await rig.services.prefs.language()).toBe('en')
  })
})

describe('the sections of the news', () => {
  it('narrows the feed to one section, and back to all', async () => {
    const rig = await mountApp()
    await chooseFromMenu('menu-section-india')
    expect(rig.services.engine.getState().section).toBe('india')
    await chooseFromMenu('menu-section-all')
    expect(rig.services.engine.getState().section).toBe('')
  })

  it('offers the sections the website lists, not only the built-in ones', async () => {
    const rig = await mountApp({ website: { [`${SITE}/app-config.json`]: configText('"sections":[{"id":"sport","en":"Sport","hi":"खेल"}]') } })
    await rig.settle()
    await openMenu()
    expect(screen.getByTestId('menu-section-sport')).toBeTruthy()
    expect(screen.queryByTestId('menu-section-india')).toBeNull()
  })
})

describe('the choice of topics', () => {
  it('saves the topics the reader picks, opens For you the first time, and says so', async () => {
    const rig = await mountApp()
    await chooseFromMenu('menu-topics')
    await press(screen.getByTestId('interests-card'))
    expect(screen.getByTestId('interests-sheet')).toBeTruthy()
    expect(screen.getByTestId('interests-save')).toBeDisabled()
    await press(screen.getByTestId('interest-space'))
    await press(screen.getByTestId('interest-science'))
    await press(screen.getByTestId('interests-save'))
    expect([...rig.services.engine.getState().interests]).toEqual(['science', 'space'])
    expect(rig.services.engine.getState().screen).toBe('forYou')
    expect(rig.source.last.request.categories).toBe('science,space')
    expect(screen.getByTestId('toast')).toHaveTextContent('Topics saved')
    expect(screen.queryByTestId('interests-sheet')).toBeNull()
  })

  it('keeps the screen the reader is on when they change topics they already had', async () => {
    const rig = await mountApp({ storage: { 'plax.interests': 'science', 'plax.for-you': 'false' } })
    expect([...rig.services.engine.getState().interests]).toEqual(['science'])
    await chooseFromMenu('menu-topics')
    await press(screen.getByTestId('interests-card'))
    await press(screen.getByTestId('interest-space'))
    await press(screen.getByTestId('interests-save'))
    expect([...rig.services.engine.getState().interests]).toEqual(['science', 'space'])
    expect(rig.services.engine.getState().screen).toBe('topics')
  })

  it('opens from For you when there are no topics, and from the Topics card', async () => {
    await mountApp()
    await chooseFromMenu('menu-for-you')
    await press(screen.getByText('Choose topics'))
    expect(screen.getByTestId('interests-sheet')).toBeTruthy()
  })
})

describe('the theme', () => {
  it('draws the whole app in the theme the reader chooses, and remembers it', async () => {
    const rig = await mountApp()
    const background = () => (screen.getByTestId('app-shell').props.style as { backgroundColor: string }).backgroundColor
    expect(background()).toBe('#F7F5F0')
    await chooseFromMenu('menu-theme')
    expect(screen.getByTestId('theme-system')).toBeChecked()
    await press(screen.getByTestId('theme-dark'))
    expect(background()).toBe('#0B0B0E')
    expect(await rig.services.prefs.theme()).toBe('dark')
    expect(screen.queryByTestId('theme-dialog')).toBeNull()
  })

  it('starts in the theme the reader chose last time', async () => {
    await mountApp({ storage: { 'plax.theme': 'dark' } })
    expect((screen.getByTestId('app-shell').props.style as { backgroundColor: string }).backgroundColor).toBe('#0B0B0E')
  })

  it('changes nothing when the dialog is cancelled', async () => {
    const rig = await mountApp()
    await chooseFromMenu('menu-theme')
    await press(screen.getByText('Cancel'))
    expect(await rig.services.prefs.theme()).toBe('system')
  })
})

describe('About', () => {
  it('names the version and tells what the app does with the reader’s data, with the way to the privacy policy', async () => {
    const rig = await mountApp()
    await chooseFromMenu('menu-about')
    expect(screen.getByTestId('about-text')).toHaveTextContent(/Version 2\.0\.0/)
    expect(screen.getByTestId('about-text')).toHaveTextContent(/richardhenryjames64@gmail\.com/)
    await press(screen.getByText('Privacy policy'))
    expect(rig.host.browser).toEqual([`${SITE}/privacy`])
  })

  it('describes the update check for the website’s build and not for the Google Play build', async () => {
    await mountApp()
    await chooseFromMenu('menu-about')
    expect(screen.getByTestId('about-text')).toHaveTextContent(/Once a day, and when you choose Check for updates/)
  })

  it('tells of the ads in the Google Play build, which has them', async () => {
    await mountApp({ variant: 'play', bannerOn: true, pagesOn: true })
    await chooseFromMenu('menu-about')
    expect(screen.getByTestId('about-text')).toHaveTextContent(/Plax shows ads from Google/)
  })

  it('closes with Done', async () => {
    await mountApp()
    await chooseFromMenu('menu-about')
    await press(screen.getByText('Done'))
    expect(screen.queryByTestId('about-dialog')).toBeNull()
  })
})

describe('Contact us', () => {
  it('writes to us in the mail app, with the app and its version in the subject', async () => {
    const rig = await mountApp()
    await chooseFromMenu('menu-contact')
    await press(screen.getByTestId('contact-email'))
    expect(rig.host.urls).toEqual(['mailto:richardhenryjames64@gmail.com?subject=Plax%202.0.0%20feedback'])
  })

  it('copies the address instead when the phone has no mail app, and says so', async () => {
    const rig = await mountApp()
    rig.host.noMailApp = true
    await chooseFromMenu('menu-contact')
    await press(screen.getByTestId('contact-email'))
    expect(rig.host.copied).toEqual(['richardhenryjames64@gmail.com'])
    expect(screen.getByTestId('toast')).toHaveTextContent(/No email app is available/)
  })

  it('copies the address, and opens the contact page', async () => {
    const rig = await mountApp()
    await chooseFromMenu('menu-contact')
    await press(screen.getByTestId('contact-copy'))
    expect(rig.host.copied).toEqual(['richardhenryjames64@gmail.com'])
    await press(screen.getByTestId('contact-page'))
    expect(rig.host.browser).toEqual([`${SITE}/contact`])
  })
})

describe('the account', () => {
  it('starts the sign-in from the sheet, and shows the wait with a way out', async () => {
    const rig = await mountApp()
    await chooseFromMenu('menu-account')
    await press(screen.getByTestId('account-sign-in'))
    expect(rig.account.calls).toContain('signIn')
    act(() => rig.account.set({ status: 'signingIn', busy: false }))
    expect(screen.getByText('Waiting for Google sign-in…')).toBeTruthy()
    await press(screen.getByTestId('account-cancel'))
    expect(rig.account.calls).toContain('cancel')
  })

  it('says it signed in, once, and shows who the reader is', async () => {
    const rig = await mountApp()
    await chooseFromMenu('menu-account')
    act(() => rig.account.set({ status: 'signingIn' }))
    act(() => rig.account.set({ status: 'signedIn', name: 'Asha', email: 'asha@example.com', busy: false }))
    expect(screen.getByTestId('toast')).toHaveTextContent('Signed in')
    expect(screen.getByText('Signed in as Asha')).toBeTruthy()
  })

  it('signs out, and says so', async () => {
    const rig = await mountApp()
    act(() => rig.account.set({ status: 'signedIn', name: 'Asha', email: 'asha@example.com' }))
    await chooseFromMenu('menu-account')
    await press(screen.getByTestId('account-sign-out'))
    expect(rig.account.calls).toContain('signOut')
    act(() => rig.account.set({ status: 'signedOut', name: '', email: '', message: 'account_signed_out' }))
    expect(screen.getByTestId('toast')).toHaveTextContent(/^Signed out\./)
  })

  it('asks first, and then deletes the account', async () => {
    const rig = await mountApp()
    act(() => rig.account.set({ status: 'signedIn', name: 'Asha', email: 'asha@example.com' }))
    await chooseFromMenu('menu-account')
    await press(screen.getByTestId('account-delete'))
    expect(screen.getByTestId('delete-account-dialog')).toBeTruthy()
    expect(rig.account.calls).not.toContain('deleteAccount')
    await press(screen.getByText('Delete permanently'))
    expect(rig.account.calls).toContain('deleteAccount')
    expect(screen.queryByTestId('delete-account-dialog')).toBeNull()
  })

  it('does not delete anything when the question is cancelled', async () => {
    const rig = await mountApp()
    act(() => rig.account.set({ status: 'signedIn', name: 'Asha', email: 'asha@example.com' }))
    await chooseFromMenu('menu-account')
    await press(screen.getByTestId('account-delete'))
    await press(screen.getByText('Cancel'))
    expect(rig.account.calls).not.toContain('deleteAccount')
  })

  it('opens the choice of topics from the signed-in sheet', async () => {
    const rig = await mountApp()
    act(() => rig.account.set({ status: 'signedIn', name: 'Asha', email: 'asha@example.com' }))
    await chooseFromMenu('menu-account')
    await press(screen.getByTestId('account-interests'))
    expect(screen.getByTestId('interests-sheet')).toBeTruthy()
  })

  it('opens the website’s account page and the privacy policy', async () => {
    const rig = await mountApp()
    act(() => rig.account.set({ status: 'signedIn', name: 'Asha', email: 'asha@example.com' }))
    await chooseFromMenu('menu-account')
    await press(screen.getByTestId('account-website'))
    expect(rig.host.browser).toEqual([SITE])
  })

  it('opens from the empty For you page for a reader who has an account', async () => {
    await mountApp()
    await chooseFromMenu('menu-for-you')
    await press(screen.getByText('I have a Plax account'))
    expect(screen.getByTestId('account-sheet')).toBeTruthy()
  })
})

describe('the saved stories', () => {
  it('saves a story and lists it on Saved', async () => {
    const rig = await mountApp({ stories: [story('s1', 'The first headline'), ...makeStories('t', 4)] })
    await rig.settle()
    measureEverything(360)
    await press(screen.getAllByTestId('save')[0])
    expect(rig.host.confirms).toBe(1)
    expect(rig.services.engine.getState().savedIds.has('s1')).toBe(true)
    await chooseFromMenu('menu-saved')
    expect(rig.services.engine.getState().screen).toBe('saved')
    expect(rig.services.engine.getState().stories.map((s) => s.id)).toEqual(['s1'])
  })

  it('asks before it clears them all, and clears them when told to', async () => {
    const rig = await mountApp({ stories: [story('s1'), ...makeStories('t', 4)] })
    measureEverything(360)
    await press(screen.getAllByTestId('save')[0])
    await chooseFromMenu('menu-clear-saved')
    expect(screen.getByTestId('clear-saved-dialog')).toBeTruthy()
    expect(screen.getByText('Remove all stories saved on this phone? This cannot be undone.')).toBeTruthy()
    await press(screen.getByText('Cancel'))
    expect(rig.services.engine.getState().savedIds.size).toBe(1)
    await chooseFromMenu('menu-clear-saved')
    await press(screen.getByText('Clear'))
    await act(async () => void (await flushPromises()))
    expect(rig.services.engine.getState().savedIds.size).toBe(0)
  })

  it('says the account’s copies go too when the reader is signed in', async () => {
    const rig = await mountApp()
    act(() => rig.account.set({ status: 'signedIn', name: 'Asha', email: 'asha@example.com' }))
    await chooseFromMenu('menu-clear-saved')
    expect(screen.getByText(/They are removed from your Plax account too/)).toBeTruthy()
  })
})
