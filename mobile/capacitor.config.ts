import type { CapacitorConfig } from '@capacitor/cli';

const diagnosticServerUrl = process.env.CAPACITOR_WEB_DIAGNOSTIC_URL;
const productionPocEnabled = process.env.AXIOM_CAPACITOR_PRODUCTION_POC === 'true' || process.env.ACTIPROC_CAPACITOR_PRODUCTION === 'true';

if (diagnosticServerUrl) {
  const origin = new URL(diagnosticServerUrl);
  const approvedDiagnosticHost = origin.hostname === 'axiom-mobile-staging.vercel.app';
  const approvedProductionPoc = productionPocEnabled && (origin.hostname === 'getaxiomm.vercel.app' || origin.hostname === 'www.actiproc.com' || origin.hostname === 'actiproc.com');
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash
      || (!approvedDiagnosticHost && !approvedProductionPoc)) {
    throw new Error('The WebView diagnostic target must use an explicitly approved Actiproc HTTPS origin.');
  }
}

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID || 'com.actiproc.app.dev',
  appName: process.env.CAPACITOR_APP_NAME || 'Actiproc Beta',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(diagnosticServerUrl ? { url: diagnosticServerUrl, cleartext: false } : {}),
  },
  android: {
    backgroundColor: '#0F172A',
  },
};

export default config;
