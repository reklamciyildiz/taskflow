import type { CapacitorConfig } from '@capacitor/cli';

const diagnosticServerUrl = process.env.CAPACITOR_WEB_DIAGNOSTIC_URL;
const productionPocEnabled = process.env.AXIOM_CAPACITOR_PRODUCTION_POC === 'true';

if (diagnosticServerUrl) {
  const origin = new URL(diagnosticServerUrl);
  const approvedDiagnosticHost = origin.hostname === 'axiom-mobile-staging.vercel.app';
  const approvedProductionPoc = productionPocEnabled && origin.hostname === 'getaxiomm.vercel.app';
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash
      || (!approvedDiagnosticHost && !approvedProductionPoc)) {
    throw new Error('The WebView diagnostic target must use an explicitly approved Axiom HTTPS origin.');
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
