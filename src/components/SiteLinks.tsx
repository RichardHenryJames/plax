import Link from 'next/link'

const WORDS = {
  en: { contact: 'Contact us', privacy: 'Privacy policy', label: 'Plax information' },
  hi: { contact: 'हमसे संपर्क करें', privacy: 'गोपनीयता नीति', label: 'Plax की जानकारी' },
}

/**
 * Contact and policy links for the foot of the public pages, so a reader (or a reviewer from Google Play) finds the contact
 * page from any of them without opening a menu. Server-rendered, so it is also in the HTML that crawlers read.
 */
export function SiteLinks({ lang = 'en', className = '' }: { lang?: 'en' | 'hi'; className?: string }) {
  const words = WORDS[lang]
  const link = 'focus-ring font-semibold text-[color:var(--signal-text)] hover:underline rounded'
  return (
    <nav aria-label={words.label} lang={lang === 'hi' ? 'hi' : undefined} className={`flex flex-wrap gap-x-6 gap-y-2 text-sm ${className}`}>
      <Link href="/contact" className={link}>{words.contact}</Link>
      <Link href="/privacy" className={link}>{words.privacy}</Link>
    </nav>
  )
}
