import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ErrorBoundary } from '../ErrorBoundary'

const state = { explode: true }

function Bomb() {
  if (state.explode) throw new Error('a screen that cannot be drawn')
  return <Text>all well</Text>
}

describe('the page a failed screen leaves behind', () => {
  let error: jest.SpyInstance
  beforeEach(() => {
    state.explode = true
    // React reports a caught error on the console; the test knows about it.
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => error.mockRestore())

  it('draws its children when all is well', () => {
    state.explode = false
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('all well')).toBeTruthy()
    expect(screen.queryByTestId('crash-page')).toBeNull()
  })

  it('shows a plain page with the name of the app and a button, not a closed app, when a screen fails', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('crash-page')).toBeTruthy()
    expect(screen.getByText('Plax')).toBeTruthy()
    expect(screen.getByText('Plax is temporarily unavailable. Please try again shortly.')).toBeTruthy()
    expect(screen.getByText('Try again')).toBeTruthy()
  })

  it('draws the screen again when the reader presses Try again, and lets go of what it held', () => {
    const reset = jest.fn(() => {
      state.explode = false
    })
    render(
      <ErrorBoundary onReset={reset}>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('crash-page')).toBeTruthy()
    fireEvent.press(screen.getByTestId('crash-retry'))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(screen.getByText('all well')).toBeTruthy()
  })

  it('shows the page again when the screen fails again', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    fireEvent.press(screen.getByTestId('crash-retry'))
    expect(screen.getByTestId('crash-page')).toBeTruthy()
  })
})
