import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

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
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('../', import.meta.url)),
        react: fileURLToPath(new URL('../node_modules/react', import.meta.url)),
        'react-dom': fileURLToPath(new URL('../node_modules/react-dom', import.meta.url)),
      },
      dedupe: ['react', 'react-dom'],
    },
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
