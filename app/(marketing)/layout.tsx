import type { Metadata } from 'next';
import './marketing.css';

function getMetadataBase(): URL {
  const raw = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (raw) {
    try {
      return new URL(raw);
    } catch {
      /* fall through */
    }
  }
  return new URL('https://www.actiproc.com');
}

const base = getMetadataBase();
const title = 'Actiproc — Everything moves together';
const description =
  'From idea to outcome: connect Processes, Actions, checklists, Planner, rich notes, Knowledge Hub and team workflows in one Actiproc workspace.';

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
    'knowledge management',
    'planner',
    'project collaboration',
    'Actiproc AI',
    'workflow',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/marketing',
    siteName: 'Actiproc',
    title,
    description,
    images: [
      {
        url: '/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'Actiproc',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/icon-512x512.png'],
  },
  alternates: {
    canonical: '/marketing',
    languages: {en:'/marketing',tr:'/marketing/tr','x-default':'/marketing'},
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-theme min-h-screen bg-[#091512] text-foreground antialiased">
      {children}
    </div>
  );
}
