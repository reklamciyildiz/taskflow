import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.axiomproductivity.mobile.dev',
  appName: 'Axiom Dev',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0b1426',
  },
};

export default config;
