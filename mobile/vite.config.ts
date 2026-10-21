import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (mode === 'android-staging' && env.VITE_AXIOM_API_ORIGIN !== 'https://localhost:3443') {
    throw new Error('Android staging builds must use the verified local HTTPS staging bridge.');
  }
  if (mode === 'android-device-staging') {
    const origin = new URL(env.VITE_AXIOM_API_ORIGIN);
    if (origin.protocol !== 'https:' || origin.hostname === 'localhost' || origin.hostname === '127.0.0.1') {
      throw new Error('Android device staging builds require a public HTTPS API origin.');
    }
  }

  return {
    plugins: [react()],
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
