import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/marketing', '/privacy', '/terms'],
        disallow: [
          '/api/',
          '/auth/',
          '/onboarding',
          '/settings',
          '/tasks',
          '/projects',
          '/planner',
          '/knowledge',
          '/notes',
        ],
      },
    ],
    sitemap: 'https://www.actiproc.com/sitemap.xml',
  };
}

