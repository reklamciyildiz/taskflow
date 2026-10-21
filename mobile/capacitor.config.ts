import type { CapacitorConfig } from '@capacitor/cli';

const diagnosticServerUrl = process.env.CAPACITOR_WEB_DIAGNOSTIC_URL;

if (diagnosticServerUrl) {
  const origin = new URL(diagnosticServerUrl);
  if (origin.protocol !== 'https:' || origin.hostname !== 'axiom-mobile-staging.vercel.app') {
    throw new Error('The WebView diagnostic target must use the approved HTTPS staging origin.');
  }
}

const config: CapacitorConfig = {
  appId: 'com.axiomproductivity.mobile.dev',
  appName: 'Axiom Dev',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(diagnosticServerUrl ? { url: diagnosticServerUrl, cleartext: false } : {}),
  },
  android: {
    backgroundColor: '#0b1426',
  },
};

export default config;
