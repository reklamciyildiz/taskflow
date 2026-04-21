/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  // Avoid fragile vendor-chunks for @scoped packages (Windows dev has seen MODULE_NOT_FOUND for ./vendor-chunks/@supabase.js)
  experimental: {
    // Keep these as runtime `require()` from node_modules instead of webpack vendor-chunks.
    // On Windows we have seen MODULE_NOT_FOUND for `./vendor-chunks/<pkg>.js` during dev/build.
    serverComponentsExternalPackages: ['@supabase/supabase-js', '@supabase/ssr', 'next-auth'],
    // Daha küçük client chunk’lar; ilk rota yükünde daha az parse/transfer
    optimizePackageImports: ['lucide-react'],
  },
  webpack: (config, { dev, isServer }) => {
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
