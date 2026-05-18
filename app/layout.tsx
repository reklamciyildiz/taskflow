import './globals.css';
import type { Metadata } from 'next';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Axiom - Team & Personal Productivity',
  description: 'Advanced task management with team collaboration, analytics, and AI-powered insights',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
  verification: {
    google: 'Do69Btp7iXA2Enu__-hEZgokFD7RGYaXbqN_Iy7S9fg',
  },
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
      </head>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
