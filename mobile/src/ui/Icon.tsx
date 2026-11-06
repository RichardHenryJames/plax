import Svg, { Path } from 'react-native-svg'
import { ICONS, type IconName } from './icons'

export type { IconName } from './icons'

/** One of the app's icons, drawn in one colour. It is decoration: its button or its text carries the meaning, so a screen reader skips it. */
export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color: string }) {
  const icon = ICONS[name]
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${icon.size} ${icon.size}`} accessible={false} importantForAccessibility="no-hide-descendants">
      {icon.paths.map((path, index) => {
        const stroke = 'stroke' in path ? path.stroke : undefined
        return (
          <Path
            key={index}
            d={path.d}
            fill={'fill' in path ? color : 'none'}
            fillRule={'evenOdd' in path ? 'evenodd' : undefined}
            stroke={stroke === undefined ? undefined : color}
            strokeWidth={stroke}
            strokeLinecap={'cap' in path ? path.cap : undefined}
            strokeLinejoin={'join' in path ? path.join : undefined}
          />
        )
      })}
    </Svg>
  )
}
