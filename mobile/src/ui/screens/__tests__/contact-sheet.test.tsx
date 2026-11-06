import * as fs from 'fs'
import * as path from 'path'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { ScrollView } from 'react-native'
import { PRODUCTION_SITE } from '../../../build'
import { isWebLink } from '../../../data/story'
import { format } from '../../../i18n'
import { en } from '../../../i18n/en'
import { hi } from '../../../i18n/hi'
import { setVariant } from '../../../test/helpers'
import { DARK_PALETTE, LIGHT_PALETTE } from '../../theme'
import { Contact, ContactSheet, type ContactSheetProps } from '../ContactSheet'
import { backButton, fixedHeightOffenders, show, styleOf } from './helpers'

let calls: string[] = []

function contact(overrides: Partial<ContactSheetProps> = {}) {
  const log = (name: string) => () => {
    calls.push(name)
  }
  return <ContactSheet visible onEmail={log('email')} onCopy={log('copy')} onPage={log('page')} onClose={log('close')} {...overrides} />
}

beforeEach(() => {
  calls = []
})

describe('how to reach the people who make Plax', () => {
  it('is an address a mail app can open, with a subject that names the app and its version', () => {
    expect(Contact.EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/)
    expect(Contact.mailto()).toBe(`mailto:${Contact.EMAIL}`)
    expect(Contact.subject('Plax', '1.5.1')).toBe('Plax 1.5.1 feedback')
    expect(Contact.OPERATOR.trim()).not.toBe('')
  })

  it('has its contact page on the Plax website', () => {
    expect(Contact.pageUrl()).toBe('https://plax-rouge.vercel.app/news/contact')
    expect(isWebLink(Contact.pageUrl())).toBe(true)
    expect(Contact.pageUrl().startsWith(`${PRODUCTION_SITE}/`)).toBe(true)
  })

  it('has its page on the website this build talks to', () => {
    setVariant('e2e')
    expect(Contact.pageUrl()).toBe('http://10.0.2.2:8787/news/contact')
  })

  // The files of the website are next to the app's folder; where they are not (a checkout of the app alone) nothing is compared.
  const legal = path.resolve(__dirname, '..', '..', '..', '..', '..', 'src', 'lib', 'legal.ts')
  const published = fs.existsSync(legal) ? fs.readFileSync(legal, 'utf8') : null
  const whenThereIs = published === null ? it.skip : it

  whenThereIs('is the address, the page and the operator the website publishes', () => {
    const find = (pattern: RegExp) => pattern.exec(published ?? '')?.[1]
    expect(find(/contactEmail:\s*'([^']+)'/)).toBe(Contact.EMAIL)
    expect(PRODUCTION_SITE + (find(/contactPath:\s*'([^']+)'/) ?? '')).toBe(Contact.pageUrl())
    expect(find(/operator:\s*'([^']+)'/)).toBe(Contact.OPERATOR)
  })

  it('has its strings in both languages, with the same places to fill', () => {
    const places = (text: string) => [...text.matchAll(/%(\d)\$s/g)].map((match) => match[1]).sort()
    for (const key of Object.keys(en).filter((name) => name.startsWith('contact_') || name === 'about_text') as (keyof typeof en)[]) {
      expect({ key, places: places(hi[key]) }).toEqual({ key, places: places(en[key]) })
    }
    expect(places(en.about_text)).toEqual(['1', '2'])
    expect(places(en.contact_page_line)).toEqual(['1'])
    expect(places(en.contact_about)).toEqual(['1'])
    for (const key of ['contact_us', 'contact_intro', 'contact_send', 'contact_copy', 'contact_page'] as const) expect(hi[key]).not.toBe(en[key])
  })
})

describe('the Contact us sheet', () => {
  it('has a heading, who to write to, and the address in plain sight', () => {
    show(contact())
    expect(screen.getByRole('header', { name: en.contact_us })).toBeTruthy()
    expect(screen.getByText(en.contact_intro)).toBeTruthy()
    expect(screen.getByText(en.contact_email_label)).toBeTruthy()
    expect(screen.getByText(Contact.EMAIL)).toBeTruthy()
    expect(screen.getByText(Contact.OPERATOR)).toBeTruthy()
  })

  it('lets the address and the page be selected, so that they can be copied from here', () => {
    show(contact())
    expect(screen.getByText(Contact.EMAIL).props.selectable).toBe(true)
    expect(screen.getByText(`Contact page: ${Contact.pageUrl()}`).props.selectable).toBe(true)
  })

  it('has the three buttons with the words of the native sheet', () => {
    show(contact())
    for (const label of ['Email us', 'Copy address', 'Open the contact page']) expect(screen.getByRole('button', { name: label })).toBeTruthy()
  })

  it('names the website page in words as well as behind a button', () => {
    show(contact())
    expect(screen.getByText(`Contact page: ${Contact.pageUrl()}`)).toBeTruthy()
  })

  it('describes the stories\' links to their publishers, and who makes Plax', () => {
    show(contact())
    expect(screen.getByText(format(en.contact_about, [Contact.OPERATOR]))).toBeTruthy()
    expect(en.contact_about).toContain('links to the original at its publisher')
  })

  it('emails us, copies the address and opens the page, each when its button is pressed', () => {
    show(contact())
    fireEvent.press(screen.getByLabelText('Email us'))
    fireEvent.press(screen.getByLabelText('Copy address'))
    fireEvent.press(screen.getByLabelText('Open the contact page'))
    expect(calls).toEqual(['email', 'copy', 'page'])
  })

  it('closes from its cross and a tap outside', () => {
    show(contact())
    fireEvent.press(screen.getByTestId('sheet-close'))
    fireEvent.press(screen.getByTestId('scrim'))
    expect(calls).toEqual(['close', 'close'])
  })

  it('closes from the back button', () => {
    const back = backButton()
    show(contact())
    expect(back.press()).toBe(true)
    expect(calls).toEqual(['close'])
    back.restore()
  })

  it('does not draw when it is not visible', () => {
    show(contact({ visible: false }))
    expect(screen.queryByTestId('contact-sheet')).toBeNull()
  })

  it('scrolls its text and keeps its title bar where it is', () => {
    show(contact())
    const inside = within(screen.UNSAFE_getByType(ScrollView))
    expect(inside.getByText(Contact.EMAIL)).toBeTruthy()
    expect(inside.queryByText(en.contact_us)).toBeNull()
    expect(inside.queryByTestId('sheet-close')).toBeNull()
  })
})

describe('the Contact us sheet in Hindi and in the dark', () => {
  it('has every text in Hindi, with the address and the operator unchanged', () => {
    show(contact(), { lang: 'hi' })
    expect(screen.getByRole('header', { name: hi.contact_us })).toBeTruthy()
    expect(screen.getByText(hi.contact_intro)).toBeTruthy()
    expect(screen.getByText(hi.contact_email_label)).toBeTruthy()
    for (const label of [hi.contact_send, hi.contact_copy, hi.contact_page]) expect(screen.getByRole('button', { name: label })).toBeTruthy()
    expect(screen.getByText(format(hi.contact_page_line, [Contact.pageUrl()]))).toBeTruthy()
    expect(screen.getByText(format(hi.contact_about, [Contact.OPERATOR]))).toBeTruthy()
    expect(screen.getByText(Contact.EMAIL)).toBeTruthy()
  })

  it('has no text in a box of a fixed height', () => {
    show(contact(), { lang: 'hi' })
    expect(fixedHeightOffenders()).toEqual([])
  })

  it('draws in the light colours and in the dark ones', () => {
    const { unmount } = show(contact())
    expect(styleOf('contact-card').backgroundColor).toBe(LIGHT_PALETTE.surfaceAlt)
    unmount()
    show(contact(), { mode: 'dark' })
    expect(styleOf('contact-card').backgroundColor).toBe(DARK_PALETTE.surfaceAlt)
  })
})
