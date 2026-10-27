import './globals.css';
import '@/shared/product-ui/axiom-workspace-lists.css';
import type { Metadata } from 'next';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Actiproc - Team & Personal Productivity',
  description: 'Advanced task management with team collaboration, analytics, and AI-powered insights',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Actiproc',
  },
  verification: {
    google: 'Do69Btp7iXA2Enu__-hEZgokFD7RGYaXbqN_Iy7S9fg',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Open TCP connections to critical third-party origins before any resource
            is requested, cutting the DNS + TLS handshake out of the critical path. */}
        <link rel="preconnect" href="https://ujryiwlfzgdnwgvylzqe.supabase.co" />
        <link rel="dns-prefetch" href="https://ujryiwlfzgdnwgvylzqe.supabase.co" />
        <link rel="preconnect" href="https://ui-avatars.com" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
