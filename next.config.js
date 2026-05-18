/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Enable gzip/brotli compression on the Node server (Vercel handles this at the edge,
  // but enabling it here ensures it also applies in self-hosted / preview deployments).
  compress: true,

  // Re-enable Next.js image optimisation.
  // Previously set to `unoptimized: true` -- this disabled resizing, format conversion
  // (WebP/AVIF) and lazy loading, which slows LCP significantly for the marketing page.
  // External Supabase avatar URLs and ui-avatars.com are allow-listed below.
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'ui-avatars.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
    ],
  },

  experimental: {
    // Keep these as runtime `require()` from node_modules instead of webpack vendor-chunks.
    // On Windows we have seen MODULE_NOT_FOUND for `./vendor-chunks/<pkg>.js` during dev/build.
    serverComponentsExternalPackages: ['@supabase/supabase-js', '@supabase/ssr', 'next-auth'],
    // Tree-shake icon / UI packages so only imported symbols ship to the client.
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'framer-motion',
      'date-fns',
      'recharts',
    ],
  },

  webpack: (config, { dev }) => {
    // Windows + dev HMR can occasionally corrupt filesystem cache and cause
    // "Cannot find module './<id>.js'" or "__webpack_modules__[moduleId] is not a function".
    // Disabling persistent cache in dev makes chunk resolution deterministic.
    if (dev && process.platform === 'win32') {
      config.cache = false;
    }
    return config;
  },
};

module.exports = nextConfig;