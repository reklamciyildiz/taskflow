import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (mode === 'android-staging' && env.VITE_AXIOM_API_ORIGIN !== 'https://localhost:3443') {
    throw new Error('Android staging builds must use the verified local HTTPS staging bridge.');
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
