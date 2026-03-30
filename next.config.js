/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  // Avoid fragile vendor-chunks for @scoped packages (Windows dev has seen MODULE_NOT_FOUND for ./vendor-chunks/@supabase.js)
  experimental: {
    serverComponentsExternalPackages: ['@supabase/supabase-js', '@supabase/ssr'],
  },
};

module.exports = nextConfig;
