import { act, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

const CHAR = 8

/**
 * Plays the part of the phone for every story page on the screen: tells each text that asks how it broke its lines (a character is 8 dp
 * wide here), so that the pages lay themselves out. Without it a page shows only its menu button.
 */
export function measureEverything(width: number): void {
  const texts = screen.UNSAFE_getAllByType(Text).filter((node) => typeof node.props.onTextLayout === 'function')
  for (const node of texts) {
    const style = Object.assign({}, ...[node.props.style].flat(5).filter(Boolean)) as { fontSize?: number }
    const text = String(node.props.children)
    const perLine = Math.max(8, Math.floor(width / (((style.fontSize ?? 16) / 16) * CHAR)))
    const words = text.split(/\s+/)
    const lines: { text: string; width: number }[] = []
    let current = ''
    for (const word of words) {
      if (current === '') current = word
      else if (current.length + 1 + word.length <= perLine) current += ` ${word}`
      else {
        lines.push({ text: `${current} `, width: current.length * CHAR })
        current = word
      }
    }
    lines.push({ text: current, width: current.length * CHAR })
    act(() => node.props.onTextLayout({ nativeEvent: { lines } }))
  }
}
