import Link from 'next/link'
import { withBase } from '@/lib/base-path'

/**
 * The Plax mark: the logo's P as a flat glyph, then the wordmark in the headline serif. The same lockup as the app's
 * header. It follows the surrounding text colour, so it reads on the light and the dark theme alike.
 */
export function BrandMark({ size = 'md', href = '/', className = '' }: { size?: 'sm' | 'md' | 'lg'; href?: string | null; className?: string }) {
  const glyph = size === 'lg' ? 'w-9 h-9' : size === 'sm' ? 'w-6 h-6' : 'w-7 h-7'
  const word = size === 'lg' ? 'text-[28px]' : size === 'sm' ? 'text-[19px]' : 'text-2xl'
  const content = (
    <>
      <span
        className={`brand-glyph ${glyph} shrink-0`}
        style={{ '--mark': `url(${withBase('/plaxlabs_logo.png')})` } as React.CSSProperties}
        aria-hidden="true"
      />
      <span className={`wordmark ${word} text-white`}>Plax</span>
    </>
  )
  const classes = `inline-flex items-center gap-2 text-white ${className}`
  return href === null ? (
    <span className={classes}>{content}</span>
  ) : (
    <Link href={href} aria-label="Plax home" className={`focus-ring rounded-lg ${classes}`}>
      {content}
    </Link>
  )
}
