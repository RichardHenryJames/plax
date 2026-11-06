import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Chip, DangerButton, IconButton, LineButton, MenuButton, PrimaryButton, SecondaryButton, SkeletonCard, Txt, withAlpha } from '../primitives'
import { LanguageProvider } from '../i18n-context'
import { DARK_PALETTE, LIGHT_PALETTE, ThemeProvider, resolveTheme, useTheme } from '../theme'
import { Dialog, Sheet, SidePanel, ToastProvider, useToast } from '../overlays'
import { ICONS } from '../icons.generated'
import { Icon } from '../Icon'

const wrap = (node: React.ReactNode, mode: 'light' | 'dark' = 'light', lang: 'en' | 'hi' = 'en') => (
  <ThemeProvider mode={mode}>
    <LanguageProvider lang={lang}>{node}</LanguageProvider>
  </ThemeProvider>
)

describe('theme', () => {
  it('is light, dark, or the phone\'s own', () => {
    expect(resolveTheme('light', 'dark').dark).toBe(false)
    expect(resolveTheme('dark', 'light').dark).toBe(true)
    expect(resolveTheme('system', 'dark').dark).toBe(true)
    expect(resolveTheme('system', 'light').dark).toBe(false)
    expect(resolveTheme('system', null).dark).toBe(false)
    expect(resolveTheme('dark', null).palette).toBe(DARK_PALETTE)
    expect(resolveTheme('light', null).palette).toBe(LIGHT_PALETTE)
  })

  it('has the same colours as the native app', () => {
    expect(LIGHT_PALETTE).toMatchObject({ bg: '#F7F5F0', accent: '#F5B13A', accentText: '#8F5400', accentSoft: '#FCEBC8', danger: '#B3261E' })
    expect(DARK_PALETTE).toMatchObject({ bg: '#0B0B0E', accent: '#F5B13A', accentText: '#F5B13A', accentSoft: '#3A2C0E', danger: '#F2B8B5' })
  })

  it('is given to the screens below the provider', () => {
    function Probe() {
      return <Text>{useTheme().palette.bg}</Text>
    }
    render(wrap(<Probe />, 'dark'))
    expect(screen.getByText('#0B0B0E')).toBeTruthy()
  })

  it('makes a colour with some transparency', () => {
    expect(withAlpha('#17171B', 0.133)).toBe('rgba(23,23,27,0.133)')
  })
})

describe('icons', () => {
  it('has every drawing of the native app', () => {
    expect(Object.keys(ICONS).sort()).toEqual(
      ['arrow_up', 'bookmark', 'bookmark_filled', 'check_circle', 'close', 'cloud_off', 'download', 'empty', 'feed', 'grid', 'image', 'info', 'mail', 'menu', 'person', 'plax', 'share', 'shield', 'sparkle', 'star', 'theme', 'trash'].sort(),
    )
    for (const icon of Object.values(ICONS)) expect(icon.paths.length).toBeGreaterThan(0)
  })

  it('draws without a name for a screen reader', () => {
    render(wrap(<Icon name="share" color="#000" />))
    expect(screen.queryByRole('image')).toBeNull()
  })
})

describe('buttons', () => {
  it('press and are named for a screen reader', () => {
    const calls: string[] = []
    render(
      wrap(
        <>
          <PrimaryButton label="Primary" onPress={() => calls.push('primary')} />
          <SecondaryButton label="Secondary" onPress={() => calls.push('secondary')} />
          <DangerButton label="Danger" onPress={() => calls.push('danger')} />
          <IconButton icon="close" label="Close it" onPress={() => calls.push('icon')} />
          <LineButton icon="bookmark" label="Save story" fill="#EEE" tint="#000" onPress={() => calls.push('line')} />
          <MenuButton onPress={() => calls.push('menu')} />
          <Chip label="India" onPress={() => calls.push('chip')} />
        </>,
      ),
    )
    for (const name of ['Primary', 'Secondary', 'Danger', 'Close it', 'Save story', 'Menu', 'India']) fireEvent.press(screen.getByLabelText(name))
    expect(calls).toEqual(['primary', 'secondary', 'danger', 'icon', 'line', 'menu', 'chip'])
  })

  it('do nothing when disabled', () => {
    const press = jest.fn()
    render(wrap(<PrimaryButton label="Go" onPress={press} disabled />))
    fireEvent.press(screen.getByLabelText('Go'))
    expect(press).not.toHaveBeenCalled()
  })

  it('tell a chip that is selected', () => {
    render(wrap(<Chip label="World" selected onPress={() => undefined} />))
    expect(screen.getByLabelText('World')).toBeSelected()
  })

  it('name the menu button in the reader\'s language', () => {
    render(wrap(<MenuButton onPress={() => undefined} />, 'light', 'hi'))
    expect(screen.getByTestId('menu-button').props.accessibilityLabel).not.toBe('Menu')
  })
})

describe('text', () => {
  it('keeps the font\'s own padding for Hindi only', () => {
    render(
      wrap(
        <>
          <Txt testID="en">a</Txt>
        </>,
      ),
    )
    expect(screen.getByTestId('en').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ includeFontPadding: false })]))
    render(wrap(<Txt testID="hi">अ</Txt>, 'light', 'hi'))
    expect(screen.getByTestId('hi').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ includeFontPadding: true })]))
  })

  it('shows a placeholder shaped like a story', () => {
    render(wrap(<SkeletonCard />))
    // It is hidden from a screen reader on purpose, so the query has to ask for hidden elements.
    expect(screen.getByTestId('skeleton', { includeHiddenElements: true })).toBeTruthy()
  })
})

describe('overlays', () => {
  it('show a sheet while it is visible and close it from its scrim', () => {
    const close = jest.fn()
    const { rerender } = render(
      wrap(
        <Sheet visible onClose={close} closeLabel="Done">
          <Text>inside</Text>
        </Sheet>,
      ),
    )
    expect(screen.getByText('inside')).toBeTruthy()
    fireEvent.press(screen.getByTestId('scrim'))
    expect(close).toHaveBeenCalledTimes(1)
    rerender(
      wrap(
        <Sheet visible={false} onClose={close} closeLabel="Done">
          <Text>inside</Text>
        </Sheet>,
      ),
    )
    expect(screen.queryByText('inside')).toBeNull()
  })

  it('show a menu panel and a dialog with its buttons', () => {
    const first = jest.fn()
    const close = jest.fn()
    render(
      wrap(
        <>
          <SidePanel visible onClose={close} closeLabel="Close menu">
            <Text>panel</Text>
          </SidePanel>
          <Dialog visible title="Title" message="Message" actions={[{ label: 'Later', onPress: first }, { label: 'Update', onPress: first }]} onClose={close} />
        </>,
      ),
    )
    expect(screen.getByText('panel')).toBeTruthy()
    expect(screen.getByText('Title')).toBeTruthy()
    expect(screen.getByText('Message')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Update'))
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('gives a message that goes away by itself', () => {
    jest.useFakeTimers()
    function Caller() {
      const toast = useToast()
      return <Text onPress={() => toast.show('Saved on this phone')}>save</Text>
    }
    render(
      wrap(
        <ToastProvider>
          <Caller />
        </ToastProvider>,
      ),
    )
    fireEvent.press(screen.getByText('save'))
    expect(screen.getByText('Saved on this phone')).toBeTruthy()
    act(() => {
      jest.advanceTimersByTime(2100)
    })
    expect(screen.queryByText('Saved on this phone')).toBeNull()
  })
})
