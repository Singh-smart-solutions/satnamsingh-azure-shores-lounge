import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Azure Shores — Lounge',
  description: 'Beach & Pool Lounge Service',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#0e0f13' }}>
        {children}
      </body>
    </html>
  )
}
