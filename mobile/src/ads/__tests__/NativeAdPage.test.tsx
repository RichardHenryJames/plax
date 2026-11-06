import { act, render, screen } from '@testing-library/react-native'
import { DeviceEventEmitter, Dimensions, Image, Pressable, Text, TouchableOpacity, View, type ViewStyle } from 'react-native'
import { translate } from '../../i18n'
import { NativeAdPage, withAlpha, type AdTheme } from '../NativeAdPage'
import { FakePage, THEME, library, mockLibrary } from './helpers'

const PHONE = Dimensions.get('window')

const resize = (width: number, height = PHONE.height) =>
  act(() => {
    DeviceEventEmitter.emit('didUpdateDimensions', { window: { ...PHONE, width, height }, screen: PHONE })
  })

const card = () => screen.queryByTestId('mock-native-ad-view')
const registered = () => library().assets.registered.map((asset) => asset.assetType).sort()

/** The style of an element as one object, whatever arrays of styles it was given. */
const flat = (style: unknown): ViewStyle => (Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : ((style ?? {}) as ViewStyle))

/** An element of the rendered tree, as far as these tests look at it. */
interface Node {
  readonly parent: Node | null
  readonly props: Record<string, unknown>
}

/** The first element above this one, host or not, whose style has this property. */
const above = (element: Node | null, property: keyof ViewStyle): Node | null => {
  for (let node = element?.parent ?? null; node; node = node.parent) if (flat(node.props.style)[property] !== undefined) return node
  return null
}

beforeEach(() => {
  library().reset()
})

afterEach(() => {
  // The library takes the tree off the screen afterwards by itself.
  resize(PHONE.width)
})

describe('the full page of an ad', () => {
  it('shows an Ad label first, so nobody can take it for a story, and says it is an advertisement', () => {
    render(<NativeAdPage page={new FakePage()} theme={THEME} lang="en" />)
    expect(screen.getByText('Ad')).toBeTruthy()
    expect(screen.getByText('Ad').props.accessibilityLabel).toBe('Advertisement')
    expect(screen.getByLabelText('Advertisement')).toBe(screen.getByText('Ad'))
  })

  it('shows the headline, the text, the advertiser and the button of the ad', () => {
    render(<NativeAdPage page={new FakePage({ headline: 'A headline', body: 'A body', advertiser: 'Acme', callToAction: 'Go now' })} theme={THEME} lang="en" />)
    for (const text of ['A headline', 'A body', 'Acme', 'Go now']) expect(screen.getByText(text)).toBeTruthy()
  })

  it('shows the icon of the ad, and the picture or video of it, whole', () => {
    render(<NativeAdPage page={new FakePage({ icon: { url: 'file:///ad/icon.png' } })} theme={THEME} lang="en" />)
    const icons = screen.UNSAFE_getAllByType(Image)
    expect(icons).toHaveLength(1)
    expect(icons[0].props.source).toEqual({ uri: 'file:///ad/icon.png' })
    const media = screen.getByTestId('mock-native-media-view')
    expect(media.props.resizeMode).toBe('contain')
  })

  it('binds the ad to the card, and puts every asset the ad uses in it, registered with it', () => {
    const page = new FakePage()
    render(<NativeAdPage page={page} theme={THEME} lang="en" />)
    expect(card()?.props.nativeAd).toBe(page.ad)
    expect(registered()).toEqual(['advertiser', 'body', 'callToAction', 'headline', 'icon', 'media'])
  })

  it('registers each asset as the direct child of its asset view, and gives none a press handler', () => {
    render(<NativeAdPage page={new FakePage()} theme={THEME} lang="en" />)
    const assets = screen.UNSAFE_getAllByType(mockLibrary().NativeAsset)
    // The picture has its own, inside the library's media view.
    expect(assets).toHaveLength(6)
    const types: Record<string, unknown> = {}
    for (const asset of assets) {
      const child = asset.props.children
      types[asset.props.assetType] = child.type
      for (const handler of ['onPress', 'onPressIn', 'onPressOut', 'onLongPress', 'onTouchStart', 'onTouchEnd', 'onResponderRelease', 'onStartShouldSetResponder']) {
        expect({ asset: asset.props.assetType, handler, set: child.props[handler] !== undefined }).toEqual({ asset: asset.props.assetType, handler, set: false })
      }
    }
    expect(types).toMatchObject({ headline: Text, body: Text, advertiser: Text, callToAction: Text, icon: Image })
  })

  it('has nothing in it of ours that can be pressed', () => {
    render(<NativeAdPage page={new FakePage()} theme={THEME} lang="en" />)
    expect(screen.UNSAFE_queryAllByType(Pressable)).toHaveLength(0)
    expect(screen.UNSAFE_queryAllByType(TouchableOpacity)).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(1)
  })

  it('has a button that reads as one to a screen reader, though the library handles the press', () => {
    render(<NativeAdPage page={new FakePage({ callToAction: 'Install now' })} theme={THEME} lang="en" />)
    expect(screen.getByRole('button', { name: 'Install now' })).toBeTruthy()
  })

  it('draws an ad with only a headline, and registers only that', () => {
    render(<NativeAdPage page={new FakePage({ body: null, callToAction: null, advertiser: null, icon: null, media: null, headline: 'Plax' })} theme={THEME} lang="en" />)
    expect(screen.getByText('Plax')).toBeTruthy()
    expect(screen.queryByTestId('mock-native-media-view')).toBeNull()
    expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(registered()).toEqual(['headline'])
  })

  it('draws an ad with no picture, and one with no icon', () => {
    const noPicture = render(<NativeAdPage page={new FakePage({ media: null })} theme={THEME} lang="en" />)
    expect(screen.queryByTestId('mock-native-media-view')).toBeNull()
    expect(registered()).toEqual(['advertiser', 'body', 'callToAction', 'headline', 'icon'])
    noPicture.unmount()
    library().reset()
    render(<NativeAdPage page={new FakePage({ icon: null })} theme={THEME} lang="en" />)
    expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0)
    expect(registered()).toEqual(['advertiser', 'body', 'callToAction', 'headline', 'media'])
  })

  it('cuts the headline and the text to two lines, the advertiser and the button to one', () => {
    render(<NativeAdPage page={new FakePage({ headline: 'H', body: 'B', advertiser: 'A', callToAction: 'C' })} theme={THEME} lang="en" />)
    expect(screen.getByText('H').props.numberOfLines).toBe(2)
    expect(screen.getByText('B').props.numberOfLines).toBe(2)
    expect(screen.getByText('A').props.numberOfLines).toBe(1)
    expect(screen.getByText('C').props.numberOfLines).toBe(1)
  })

  it('leaves the top right corner of the card to the AdChoices mark: the label is at the left, with nothing opposite it', () => {
    render(<NativeAdPage page={new FakePage()} theme={THEME} lang="en" />)
    expect(screen.getByText('Ad')).toHaveStyle({ alignSelf: 'flex-start' })
  })

  it('says how to go on, in a hint that is only text and is hidden from a screen reader', () => {
    render(<NativeAdPage page={new FakePage()} theme={THEME} lang="en" />)
    const hint = screen.getByText(translate('en', 'ad_next_hint'), { includeHiddenElements: true })
    expect(hint).toBeTruthy()
    expect(screen.queryByText(translate('en', 'ad_next_hint'))).toBeNull()
    expect(screen.UNSAFE_queryAllByType(Pressable)).toHaveLength(0)
  })

  it('speaks the language of the screen', () => {
    const hindi = render(<NativeAdPage page={new FakePage()} theme={THEME} lang="hi" />)
    expect(screen.getByText(translate('hi', 'ad_label'))).toBeTruthy()
    expect(screen.getByText(translate('hi', 'ad_label')).props.accessibilityLabel).toBe(translate('hi', 'ad_description'))
    expect(screen.getByText(translate('hi', 'ad_next_hint'), { includeHiddenElements: true })).toBeTruthy()
    // Devanagari marks sit above and below the line: the font padding is kept.
    expect(screen.getByText(translate('hi', 'ad_label'))).toHaveStyle({ includeFontPadding: true })
    hindi.unmount()
    render(<NativeAdPage page={new FakePage()} theme={THEME} lang="en" />)
    expect(screen.getByText('Ad')).toHaveStyle({ includeFontPadding: false })
  })

  it('keeps the top corner for the menu button, as every page does', () => {
    const withMenu = render(<NativeAdPage page={new FakePage()} theme={THEME} lang="en" menu={<View testID="menu-button" />} />)
    expect(screen.getByTestId('menu-button')).toBeTruthy()
    expect(flat(above(screen.getByTestId('menu-button'), 'top')?.props.style)).toMatchObject({ position: 'absolute', top: 4, left: 12, width: 48, height: 48 })
    withMenu.unmount()
    render(<NativeAdPage page={new FakePage()} theme={THEME} lang="en" />)
    expect(screen.queryByTestId('menu-button')).toBeNull()
  })

  it('fills the page it is given, in the page colour', () => {
    render(<NativeAdPage page={new FakePage()} theme={THEME} lang="en" style={{ width: 300 }} />)
    expect(screen.getByTestId('ad-page')).toHaveStyle({ flex: 1, backgroundColor: THEME.bg, width: 300 })
  })
})

describe('an ad that is not there', () => {
  it('leaves the page empty, with its hint, when the slot has no ad any more', () => {
    render(<NativeAdPage page={null} theme={THEME} lang="en" />)
    expect(card()).toBeNull()
    expect(screen.getByTestId('ad-page')).toBeTruthy()
    expect(screen.getByText(translate('en', 'ad_next_hint'), { includeHiddenElements: true })).toBeTruthy()
  })

  it('leaves the page empty when the ad has been let go', () => {
    const page = new FakePage()
    const view = render(<NativeAdPage page={page} theme={THEME} lang="en" />)
    expect(card()).not.toBeNull()
    page.destroy()
    view.rerender(<NativeAdPage page={page} theme={THEME} lang="en" />)
    expect(card()).toBeNull()
  })

  it('shows the next ad when another has taken the slot', () => {
    const view = render(<NativeAdPage page={new FakePage({ headline: 'First' })} theme={THEME} lang="en" />)
    expect(screen.getByText('First')).toBeTruthy()
    const second = new FakePage({ headline: 'Second' })
    view.rerender(<NativeAdPage page={second} theme={THEME} lang="en" />)
    expect(screen.queryByText('First')).toBeNull()
    expect(screen.getByText('Second')).toBeTruthy()
    expect(card()?.props.nativeAd).toBe(second.ad)
  })
})

describe('an ad that cannot be drawn', () => {
  let error: jest.SpyInstance

  beforeEach(() => {
    // React reports an error that a boundary catches; the report is not what these tests are about.
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    error.mockRestore()
  })

  it('costs the reader a blank page and never the app, when what it says is not text', () => {
    const page = new FakePage({ headline: { not: 'text' } as unknown as string })
    expect(() => render(<NativeAdPage page={page} theme={THEME} lang="en" />)).not.toThrow()
    expect(card()).toBeNull()
    expect(screen.getByTestId('ad-page')).toBeTruthy()
    expect(screen.getByText(translate('en', 'ad_next_hint'), { includeHiddenElements: true })).toBeTruthy()
  })

  it('costs the reader a blank page when the ad cannot be read at all', () => {
    const page = new FakePage()
    Object.defineProperty(page, 'content', {
      get() {
        throw new Error('broken ad')
      },
    })
    expect(() => render(<NativeAdPage page={page} theme={THEME} lang="en" />)).not.toThrow()
    expect(card()).toBeNull()
    expect(screen.getByTestId('ad-page')).toBeTruthy()
  })

  it('costs the reader a blank page when the ad cannot even say whether it is gone', () => {
    const page = new FakePage()
    Object.defineProperty(page, 'destroyed', {
      get() {
        throw new Error('broken ad')
      },
    })
    expect(() => render(<NativeAdPage page={page} theme={THEME} lang="en" />)).not.toThrow()
    expect(card()).toBeNull()
  })

  it('draws the next ad after one that could not be drawn', () => {
    const view = render(<NativeAdPage page={new FakePage({ headline: { not: 'text' } as unknown as string, id: 'a' })} theme={THEME} lang="en" />)
    expect(card()).toBeNull()
    view.rerender(<NativeAdPage page={new FakePage({ headline: 'Fine', id: 'b' })} theme={THEME} lang="en" />)
    expect(screen.getByText('Fine')).toBeTruthy()
  })
})

describe('the card in the colours of the app', () => {
  it('is drawn in the colours it is given', () => {
    render(<NativeAdPage page={new FakePage({ headline: 'H', body: 'B', advertiser: 'A', callToAction: 'C' })} theme={THEME} lang="en" />)
    expect(screen.getByTestId('ad-page')).toHaveStyle({ backgroundColor: THEME.bg })
    expect(card()).toHaveStyle({ backgroundColor: THEME.surface, borderColor: THEME.border })
    expect(screen.getByText('H')).toHaveStyle({ color: THEME.text })
    expect(screen.getByText('B')).toHaveStyle({ color: THEME.text })
    expect(screen.getByText('A')).toHaveStyle({ color: THEME.textSecondary })
    expect(screen.getByText('C')).toHaveStyle({ color: THEME.onAccent, backgroundColor: THEME.accent })
    expect(screen.getByText(translate('en', 'ad_next_hint'), { includeHiddenElements: true })).toHaveStyle({ color: THEME.textSecondary })
  })

  it('makes the label from the accent when the theme has no colours for it', () => {
    render(<NativeAdPage page={new FakePage()} theme={THEME} lang="en" />)
    expect(screen.getByText('Ad')).toHaveStyle({ color: THEME.accent, backgroundColor: '#F5B13A26' })
  })

  it('uses the colours of the label and of the picture that the theme has', () => {
    const theme: AdTheme = { ...THEME, accentText: '#8F5400', accentSoft: '#FCEBC8', surfaceAlt: '#EFECE5' }
    render(<NativeAdPage page={new FakePage()} theme={theme} lang="en" />)
    expect(screen.getByText('Ad')).toHaveStyle({ color: '#8F5400', backgroundColor: '#FCEBC8' })
    expect(flat(above(screen.getByTestId('mock-native-media-view'), 'flexBasis')?.props.style)).toMatchObject({ backgroundColor: '#EFECE5' })
    expect(flat(screen.UNSAFE_getAllByType(Image)[0].props.style)).toMatchObject({ backgroundColor: '#EFECE5' })
  })

  it('has the border colour behind the picture and the icon when the theme has no other', () => {
    render(<NativeAdPage page={new FakePage()} theme={THEME} lang="en" />)
    expect(flat(screen.UNSAFE_getAllByType(Image)[0].props.style)).toMatchObject({ backgroundColor: THEME.border })
    expect(flat(above(screen.getByTestId('mock-native-media-view'), 'flexBasis')?.props.style)).toMatchObject({ backgroundColor: THEME.border })
  })
})

describe('the size of the card', () => {
  it('is as wide as the screen less a margin on each side, and no wider than 560 dp', () => {
    render(<NativeAdPage page={new FakePage()} theme={THEME} lang="en" />)
    expect(PHONE.width).toBeGreaterThan(560 + 32)
    expect(card()).toHaveStyle({ width: 560 })
    resize(360)
    expect(card()).toHaveStyle({ width: 328 })
    resize(412)
    expect(card()).toHaveStyle({ width: 380 })
  })

  it('has a picture of the shape the ad says, which gives way to the text and the button down to 120 dp', () => {
    render(<NativeAdPage page={new FakePage({ media: { aspectRatio: 1.91 } })} theme={THEME} lang="en" />)
    resize(360)
    // The card is 328 wide with 16 of padding on each side.
    expect(flat(above(screen.getByTestId('mock-native-media-view'), 'flexBasis')?.props.style)).toMatchObject({ flexBasis: Math.round(296 / 1.91), minHeight: 120, flexShrink: 1, flexGrow: 0, marginTop: 12 })
  })

  it('has a square picture as tall as it is wide, and never less than 120 dp', () => {
    render(<NativeAdPage page={new FakePage({ media: { aspectRatio: 1 } })} theme={THEME} lang="en" />)
    expect(flat(above(screen.getByTestId('mock-native-media-view'), 'flexBasis')?.props.style)).toMatchObject({ flexBasis: 528, minHeight: 120 })
  })

  it('has a picture view that fills its place, so that the picture is never cropped', () => {
    render(<NativeAdPage page={new FakePage()} theme={THEME} lang="en" />)
    expect(screen.getByTestId('mock-native-media-view')).toHaveStyle({ width: '100%', height: '100%' })
  })
})

describe('the colour helper', () => {
  it('adds an opacity to a colour written #rrggbb or #rgb', () => {
    expect(withAlpha('#F5B13A', 0x26)).toBe('#F5B13A26')
    expect(withAlpha('#fff', 0x80)).toBe('#ffffff80')
    expect(withAlpha('#000', 0)).toBe('#00000000')
    expect(withAlpha('#123456', 255)).toBe('#123456ff')
  })

  it('keeps the opacity between none and full', () => {
    expect(withAlpha('#123456', 300)).toBe('#123456ff')
    expect(withAlpha('#123456', -5)).toBe('#12345600')
    expect(withAlpha('#123456', 15.6)).toBe('#12345610')
  })

  it('returns a colour that is written otherwise as it is', () => {
    for (const color of ['red', 'rgb(1, 2, 3)', '#12345', '#1234567', '#12345678', '', 'transparent']) expect(withAlpha(color, 0x26)).toBe(color)
  })
})
