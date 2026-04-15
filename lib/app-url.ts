export function getPublicAppUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.VERCEL_URL;

  if (!fromEnv) return 'http://localhost:3000';
  if (fromEnv.startsWith('http://') || fromEnv.startsWith('https://')) return fromEnv.replace(/\/$/, '');
  return `https://${fromEnv}`.replace(/\/$/, '');
}
