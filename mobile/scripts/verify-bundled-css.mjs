import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The Next.js components share Tailwind styles. Vite must generate utilities
// from the repo's components and app sources, not merely mobile/src.
const assetsDir = join(process.cwd(), 'dist', 'assets');
const cssNames = readdirSync(assetsDir).filter(name => name.endsWith('.css'));
assert.ok(cssNames.length > 0, 'Vite did not emit CSS.');
const css = cssNames.map(name => readFileSync(join(assetsDir, name), 'utf8')).join('\n');
for (const [name, pattern] of [
  ['flex utility', /\.flex\s*\{\s*display\s*:\s*flex/],
  ['grid utility', /\.grid\s*\{\s*display\s*:\s*grid/],
  ['min-width utility', /\.min-w-0\s*\{/],
  ['rounded utility', /\.rounded-(?:lg|xl)\s*\{/],
  ['dashboard panel', /\.dashboard-v2-panel(?:\s|\{|,|:)/],
]) assert.match(css, pattern, 'Missing ' + name + ' in bundled CSS');
assert.doesNotMatch(css, /@tailwind\s+(base|components|utilities)/, 'Raw Tailwind directives remain.');
console.log('Validated native CSS bundle includes Tailwind and dashboard styles.');
