import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProviderWrapper } from '@/components/AuthProviderWrapper'

export const metadata: Metadata = {
  title: 'Plax — Read Smarter',
  description: 'Swipe through knowledge. Bite-sized content for curious minds.',
  keywords: ['reading', 'learning', 'knowledge', 'microessays', 'education'],
  authors: [{ name: 'Plax Labs' }],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#050505',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-dark-bg text-dark-text antialiased overflow-hidden">
        <AuthProviderWrapper>{children}</AuthProviderWrapper>
      </body>
    </html>
  )
}
