import { BRAND, P_BOWL, P_BOX, P_IN_TILE, P_STEM } from '@/lib/brand'

/**
 * The app icon drawn for the share-card pictures (next/og): a dark P on an amber tile, the same shapes and colours as the
 * icon on the phone. It was a letter typed in a font, which was not the Plax P at all.
 */
export function PTile({ size, radius }: { size: number; radius?: number }) {
  const height = size * P_IN_TILE
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.28),
        background: BRAND.iconBackground,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={(height * P_BOX.width) / P_BOX.height}
        height={height}
        viewBox={`${P_BOX.x} ${P_BOX.y} ${P_BOX.width} ${P_BOX.height}`}
      >
        <path d={P_BOWL} fill={BRAND.iconInk} />
        <path d={P_STEM} fill={BRAND.iconInk} />
      </svg>
    </div>
  )
}
