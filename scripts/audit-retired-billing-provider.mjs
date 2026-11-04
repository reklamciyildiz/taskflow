#!/usr/bin/env node
/**
 * Entire tracked source tree audit for retired Lemon Squeezy billing.
 * Scan presentation, APIs, hooks, mobile, configs, migrations and docs.
 * Historic DDL must remain for reproducible migrations; legacy identifiers
 * may remain only in explicit subscription-compatibility guards.
 *
 * No app credentials, internet, environment content or database connection
 * are needed. GitHub CI runs this against the actual checkout.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const IGNORED = new Set(['.git', '.next', 'node_modules', 'dist', 'coverage', '.turbo', '.vercel',
  'android', 'Pods', 'build', '.gradle']);
const TEXT = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.md','.mdx','.sql',
  '.yml','.yaml','.css','.html','.txt','.toml','.sh','.env']);
const fileNames = new Set(['Dockerfile','.gitignore','.env.example','.env.staging.example','README']);
const patterns = [
  { name:'lemon-provider', re:/lemon[\s_-]*squeezy|lemonsqueezy|lemonWebhookEventDb|claim_lemon_webhook_event|lemon_webhook_events/gi },
  { name:'lemon-schema-compatibility', re:/\bls_(?:subscription|customer|variant|order|store)_[a-z_]+\b/gi },
  { name:'stale-billing-switch', re:/\bNEW_BILLING_PROVIDER\b|\bLEMON_(?:API|WEBHOOK|STORE|PRODUCT|VARIANT)[A-Z_]*\b/gi },
  { name:'stale-public-beta', re:/AI may remain beta-only|AI is beta-only|beta users only/gi },
];
const hardFailures = [];
const matches = [];
let inspected = 0, bytes = 0;

function walk(directory) {
  for (const item of readdirSync(directory, { withFileTypes:true })) {
    if (IGNORED.has(item.name) && item.isDirectory()) continue;
    const full = join(directory,item.name);
    if (item.isDirectory()) { walk(full); continue; }
    if (!item.isFile()) continue;
    const path = relative(ROOT,full).replace(/\\/g,'/');
    if (!TEXT.has(extname(path)) && !fileNames.has(item.name)) continue;
    const size = statSync(full).size;
    if (size > 5_000_000) continue;
    const source = readFileSync(full,'utf8');
    if (source.includes('\u0000')) continue;
    bytes += size; inspected++;
    const isRuntime = /^(app\/|components\/|hooks\/|lib\/|mobile\/src\/|shared\/)/.test(path);
    const isHistorical = /^supabase\/migrations\//.test(path);
    const lines = source.split(/\r?\n/);
    for (let index=0; index<lines.length; index++) {
      const line = lines[index];
      for (const p of patterns) {
        p.re.lastIndex=0;
        if (!p.re.test(line)) continue;
        let classification='historical';
        if (isRuntime) classification='runtime';
        else if (isHistorical) classification='migration-history';
        else if (/^(docs\/|scripts\/|\.github\/)/.test(path)) classification='documentation-or-test';
        matches.push({path,line:index+1,kind:p.name,classification,excerpt:line.trim().slice(0,185)});
        if (isRuntime && (p.name==='lemon-provider' || p.name==='stale-billing-switch' ||
            p.name==='stale-public-beta')) {
          hardFailures.push({path,line:index+1,kind:p.name});
        }
      }
    }
  }
}
walk(ROOT);
for (const legacyRoute of [
  'app/api/webhooks/lemon/route.ts',
  'app/api/webhooks/lemonsqueezy/route.ts',
  'lib/lemonsqueezy.ts',
]) {
  if (existsSync(join(ROOT,legacyRoute))) hardFailures.push({path:legacyRoute,kind:'retired-provider-route'});
}
const counts = Object.fromEntries(patterns.map(p => [p.name,matches.filter(m=>m.kind===p.name).length]));
const findings = matches.slice(0,220);
console.log(JSON.stringify({
  sourceFiles: inspected, bytesScanned:bytes, legacyMatches:matches.length,
  counts, hardFailures, findings, truncatedMatches:Math.max(0,matches.length-findings.length),
},null,2));
if (hardFailures.length) process.exitCode=1;
