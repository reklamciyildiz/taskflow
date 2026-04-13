import type { Metadata } from 'next';
import './marketing.css';
import { MarketingSmoothScroll } from '@/components/marketing/MarketingSmoothScroll';

function getMetadataBase(): URL {
  const raw = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (raw) {
    try {
      return new URL(raw);
    } catch {
      /* fall through */
    }
  }
  return new URL('http://localhost:3000');
}

const base = getMetadataBase();
const title = 'TaskFlow — From chaos to clarity';
const description =
  'Turn mental noise into actionable workflows. Process boards, Knowledge Hub, voice capture, and a personal productivity OS for teams.';

export const metadata: Metadata = {
  metadataBase: base,
  title,
  description,
  keywords: [
    'task management',
    'team productivity',
    'kanban',
    'personal OS',
    'knowledge hub',
    'second brain',
    'workflow',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/marketing',
    siteName: 'TaskFlow',
    title,
    description:
      'Action-first task system with dynamic pipelines, second brain, and frictionless capture.',
    images: [
      {
        url: '/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'TaskFlow',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description:
      'Dynamic processes, Knowledge Hub, and capture at the speed of thought. Built with Next.js and Supabase.',
    images: ['/icon-512x512.png'],
  },
  alternates: {
    canonical: '/marketing',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'TaskFlow',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description,
  url: new URL('/marketing', base).toString(),
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-theme min-h-screen bg-[#050505] text-foreground antialiased">
      <MarketingSmoothScroll />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </div>
  );
}
