import { StyleSheet } from 'react-native'
import { fireEvent, screen } from '@testing-library/react-native'
import { en } from '../../../i18n/en'
import { hi } from '../../../i18n/hi'
import { BUILT_IN_TOPICS } from '../../../data/topic'
import { DARK_PALETTE, LIGHT_PALETTE } from '../../theme'
import { MENU_WIDTH, MenuPanel, isSwipeAway, type MenuLink, type MenuPanelProps } from '../MenuPanel'
import { LONG_HINDI, backButton, fixedHeightOffenders, limitedLines, resetWindow, setWindow, show, styleOf } from './helpers'

const SECTIONS = ['us', 'india', 'world', 'tech', 'business', 'science'].map((id) => ({ id, en: en[`section_${id}` as keyof typeof en], hi: hi[`section_${id}` as keyof typeof hi] }))

const LINKS: MenuLink[] = [
  { id: 'rate', en: 'Follow Plax', hi: 'Plax को फ़ॉलो करें', url: 'https://github.com/RichardHenryJames/plax', build: 'all' },
  { id: 'store', en: 'Rate on Google Play', hi: 'Google Play पर रेटिंग दें', url: 'https://play.google.com/store/apps/details?id=com.plaxlabs.news', build: 'play' },
  { id: 'apk', en: 'All downloads', hi: 'सभी डाउनलोड', url: 'https://plax-rouge.vercel.app/news/download', build: 'direct' },
]

let calls: unknown[][] = []
const record = (name: string) => (...args: unknown[]) => {
  calls.push([name, ...args])
}

function menu(overrides: Partial<MenuPanelProps> = {}) {
  return (
    <MenuPanel
      visible
      screen="feed"
      topicId={BUILT_IN_TOPICS[0].id}
      section=""
      sections={SECTIONS}
      links={[]}
      storeBuild={false}
      adChoices={false}
      onClose={record('close')}
      onScreen={record('screen')}
      onLanguage={record('language')}
      onSection={record('section')}
      onAccount={record('account')}
      onTheme={record('theme')}
      onAbout={record('about')}
      onContact={record('contact')}
      onPrivacy={record('privacy')}
      onLink={record('link')}
      onAdChoices={record('adChoices')}
      onUpdate={record('update')}
      onClearSaved={record('clearSaved')}
      {...overrides}
    />
  )
}

beforeEach(() => {
  calls = []
})
afterEach(() => {
  resetWindow()
  jest.restoreAllMocks()
})

describe('the menu in English', () => {
  it('holds what the header and the bottom bar held, and the rows of the native menu', () => {
    show(menu())
    expect(screen.getByText('Plax')).toBeTruthy()
    // The headings are set in capitals, and are read to a screen reader as they were written.
    expect(screen.getByText('FEED LANGUAGE')).toBeTruthy()
    expect(screen.getByRole('header', { name: en.feed_language })).toBeTruthy()
    expect(screen.getByText('English')).toBeTruthy()
    expect(screen.getByText('हिन्दी')).toBeTruthy()
    for (const label of [en.feed, en.for_you, en.topics, en.saved, en.account, en.theme, en.about, en.contact_us, en.privacy_policy, en.update_check, en.clear_saved]) {
      expect(screen.getByLabelText(label)).toBeTruthy()
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.getByLabelText(en.read_in_english)).toBeTruthy()
    expect(screen.getByTestId('menu-close').props.accessibilityLabel).toBe(en.close_menu)
  })

  it('has no row for what is a tap away elsewhere', () => {
    show(menu())
    for (const label of [en.check_new, en.interests_title, 'Open Plax website', en.update_play, en.ad_choices]) expect(screen.queryByText(label)).toBeNull()
  })

  it('offers the update check to the website build and Open Google Play to the Google Play build', () => {
    show(menu({ storeBuild: true }))
    expect(screen.getByText(en.update_play)).toBeTruthy()
    expect(screen.queryByText(en.update_check)).toBeNull()
  })

  it('adds "Privacy and ad choices" where the consent tool says it applies', () => {
    show(menu({ adChoices: true }))
    fireEvent.press(screen.getByText(en.ad_choices))
    expect(calls).toEqual([['close'], ['adChoices']])
  })

  it('does not draw when it is not visible', () => {
    show(menu({ visible: false }))
    expect(screen.queryByTestId('menu-content')).toBeNull()
    expect(screen.queryByText(en.feed)).toBeNull()
  })
})

describe('what a choice does', () => {
  it('closes the menu first, and then goes to the place', () => {
    show(menu())
    for (const [testID, place] of [['menu-feed', 'feed'], ['menu-for-you', 'forYou'], ['menu-topics', 'topics'], ['menu-saved', 'saved']] as const) {
      calls = []
      fireEvent.press(screen.getByTestId(testID))
      expect(calls).toEqual([['close'], ['screen', place]])
    }
  })

  it('opens the account, the theme, About, Contact us, the privacy policy, the update check and Clear saved stories', () => {
    show(menu())
    const rows: [string, string][] = [
      ['menu-account', 'account'],
      ['menu-theme', 'theme'],
      ['menu-about', 'about'],
      ['menu-contact', 'contact'],
      ['menu-privacy', 'privacy'],
      ['menu-update', 'update'],
      ['menu-clear-saved', 'clearSaved'],
    ]
    for (const [testID, name] of rows) {
      calls = []
      fireEvent.press(screen.getByTestId(testID))
      expect(calls).toEqual([['close'], [name]])
    }
  })

  it('turns to the other language and does nothing about the one already in use', () => {
    show(menu())
    fireEvent.press(screen.getByTestId('menu-language-hi'))
    expect(calls).toEqual([['close'], ['language', 'hi']])
    calls = []
    fireEvent.press(screen.getByTestId('menu-language-en'))
    expect(calls).toEqual([['close']])
  })

  it('narrows the news to a section, and All brings the rest back', () => {
    show(menu({ section: 'world' }))
    fireEvent.press(screen.getByTestId('menu-section-tech'))
    expect(calls).toEqual([['close'], ['section', 'tech']])
    calls = []
    fireEvent.press(screen.getByTestId('menu-section-all'))
    expect(calls).toEqual([['close'], ['section', '']])
  })

  it('closes from its cross and from a tap beside it', () => {
    show(menu())
    fireEvent.press(screen.getByTestId('menu-close'))
    fireEvent.press(screen.getByTestId('scrim'))
    expect(calls).toEqual([['close'], ['close']])
  })

  it('closes from the back button', () => {
    const back = backButton()
    show(menu())
    expect(back.listening()).toBe(1)
    expect(back.press()).toBe(true)
    expect(calls).toEqual([['close']])
    back.restore()
  })
})

describe('a swipe to the left', () => {
  /** A finger that goes down at `from` and is at `to` when the panel is asked whether the drag is its own; `release` lifts it there. */
  const drag = (from: [number, number], to: [number, number], release = true) => {
    const target = screen.getByTestId('menu-content')
    fireEvent(target, 'touchStart', { nativeEvent: { pageX: from[0], pageY: from[1] } })
    // The handler's answer is what the responder system is given; fireEvent does return it, though its type says it does not.
    const taken = fireEvent(target, 'moveShouldSetResponderCapture', { nativeEvent: { pageX: to[0], pageY: to[1] } }) as unknown as boolean
    if (taken && release) fireEvent(target, 'responderRelease', { nativeEvent: { pageX: to[0], pageY: to[1] } })
    return taken
  }

  it('closes the menu when it is long enough and more sideways than up or down', () => {
    show(menu())
    expect(drag([260, 400], [100, 410])).toBe(true)
    expect(calls).toEqual([['close']])
  })

  it('takes a sideways drag from the row or the scrim under the finger, so that nothing is pressed as well', () => {
    show(menu())
    expect(drag([260, 400], [200, 404], false)).toBe(true)
    // It is the panel's until the finger lifts: nothing has been closed yet, and the row did not get the touch.
    expect(calls).toEqual([])
    expect(screen.getByTestId('menu-swipe').props.onResponderTerminationRequest()).toBe(false)
  })

  it('leaves a drag that is too short to close it open, and still takes it from what is under the finger', () => {
    show(menu())
    expect(drag([260, 400], [220, 400])).toBe(true)
    expect(calls).toEqual([])
  })

  it('leaves a tap, or a finger that wobbles a little, to the row under it', () => {
    show(menu())
    expect(drag([260, 400], [255, 402])).toBe(false)
    expect(drag([260, 400], [262, 399])).toBe(false)
    expect(calls).toEqual([])
  })

  it('leaves a drag to the right, and a drag mostly up or down (the list scrolling), to what is under the finger', () => {
    show(menu())
    expect(drag([100, 400], [260, 400])).toBe(false)
    expect(drag([260, 300], [200, 560])).toBe(false)
    expect(drag([260, 300], [245, 340])).toBe(false)
    expect(calls).toEqual([])
  })

  it('has the rule of the native app: more than 60 dp, and 1.4 times more sideways than up or down', () => {
    expect(isSwipeAway(-61, 0)).toBe(true)
    expect(isSwipeAway(-60, 0)).toBe(false)
    expect(isSwipeAway(-70, 49)).toBe(true)
    expect(isSwipeAway(-70, 51)).toBe(false)
    expect(isSwipeAway(80, 0)).toBe(false)
  })
})

describe('where the reader is', () => {
  it('marks the place the reader is in', () => {
    for (const [place, testID] of [['feed', 'menu-feed'], ['forYou', 'menu-for-you'], ['topics', 'menu-topics'], ['saved', 'menu-saved']] as const) {
      const { unmount } = show(menu({ screen: place }))
      for (const other of ['menu-feed', 'menu-for-you', 'menu-topics', 'menu-saved']) {
        if (other === testID) expect(screen.getByTestId(other)).toBeSelected()
        else expect(screen.getByTestId(other)).not.toBeSelected()
      }
      unmount()
    }
  })

  it('marks the language in use, which a screen reader hears as "Read in English" and "Read in Hindi"', () => {
    const { unmount } = show(menu())
    expect(screen.getByLabelText(en.read_in_english)).toBeSelected()
    expect(screen.getByLabelText(en.read_in_hindi)).not.toBeSelected()
    unmount()
    show(menu(), { lang: 'hi' })
    expect(screen.getByLabelText(hi.read_in_hindi)).toBeSelected()
    expect(screen.getByLabelText(hi.read_in_english)).not.toBeSelected()
  })

  it('marks the section the news is narrowed to, and All when it is not', () => {
    const { unmount } = show(menu())
    expect(screen.getByTestId('menu-section-all')).toBeSelected()
    unmount()
    show(menu({ section: 'tech' }))
    expect(screen.getByTestId('menu-section-tech')).toBeSelected()
    expect(screen.getByTestId('menu-section-all')).not.toBeSelected()
  })
})

describe('the news sections', () => {
  it('are the chips of the website, with All first, for the English news', () => {
    show(menu())
    expect(screen.getByText('SECTIONS')).toBeTruthy()
    expect(screen.getByText(en.all)).toBeTruthy()
    for (const section of SECTIONS) expect(screen.getByText(section.en)).toBeTruthy()
  })

  it('are left out for the other places, for another topic, for Hindi and when the website lists none', () => {
    for (const [name, overrides, options] of [
      ['For you', { screen: 'forYou' as const }, undefined],
      ['Topics', { screen: 'topics' as const }, undefined],
      ['Saved', { screen: 'saved' as const }, undefined],
      ['another topic', { topicId: 'science' }, undefined],
      ['no sections', { sections: [] }, undefined],
      ['Hindi', {}, { lang: 'hi' as const }],
    ] as const) {
      const { unmount } = show(menu(overrides), options)
      expect({ name, sections: screen.queryByTestId('menu-section-all') }).toEqual({ name, sections: null })
      unmount()
    }
  })
})

describe('the links of the website', () => {
  it('are the ones for this build: the website\'s build and the Google Play build see different ones', () => {
    const { unmount } = show(menu({ links: LINKS, storeBuild: false }))
    expect(screen.getByText('Follow Plax')).toBeTruthy()
    expect(screen.getByText('All downloads')).toBeTruthy()
    expect(screen.queryByText('Rate on Google Play')).toBeNull()
    unmount()
    show(menu({ links: LINKS, storeBuild: true }))
    expect(screen.getByText('Follow Plax')).toBeTruthy()
    expect(screen.getByText('Rate on Google Play')).toBeTruthy()
    expect(screen.queryByText('All downloads')).toBeNull()
  })

  it('open their page, after the menu has closed', () => {
    show(menu({ links: LINKS }))
    fireEvent.press(screen.getByTestId('menu-link-rate'))
    expect(calls).toEqual([['close'], ['link', 'https://github.com/RichardHenryJames/plax']])
  })

  it('are named in Hindi, and in English when the website gave no Hindi name', () => {
    show(menu({ links: [LINKS[0], { ...LINKS[2], hi: '' }] }), { lang: 'hi' })
    expect(screen.getByText('Plax को फ़ॉलो करें')).toBeTruthy()
    expect(screen.getByText('All downloads')).toBeTruthy()
  })
})

describe('the menu in Hindi', () => {
  it('has every label in Hindi, and no capitals or wide spacing for the headings', () => {
    show(menu({ links: LINKS, adChoices: true }), { lang: 'hi' })
    for (const label of [hi.feed, hi.for_you, hi.topics, hi.saved, hi.account, hi.theme, hi.about, hi.contact_us, hi.privacy_policy, hi.update_check, hi.clear_saved, hi.ad_choices, hi.language_english, hi.language_hindi]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.getByText(hi.feed_language.toUpperCase())).toBeTruthy()
    expect(screen.getByRole('header', { name: hi.feed_language }).props.style).toEqual(expect.arrayContaining([expect.objectContaining({ letterSpacing: 0 })]))
    expect(screen.getByTestId('menu-close').props.accessibilityLabel).toBe(hi.close_menu)
  })

  it('has no text in a box of a fixed height, so that taller Hindi lines are not cut', () => {
    show(menu({ links: LINKS, adChoices: true }), { lang: 'hi' })
    expect(fixedHeightOffenders()).toEqual([])
  })

  it('shows a long Hindi name whole, on as many lines as it needs, and never cuts any text of the menu to a line', () => {
    show(menu({ links: [{ ...LINKS[0], hi: LONG_HINDI }] }), { lang: 'hi' })
    expect(screen.getByText(LONG_HINDI)).toBeTruthy()
    expect(limitedLines()).toEqual([])
    expect(fixedHeightOffenders()).toEqual([])
    // The row grows with its text: it has a least height, never a fixed one.
    expect(styleOf('menu-link-rate')).toMatchObject({ minHeight: 48 })
    expect(styleOf('menu-link-rate').height).toBeUndefined()
  })

  it('has the heading spaced wide in English, as the native app set it', () => {
    show(menu())
    expect(screen.getByRole('header', { name: en.feed_language }).props.style).toEqual(expect.arrayContaining([expect.objectContaining({ letterSpacing: 0.66 })]))
  })
})

describe('the theme', () => {
  it('draws in the light colours and in the dark ones', () => {
    const { unmount } = show(menu({ screen: 'saved' }))
    expect(styleOf('menu-saved').backgroundColor).toBe(LIGHT_PALETTE.accentSoft)
    unmount()
    show(menu({ screen: 'saved' }), { mode: 'dark' })
    expect(styleOf('menu-saved').backgroundColor).toBe(DARK_PALETTE.accentSoft)
    expect(styleOf('menu-feed').backgroundColor).toBe('transparent')
  })
})

describe('the room it takes', () => {
  const widthOf = () => {
    let node = screen.getByTestId('menu-content').parent
    while (node) {
      const style = StyleSheet.flatten(node.props.style) as { width?: unknown } | undefined
      if (style && typeof style.width === 'number') return style.width
      node = node.parent
    }
    return undefined
  }

  it('is 320 dp wide, and never more than 86% of the screen', () => {
    setWindow(750, 1334)
    const { unmount } = show(menu())
    expect(widthOf()).toBe(MENU_WIDTH)
    unmount()
    setWindow(360, 800)
    show(menu())
    expect(widthOf()).toBe(Math.round(360 * 0.86))
  })

  it('stands behind the system bars: padded at the top and left, and its list scrolls under the navigation bar with its last row clear of it', () => {
    show(menu(), { insets: { top: 30, bottom: 24, left: 6 } })
    expect(styleOf('menu-content')).toMatchObject({ paddingTop: 30, paddingLeft: 6 })
    expect(screen.getByTestId('menu-list').props.contentContainerStyle).toMatchObject({ paddingBottom: 16 + 24 })
  })
})
