import type { Config } from 'tailwindcss';
import webConfig from '../tailwind.config';

// Vite runs from mobile/, not the Next.js repository root. Generate every
// utility used by shared Next.js components AND the native Vite screens.
// This configuration stays local to Capacitor and does not modify web CSS.
const config: Config = {
  ...webConfig,
  content: {
    relative: true,
    files: [
      '../app/**/*.{js,ts,jsx,tsx,mdx}',
      '../components/**/*.{js,ts,jsx,tsx,mdx}',
      '../pages/**/*.{js,ts,jsx,tsx,mdx}',
      '../shared/**/*.{js,ts,jsx,tsx,mdx}',
      './src/**/*.{js,ts,jsx,tsx,mdx}',
    ],
  },
};

export default config;
