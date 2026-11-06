import { act, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { configText, noticePart, updatePart } from '../../config/__tests__/helpers'
import { story, stories as makeStories } from '../../data/__tests__/helpers'
import { DeeperError, deeperCache, type DeeperSource } from '../../data/deeper-api'
import { makeStory } from '../../data/story'
import { flushPromises } from '../../test/helpers'
import { measureEverything } from '../../test/measure'
import { manifestText } from '../../updates/__tests__/helpers'
import { forgetMeasures } from '../../ui/story/measure'
import { chooseFromMenu, mountApp, pressBack, press, SITE } from './rig'

beforeEach(() => {
  forgetMeasures()
  deeperCache.clear()
})

const configWith = (parts: string) => ({ [`${SITE}/app-config.json`]: configText(parts) })
const SIGNED = makeStory({ id: 'signed', title: 'A story with a page', content: 'Some words that make a summary.', sourceUrl: 'https://publisher.example/signed', sig: 'b'.repeat(32) })

describe('reading the full story', () => {
  it('opens the publisher’s page when the headline is pressed', async () => {
    const rig = await mountApp({ stories: [story('s1', 'Pressable headline'), ...makeStories('t', 3)] })
    measureEverything(360)
    await press(screen.getAllByTestId('headline')[0])
    expect(rig.host.browser).toEqual(['https://example.com/s1'])
  })

  it('does not offer a headline that goes nowhere when the story has no usable link', async () => {
    const rig = await mountApp({ stories: [makeStory({ id: 'x', title: 'No link here', content: 'Some words that make a summary.', sourceUrl: 'http://insecure.example/x' }), ...makeStories('t', 3)] })
    measureEverything(360)
    await press(screen.getAllByTestId('headline')[0])
    expect(rig.host.browser).toEqual([])
  })

  it('says so when the phone has no browser', async () => {
    const rig = await mountApp({ stories: [story('s1', 'Pressable headline'), ...makeStories('t', 3)] })
    rig.host.noBrowser = true
    measureEverything(360)
    await press(screen.getAllByTestId('headline')[0])
    expect(screen.getByTestId('toast')).toHaveTextContent('No browser is available to open this link.')
  })
})

describe('sharing a story', () => {
  it('shares the publisher’s link at once for a story that cannot have a page of its own', async () => {
    const rig = await mountApp({ stories: [story('s1', 'Shared headline'), ...makeStories('t', 3)] })
    measureEverything(360)
    await press(screen.getAllByTestId('share')[0])
    expect(rig.host.shared).toEqual([{ message: 'Shared headline\nhttps://example.com/s1', title: 'Share story' }])
  })

  it('shares the page the Plax website made for a story it signed', async () => {
    const link = 'https://plax-rouge.vercel.app/news/s/a-story-with-a-page-bbbbbbbbbbbbbbbb'
    const rig = await mountApp({ stories: [SIGNED, ...makeStories('t', 3)], share: { link: async () => link } })
    measureEverything(360)
    await press(screen.getAllByTestId('share')[0])
    expect(rig.host.shared).toEqual([{ message: `A story with a page\n${link}`, title: 'Share story' }])
  })

  it('falls back to the publisher’s link when the website switches pages off', async () => {
    const link = 'https://plax-rouge.vercel.app/news/s/a-story-with-a-page-bbbbbbbbbbbbbbbb'
    const rig = await mountApp({ stories: [SIGNED, ...makeStories('t', 3)], share: { link: async () => link }, website: configWith('"features":{"shareLinks":false}') })
    await rig.settle()
    measureEverything(360)
    await press(screen.getAllByTestId('share')[0])
    expect(rig.host.shared).toEqual([{ message: 'A story with a page\nhttps://publisher.example/signed', title: 'Share story' }])
  })

  it('says so when there is no app to share to', async () => {
    const rig = await mountApp({ stories: [story('s1'), ...makeStories('t', 3)] })
    rig.host.noShare = true
    measureEverything(360)
    await press(screen.getAllByTestId('share')[0])
    expect(screen.getByTestId('toast')).toHaveTextContent('No app is available to share this story.')
  })
})

describe('Go deeper', () => {
  function source() {
    const asks: { lang: string; resolve: (insights: string[]) => void; reject: (error: unknown) => void; signal?: AbortSignal }[] = []
    const deeper: DeeperSource = {
      deeper: (_story, lang, signal) =>
        new Promise((resolve, reject) => {
          asks.push({ lang, signal, resolve: (insights) => resolve({ insights }), reject })
        }),
    }
    return { deeper, asks }
  }

  it('shows the facts in the language of the feed, as numbered cards, with the note that AI wrote them', async () => {
    const { deeper, asks } = source()
    await mountApp({ deeper })
    measureEverything(360)
    await press(screen.getAllByTestId('deeper')[0])
    expect(screen.getByTestId('deeper-sheet')).toBeTruthy()
    expect(screen.getByTestId('deeper-loading')).toBeTruthy()
    expect(asks).toHaveLength(1)
    expect(asks[0].lang).toBe('en')
    await act(async () => {
      asks[0].resolve(['First fact', 'Second fact'])
      await flushPromises()
    })
    expect(screen.getByTestId('insight-1')).toBeTruthy()
    expect(screen.getByText('Second fact')).toBeTruthy()
    expect(screen.getByText('Written by AI. It can contain mistakes, so check anything that matters.')).toBeTruthy()
  })

  it('asks again in the other language from its chip', async () => {
    const { deeper, asks } = source()
    await mountApp({ deeper })
    measureEverything(360)
    await press(screen.getAllByTestId('deeper')[0])
    await press(screen.getByTestId('deeper-hindi'))
    expect(asks.map((ask) => ask.lang)).toEqual(['en', 'hi'])
    expect(asks[0].signal?.aborted).toBe(true)
  })

  it('says it could not, and tries again', async () => {
    const { deeper, asks } = source()
    await mountApp({ deeper })
    measureEverything(360)
    await press(screen.getAllByTestId('deeper')[0])
    await act(async () => {
      asks[0].reject(new DeeperError('Request refused'))
      await flushPromises()
    })
    expect(screen.getByTestId('deeper-error')).toBeTruthy()
    await press(screen.getByTestId('deeper-retry'))
    expect(asks).toHaveLength(2)
  })

  it('abandons the request when the sheet is closed', async () => {
    const { deeper, asks } = source()
    await mountApp({ deeper })
    measureEverything(360)
    await press(screen.getAllByTestId('deeper')[0])
    await press(screen.getByTestId('sheet-close'))
    expect(asks[0].signal?.aborted).toBe(true)
    expect(screen.queryByTestId('deeper-sheet')).toBeNull()
  })

  it('is not offered when the website has switched it off', async () => {
    const rig = await mountApp({ website: configWith('"features":{"deeper":false}') })
    await rig.settle()
    measureEverything(360)
    expect(screen.queryAllByTestId('deeper')).toHaveLength(0)
    expect(screen.getAllByTestId('save').length).toBeGreaterThan(0)
  })
})

describe('what the website decides', () => {
  it('names the publisher in the line over the story only when the website says to', async () => {
    const rig = await mountApp({ stories: [story('s1', 'Headline one'), ...makeStories('t', 3)] })
    measureEverything(360)
    expect(screen.getAllByTestId('credit')[0]).not.toHaveTextContent(/Publisher/)
    rig.website.set(`${SITE}/app-config.json`, configText('"features":{"sourceName":true}'))
    await act(async () => {
      await rig.services.appConfig.refresh({ force: true })
    })
    await rig.settle()
    measureEverything(360)
    expect(screen.getAllByTestId('credit')[0]).toHaveTextContent(/^Publisher ·/)
  })

  it('offers the topics the website lists', async () => {
    const rig = await mountApp({ website: configWith('"topics":[{"id":"news","emoji":"📰","en":"Headlines","hi":"सुर्ख़ियाँ"},{"id":"cooking","emoji":"🍳","en":"Cooking","hi":"खाना"}]') })
    await rig.settle()
    await chooseFromMenu('menu-topics')
    expect(screen.getByLabelText('Cooking')).toBeTruthy()
    expect(screen.queryByLabelText('Science')).toBeNull()
  })

  it('adds the rows the website lists to the menu, and opens them in the browser', async () => {
    const rig = await mountApp({ website: configWith('"links":[{"id":"help","en":"Help centre","hi":"सहायता","url":"https://plax-rouge.vercel.app/news/help","build":"all"}]') })
    await rig.settle()
    await chooseFromMenu('menu-link-help')
    expect(rig.host.browser).toEqual(['https://plax-rouge.vercel.app/news/help'])
  })

  it('shows a notice once, and never again after the reader has said Done', async () => {
    const rig = await mountApp({ website: configWith(noticePart('n1', 'info')) })
    await rig.settle()
    expect(screen.getByTestId('notice-dialog')).toBeTruthy()
    expect(screen.getByText('T')).toBeTruthy()
    expect(screen.getByText('B')).toBeTruthy()
    await press(screen.getByText('Done'))
    expect(screen.queryByTestId('notice-dialog')).toBeNull()
    expect(rig.storage.data.get('plax.prompts.noticeSeen')).toBe('n1')
  })

  it('opens the notice’s page from Learn more, which counts as read', async () => {
    const rig = await mountApp({ website: configWith(noticePart('n2', 'info', ',"url":"https://plax-rouge.vercel.app/news/notice"')) })
    await rig.settle()
    await press(screen.getByText('Learn more'))
    expect(rig.host.browser).toEqual(['https://plax-rouge.vercel.app/news/notice'])
    expect(rig.storage.data.get('plax.prompts.noticeSeen')).toBe('n2')
  })

  it('does not count an important notice as read when the reader leaves it with the back button', async () => {
    const rig = await mountApp({ website: configWith(noticePart('n3', 'important')) })
    await rig.settle()
    await pressBack()
    expect(screen.queryByTestId('notice-dialog')).toBeNull()
    expect(rig.storage.data.get('plax.prompts.noticeSeen')).toBeUndefined()
  })

  it('counts a plain notice as read however the reader leaves it', async () => {
    const rig = await mountApp({ website: configWith(noticePart('n4', 'info')) })
    await rig.settle()
    await pressBack()
    expect(rig.storage.data.get('plax.prompts.noticeSeen')).toBe('n4')
  })

  it('tells the Google Play build that a newer version is on Google Play, and takes it there', async () => {
    const rig = await mountApp({ variant: 'play', website: configWith(updatePart(21, 1)) })
    await rig.settle()
    expect(screen.getByTestId('store-update-dialog')).toBeTruthy()
    expect(screen.getByText(/Plax 1\.7\.0 is on Google Play/)).toBeTruthy()
    await press(screen.getByText('Update'))
    expect(rig.host.browser).toEqual(['https://play.google.com/store/apps/details?id=com.plaxlabs.news'])
  })

  it('tells a Google Play build that is below the least supported version that it may stop working', async () => {
    await mountApp({ variant: 'play', website: configWith(updatePart(25, 21)) })
    expect(await screen.findByText(/may stop working properly/)).toBeTruthy()
  })

  it('never shows the Google Play update to the website’s build', async () => {
    const rig = await mountApp({ variant: 'preview', website: configWith(updatePart(21, 1)) })
    await rig.settle()
    expect(screen.queryByTestId('store-update-dialog')).toBeNull()
  })
})

describe('updates of the website’s build', () => {
  const NEWER = manifestText({ versionCode: 21, versionName: '2.0.1', apkUrl: `${SITE}/plax-2.0.1.apk` })

  it('offers a newer APK when the app opens, and puts it off with Later', async () => {
    const rig = await mountApp({ website: { [`${SITE}/updates.json`]: NEWER } })
    await rig.settle()
    expect(screen.getByTestId('update-dialog')).toBeTruthy()
    expect(screen.getByText(/Plax 2\.0\.1 is ready/)).toBeTruthy()
    await press(screen.getByText('Later'))
    expect(screen.queryByTestId('update-dialog')).toBeNull()
    expect(rig.host.urls).toEqual([])
  })

  it('hands the file to the browser with Download', async () => {
    const rig = await mountApp({ website: { [`${SITE}/updates.json`]: NEWER } })
    await rig.settle()
    await press(screen.getByText('Download'))
    expect(rig.host.urls).toEqual([`${SITE}/plax-2.0.1.apk`])
  })

  it('does not look for an APK in the Google Play build', async () => {
    const rig = await mountApp({ variant: 'play', website: { [`${SITE}/updates.json`]: NEWER } })
    await rig.settle()
    expect(rig.requests).not.toContain(`${SITE}/updates.json`)
    expect(screen.queryByTestId('update-dialog')).toBeNull()
  })

  it('says the app is up to date when asked from the menu and there is nothing newer', async () => {
    await mountApp({ website: { [`${SITE}/updates.json`]: manifestText({ versionCode: 20, versionName: '2.0.0', apkUrl: `${SITE}/plax-2.0.0.apk` }) } })
    await chooseFromMenu('menu-update')
    expect(await screen.findByText('Plax is up to date.')).toBeTruthy()
  })

  it('says it cannot check when the website cannot be asked', async () => {
    await mountApp()
    await chooseFromMenu('menu-update')
    expect(await screen.findByText('Cannot check for updates right now. Try again later.')).toBeTruthy()
  })

  it('opens Google Play from the menu in the Google Play build', async () => {
    const rig = await mountApp({ variant: 'play' })
    await chooseFromMenu('menu-update')
    expect(rig.host.browser).toEqual(['https://play.google.com/store/apps/details?id=com.plaxlabs.news'])
  })
})

describe('coming to the front and leaving', () => {
  it('counts the story in view and writes the history when the app goes to the background', async () => {
    const rig = await mountApp()
    const background = jest.spyOn(rig.services.engine, 'background')
    await rig.appState('background')
    expect(background).toHaveBeenCalledTimes(1)
  })

  it('brings the account and the website’s settings up to date when the app comes back', async () => {
    const rig = await mountApp()
    await rig.appState('background')
    rig.account.calls.length = 0
    const before = rig.requests.length
    rig.clock.advance(4 * 3_600_000)
    await rig.appState('active')
    expect(rig.account.calls).toContain('resume')
    expect(rig.requests.length).toBeGreaterThan(before)
  })
})

describe('the browser coming back from Google sign-in', () => {
  it('finishes the sign-in that was waiting, and shows the account', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('com.plaxlabs.news://auth-callback?code=abc&state=xyz')
    const rig = await mountApp()
    await rig.settle()
    expect(rig.account.calls).toContain('complete com.plaxlabs.news://auth-callback?code=abc&state=xyz')
    expect(screen.getByTestId('account-sheet')).toBeTruthy()
  })

  it('takes the address from a running app too', async () => {
    let listener: ((event: { url: string }) => void) | undefined
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((_type: string, handler: (event: { url: string }) => void) => {
      listener = handler
      return { remove: jest.fn() }
    }) as never)
    const rig = await mountApp()
    await act(async () => {
      listener?.({ url: 'com.plaxlabs.news://auth-callback?code=1&state=2' })
      await flushPromises()
    })
    expect(rig.account.calls).toContain('complete com.plaxlabs.news://auth-callback?code=1&state=2')
  })

  it('ignores an address that is not the app’s own', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('https://example.com/elsewhere')
    const rig = await mountApp()
    await rig.settle()
    expect(rig.account.calls.filter((call) => call.startsWith('complete'))).toEqual([])
    expect(screen.queryByTestId('account-sheet')).toBeNull()
  })
})
