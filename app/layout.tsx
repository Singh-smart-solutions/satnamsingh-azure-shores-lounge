import type { Metadata, Viewport } from 'next'
import './globals.css'

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
      <body className="bg-charcoal-black text-[#f0ece4] min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
