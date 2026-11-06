import type { StringKey } from '../../i18n'
import { createContactActions, createLinkOpener } from '../links'

const flush = async () => {
  for (let turn = 0; turn < 5; turn++) await Promise.resolve()
}

describe('opening a link', () => {
  function setup(browser: (url: string) => Promise<unknown> = async () => undefined, allowed?: (url: string) => boolean) {
    const opened: string[] = []
    const said: StringKey[] = []
    const opener = createLinkOpener({
      browser: (url) => {
        opened.push(url)
        return browser(url)
      },
      say: (key) => said.push(key),
      allowed,
    })
    return { opener, opened, said }
  }

  it('opens a web link in the browser', async () => {
    const { opener, opened, said } = setup()
    opener.open('https://publisher.example/story')
    await flush()
    expect(opened).toEqual(['https://publisher.example/story'])
    expect(said).toEqual([])
  })

  it('refuses what is not a plain https address, and says the link is unavailable', () => {
    const { opener, opened, said } = setup()
    for (const bad of ['', 'http://publisher.example/', 'javascript:alert(1)', 'intent://x#Intent;end', 'https://user:pass@publisher.example/', 'https://publisher.example:8443/', 'file:///etc/hosts', 'not a link']) opener.open(bad)
    expect(opened).toEqual([])
    expect(said).toEqual(Array(8).fill('source_unavailable'))
  })

  it('says there is no browser when the phone has none', async () => {
    const { opener, said } = setup(() => Promise.reject(new Error('no browser')))
    opener.open('https://publisher.example/story')
    await flush()
    expect(said).toEqual(['browser_unavailable'])
  })

  it('can be told to allow more (the test build’s own website)', () => {
    const { opener, opened } = setup(undefined, (url) => url.startsWith('http://10.0.2.2:8787/'))
    opener.open('http://10.0.2.2:8787/news/privacy')
    expect(opened).toEqual(['http://10.0.2.2:8787/news/privacy'])
  })
})

describe('contacting us', () => {
  function setup(options: { openUrl?: (url: string) => Promise<unknown>; copy?: (text: string) => Promise<unknown>; sdk?: number } = {}) {
    const opened: string[] = []
    const copied: string[] = []
    const said: { key: StringKey; long: boolean | undefined }[] = []
    const actions = createContactActions({
      openUrl: (url) => {
        opened.push(url)
        return options.openUrl ? options.openUrl(url) : Promise.resolve(true)
      },
      copy: (text) => {
        copied.push(text)
        return options.copy ? options.copy(text) : Promise.resolve(true)
      },
      say: (key, long) => said.push({ key, long }),
      appName: () => 'Plax',
      versionName: () => '2.0.0',
      sdk: options.sdk ?? 34,
    })
    return { actions, opened, copied, said }
  }

  it('opens a new message to us with the app and its version as the subject', async () => {
    const { actions, opened, copied } = setup()
    await actions.email()
    expect(opened).toEqual(['mailto:richardhenryjames64@gmail.com?subject=Plax%202.0.0%20feedback'])
    expect(copied).toEqual([])
  })

  it('copies the address and says so when there is no mail app, so that it is never a dead end', async () => {
    const { actions, copied, said } = setup({ openUrl: () => Promise.reject(new Error('no mail app')) })
    await actions.email()
    expect(copied).toEqual(['richardhenryjames64@gmail.com'])
    expect(said).toEqual([{ key: 'contact_no_mail', long: true }])
  })

  it('copies the address, and says so before Android 13, which says so itself after', async () => {
    const before = setup({ sdk: 32 })
    await before.actions.copy()
    expect(before.copied).toEqual(['richardhenryjames64@gmail.com'])
    expect(before.said).toEqual([{ key: 'contact_copied', long: undefined }])
    const after = setup({ sdk: 33 })
    await after.actions.copy()
    expect(after.copied).toEqual(['richardhenryjames64@gmail.com'])
    expect(after.said).toEqual([])
  })

  it('says nothing about a copy that did not happen', async () => {
    const { actions, said } = setup({ copy: () => Promise.reject(new Error('denied')) })
    await actions.copy()
    expect(said).toEqual([])
  })
})
