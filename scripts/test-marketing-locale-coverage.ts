/**
 * Static i18n coverage for the current SSR + interactive landing route.
 * Unlike dictionary-key checks alone, this also catches visible JSX text
 * that developers forget to wrap in marketingT(locale).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { hasTurkishMarketingCopy, translateMarketing } from '../lib/marketing-locale';

const visibleFiles = [
  'app/(marketing)/marketing/page.tsx',
  'components/marketing/MarketingExperience.tsx',
  'components/marketing/MarketingFeedbackCommunity.tsx',
  'components/marketing/MarketingWorkflowIntelligence.tsx',
  'components/marketing/MarketingWorkspacePreview.tsx',
  'components/marketing/MarketingAudienceSwitch.tsx',
  'components/marketing/MarketingHeader.tsx',
  'components/marketing/MarketingMobileMenu.tsx',
  'components/marketing/MarketingFooter.tsx',
  'components/marketing/MarketingLanguageSwitcher.tsx',
  'components/marketing/sections/MarketingPricing.tsx',
] as const;

const marketingDataFields: Record<string, Record<string, readonly string[]>> = {
  'components/marketing/MarketingExperience.tsx': {
    process: ['label', 'title', 'detail'],
    features: ['title', 'eyebrow', 'description', 'tags'],
    items: ['question', 'answer'], // FAQ, including the collapsed responses
  },
  'components/marketing/MarketingFeedbackCommunity.tsx': {
    steps: ['title', 'detail'],
  },
  'components/marketing/MarketingWorkflowIntelligence.tsx': {
    stages: ['phase', 'name', 'owner', 'state'],
  },
  'components/marketing/MarketingAudienceSwitch.tsx': {
    stories: ['eyebrow', 'title', 'description', 'bullets', 'board', 'cards', 'status'],
    tabs: ['label'],
  },
  'components/marketing/MarketingWorkspacePreview.tsx': {
    tabs: ['label'],
    stages: ['name'],
    work: ['name', 'stage', 'priority'],
    notes: ['title', 'type', 'detail', 'context', 'count'],
  },
  'components/marketing/sections/MarketingPricing.tsx': {
    plans: ['title', 'subtitle'],
  },
};

// Product and plan proper nouns are deliberately not translated.
// Localized service descriptions, actions, labels and sample data still are.
const preservedProperNouns = new Set(['Actiproc', 'actiproc', 'NS', 'Free', 'Individual', 'Pro', 'Team']);
const preservedDecorativeText = new Set(['actiproc.com / northstar-studio /']);
const userFacingAttributes = new Set(['aria-label', 'aria-description', 'aria-placeholder', 'placeholder', 'alt', 'title']);

function lexicalText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
function containsLetters(value: string): boolean {
  return /[a-zA-ZÇĞİÖŞÜçğıöşü]/.test(value);
}
const issues: string[] = [];
let translationsChecked = 0;
let nodesChecked = 0;
function fail(file: string, node: ts.Node, source: ts.SourceFile, message: string) {
  const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  issues.push(file + ':' + line + ' ' + message);
}
function checkTranslation(file: string, node: ts.Node, source: ts.SourceFile, raw: string) {
  const value = lexicalText(raw);
  if (!value || !containsLetters(value) || preservedProperNouns.has(value)) return;
  translationsChecked++;
  if (!hasTurkishMarketingCopy(value)) {
    fail(file, node, source, 'Missing TR dictionary key: ' + JSON.stringify(value));
  } else {
    const translated = translateMarketing('tr', value);
    if (!translated.trim()) fail(file, node, source, 'Empty TR translation for ' + JSON.stringify(value));
  }
}

for (const file of visibleFiles) {
  const input = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function walkData(node: ts.Node, translatableFields: Set<string>, withinCopy: boolean) {
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
      walkData(node.expression, translatableFields, withinCopy);
      return;
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(source).replace(/^['"]|['"]$/g, '');
      walkData(node.initializer, translatableFields, translatableFields.has(name));
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (withinCopy) checkTranslation(file, node, source, node.text);
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) walkData(property, translatableFields, false);
      return;
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) walkData(element, translatableFields, withinCopy);
      return;
    }
    ts.forEachChild(node, child => walkData(child, translatableFields, withinCopy));
  }

  function visit(node: ts.Node) {
    nodesChecked++;

    if (ts.isJsxText(node)) {
      const value = lexicalText(node.text);
      if (containsLetters(value) && !preservedProperNouns.has(value)
        && !preservedDecorativeText.has(value)) {
        fail(file, node, source, 'Raw visible JSX copy bypasses the locale: ' + JSON.stringify(value.slice(0, 150)));
      }
    }

    if (ts.isJsxAttribute(node)) {
      const name = node.name.text;
      const value = node.initializer;
      if (value && ts.isStringLiteral(value)) {
        if (userFacingAttributes.has(name) && containsLetters(value.text)
          && !preservedProperNouns.has(value.text)) {
          fail(file, node, source, 'User-facing ' + name + ' must be translated: ' + JSON.stringify(value.text));
        }
        if (name === 'subtitle') checkTranslation(file, node, source, value.text);
      }
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 't' && node.arguments.length > 0) {
      const arg = node.arguments[0];
      if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
        checkTranslation(file, arg, source, arg.text);
      }
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const fields = marketingDataFields[file]?.[node.name.text];
      if (fields) walkData(node.initializer, new Set(fields), false);
    }

    ts.forEachChild(node, visit);
  }
  visit(source);
}

// Prevent dictionary overwrites that silently change a valid translation.
const catalogSource = ts.createSourceFile(
  'lib/marketing-locale.ts',
  readFileSync('lib/marketing-locale.ts', 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
);
let catalogCount = 0;
const catalogKeys = new Set<string>();
function visitCatalog(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
    && node.name.text === 'turkish' && node.initializer
    && ts.isObjectLiteralExpression(node.initializer)) {
    for (const entry of node.initializer.properties) {
      if (!ts.isPropertyAssignment(entry)) continue;
      const key = ts.isStringLiteral(entry.name) ? entry.name.text : entry.name.getText(catalogSource);
      if (catalogKeys.has(key)) fail('lib/marketing-locale.ts', entry, catalogSource,
        'Duplicate TR dictionary key: ' + JSON.stringify(key));
      catalogKeys.add(key);
      catalogCount++;
    }
  }
  ts.forEachChild(node, visitCatalog);
}
visitCatalog(catalogSource);

// Sentinel checks cover content from the user-reported screenshot.
for (const phrase of [
  'Your ideas help shape what\'s next.',
  'Share an idea',
  'Actiproc now has a dedicated place for feature requests and improvements. Tell us what slows you down, support ideas you care about, and follow the decisions that shape the product.',
  'matching entries',
  'Compare billing periods',
]) assert.ok(hasTurkishMarketingCopy(phrase), 'Missing screenshot fix: ' + phrase);

assert.deepEqual(issues, [], 'Untranslated landing copy or duplicate keys:\n' + issues.join('\n'));
console.log(JSON.stringify({
  suite: 'marketing-locale-visible-copy',
  locale: 'tr',
  files: visibleFiles.length,
  nodesChecked,
  translationsChecked,
  catalogCount,
  untranslated: 0,
  duplicateKeys: 0,
  result: 'PASS',
}));
