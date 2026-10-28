import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
const middleware = await readFile('middleware.ts', 'utf8');
const assetLinksRoute = await readFile('app/.well-known/assetlinks.json/route.ts', 'utf8');

assert.equal(manifest.name, 'Actiproc - Team & Personal Productivity');
assert.equal(manifest.short_name, 'Actiproc');
assert.equal(manifest.id, '/');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.icons.some((icon) => icon.src === '/icon-192x192.png' && icon.sizes === '192x192'));
assert.ok(manifest.icons.some((icon) => icon.src === '/icon-512x512.png' && icon.sizes === '512x512'));

for (const asset of [
  'apple-touch-icon.png',
  'icon-192x192.png',
  'icon-512x512.png',
  'manifest.webmanifest',
  'sw.js',
  'robots.txt',
  'sitemap.xml',
]) {
  assert.ok(middleware.includes(asset), `${asset} must bypass authentication middleware`);
}

assert.ok(assetLinksRoute.includes('process.env.MOBILE_ANDROID_PACKAGE_ID'));
assert.ok(assetLinksRoute.includes('process.env.MOBILE_ANDROID_CERT_SHA256'));
assert.ok(assetLinksRoute.includes('com.axiomproductivity.twa.diagnostic'));
assert.ok(assetLinksRoute.includes('84:AA:DF:BF:CF:2B:F3:20:DD:C8:9D:53:E0:0E:4D:78:6D:A0:9B:D8:22:F7:40:A3:16:09:DF:BC:8E:38:3C:A8'));
assert.ok(assetLinksRoute.includes('delegate_permission/common.handle_all_urls'));

console.log('TWA/PWA contract checks passed.');
