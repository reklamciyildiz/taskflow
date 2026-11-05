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
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Actiproc',
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Personal and team productivity operating system',
  operatingSystem: 'Web',
  description,
  url: new URL('/marketing', base).toString(),
  featureList: [
    'Process boards and Action list view',
    'Planner, due dates and reminders',
    'Action checklists and rich notes',
    'Knowledge Hub and searchable context',
    'Actiproc AI assistant with verified workspace access when available',
    'Multi-team collaboration and assignments',
    'Customers, analytics, notifications and achievements',
    'Google Calendar integrations and Team plan webhooks',
    'Responsive web app and installable PWA',
  ].join('\\n'),
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-theme min-h-screen bg-[#091512] text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </div>
  );
}
