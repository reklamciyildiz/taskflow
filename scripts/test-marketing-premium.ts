import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTIPROC_PLANS } from '../lib/billing-plans';
import { AI_PLAN_LIMITS } from '../lib/ai/ai-plan-catalog';
import { hasTurkishMarketingCopy } from '../lib/marketing-locale';

const read = (path: string) => readFileSync(path,'utf8');
const page = read('app/(marketing)/marketing/page.tsx');
const experience = read('components/marketing/MarketingExperience.tsx');
const preview = read('components/marketing/MarketingWorkspacePreview.tsx');
const intelligence = read('components/marketing/MarketingWorkflowIntelligence.tsx');
const audience = read('components/marketing/MarketingAudienceSwitch.tsx');
const header = read('components/marketing/MarketingHeader.tsx');
const mobile = read('components/marketing/MarketingMobileMenu.tsx');
const pricing = read('components/marketing/sections/MarketingPricing.tsx');
const footer = read('components/marketing/MarketingFooter.tsx');
const community = read('components/marketing/MarketingFeedbackCommunity.tsx');
const css = read('app/(marketing)/marketing.css');
const metadata = read('app/(marketing)/layout.tsx');
const sitemap = read('app/sitemap.ts');
const vercel = JSON.parse(read('vercel.json'));
const turkishPage = read('app/(marketing)/marketing/tr/page.tsx');
const switcher = read('components/marketing/MarketingLanguageSwitcher.tsx');
const documentLanguage = read('components/marketing/MarketingDocumentLanguage.tsx');
const translations = read('lib/marketing-locale.ts');

let checks = 0;
for(const part of [experience,preview,audience,community,header,mobile,footer,pricing,intelligence]) {
  assert.match(part,/marketingT|MarketingLocale|locale/);
}
assert.match(page,/locale='en'/);
assert.match(turkishPage,/locale="tr"/);
assert.match(turkishPage,/canonical:'\/marketing\/tr'/);
assert.match(turkishPage,/tr_TR/);
assert.match(sitemap,/\/marketing\/tr/);
assert.match(page,/lang=\{locale\}/);
assert.match(page,/inLanguage:locale/);
assert.match(page,/application\/ld\+json/);
assert.doesNotMatch(metadata,/dangerouslySetInnerHTML/);
assert.match(switcher,/window\.location\.hash/);
assert.match(switcher,/aria-current/);
assert.match(documentLanguage,/document\.documentElement\.lang=locale/);
assert.match(translations,/Kullanıcı başına günde en fazla/);
checks+=16;

for (const name of ['MarketingHero','MarketingWorkflow','MarketingProductSystem',
  'MarketingWorkflowIntelligence','MarketingConnectedWorkspace','MarketingIntegrations','MarketingPricing',
  'MarketingFinalCta','MarketingFAQ','MarketingFooter','MarketingFeedbackCommunity']) {
  assert.match(page, new RegExp('<' + name + '\\b'));
  checks++;
}
assert.match(page,/id="main-content"/);
assert.match(page,/<MarketingIntegrations locale=\{locale\} \/>\s*<MarketingFeedbackCommunity locale=\{locale\} \/>\s*<MarketingPricing locale=\{locale\} \/>/);
assert.match(community,/id="community"/);
assert.match(community,/href="\/feedback"/);
assert.match(community,/href="\/auth\/signup\?callbackUrl=%2Ffeedback"/);
assert.match(community,/Illustrative product preview/);
assert.match(community,/\{t\("Your ideas help shape what's next\."\)\}/);
assert.match(community,/\{t\("Share an idea"\)\}/);
assert.match(community,/\{t\("Actiproc now has a dedicated place/);
assert.match(preview,/\{filtered\.length\} \{t\("matching entries"\)\}/);
assert.match(pricing,/aria-label=\{t\("Compare billing periods"\)\}/);
assert.match(community,/Not live vote counts or customer activity/);
assert.doesNotMatch(community,/Yiğit|Tilaver|Yigit Tech Company|yiğit tech company/i);
checks+=7;
assert.match(page,/ap-skip-link/);
assert.doesNotMatch(page,/MarketingSocialProof|MarketingConfetti|MarketingParallaxGlow|MarketingHeroInteractive/);
checks+=3;

for (const name of ['id="workflow"','id="product"','id="features"',
  'id="teams"','id="integrations"','id="pricing"']) {
  assert.ok((experience+pricing).includes(name),'Missing section anchor '+name);
  checks++;
}
const publishedFeatures = experience.toLowerCase();
for(const feature of ['process','action','knowledge','planner','actiproc ai',
  'analytics','customer','webhook','google calendar','notification','inbox','achievement']) {
  assert.ok(publishedFeatures.includes(feature),'Missing product surface: '+feature);
}
checks++;

for (const name of ['board','planner','notes','ai']) {
  assert.match(preview, new RegExp("key: '"+name+"'"));
  checks++;
}
assert.match(preview,/aria-pressed=\{selected\s*===\s*key\}/);
assert.match(preview,/useState<PreviewTab>/);
assert.match(preview,/Illustrative workspace · not live user data/);
assert.doesNotMatch(preview,/window\.localStorage|dangerouslySetInnerHTML/);
for(const text of ['Northstar Studio','Product launch','Knowledge Hub','QUICK CAPTURE',
  'Research interview synthesis','Review campaign creative','Sample workspace']){
  assert.ok(preview.includes(text),'Missing realistic demo detail: '+text);
}
assert.doesNotMatch(preview,/Yiğit|Tilaver|Delta Marine|İş Arama|SmartSafe AI|Swing Trade|hook\.eu1\.make\.com|integration\.mihu\.ai/i);
assert.match(preview,/aria-label=\{t\("Search the sample workspace"\)\}/);
assert.match(preview,/onClick=\{\(\)=>setPinned/);
assert.match(preview,/onClick=\{\(\)=>setView/);
assert.match(preview,/setMoved\(true\)/);
assert.match(preview,/setCreated\(!created\)/);
checks+=4;

assert.match(header,/MarketingMobileMenu/);
assert.match(experience,/href="#community"/);
assert.match(mobile,/href: '#community'/);
assert.match(footer,/href:'#community'/);
checks+=3;
assert.match(mobile,/aria-expanded=\{open\}/);
assert.match(mobile,/closeOnEscape/);
assert.match(mobile,/closeOnOutsideClick/);
assert.match(mobile,/onClick=\{\(\) => setOpen\(false\)\}/);
checks+=5;

for(const [plan,price] of Object.entries(ACTIPROC_PLANS)) {
  assert.ok(pricing.includes("id:'"+plan+"'"),'No pricing option '+plan);
  assert.ok(price.priceUsd>=0);
  assert.ok(AI_PLAN_LIMITS[plan as keyof typeof AI_PLAN_LIMITS].monthlyBase>0);
  checks+=3;
}
assert.match(pricing,/actiprocPriceUsd\(p.id,billingInterval\)/);
assert.match(pricing,/AI_PLAN_LIMITS\[p.id\].monthlyBase/);
assert.match(pricing,/No automatic overage charges/);
assert.match(pricing,/service availability/);
assert.match(pricing,/\/settings\/billing\?plan=/);
assert.doesNotMatch(pricing,/Testimonials|5000\+|trusted by|staged beta rollout/gi);
checks+=6;

assert.match(css,/prefers-reduced-motion: reduce/);
assert.match(css,/ap-preview-outer/);
assert.match(css,/ap-section-title/);
assert.match(css,/ap-skip-link:focus/);
assert.match(css,/ap-hero-title/);
assert.match(css,/ap-feature-card/);
assert.match(css,/ap-marquee-track/);
assert.match(css,/prefers-reduced-motion: reduce/);
assert.match(experience,/id="experience"/);
assert.match(experience,/id="faq"/);
assert.match(experience,/Illustrations are demonstrations, not live customer activity/);
assert.match(experience,/Web & mobile access/);
assert.match(experience,/Smart Dependencies/);
assert.match(experience,/Advanced Reporting/);
for(const mode of ["'solo'", "'team'", "'organization'"]) assert.ok(audience.includes(mode));
assert.match(audience,/role="tablist"/);
assert.match(audience,/aria-selected=\{selected === tab.key\}/);
assert.match(audience,/not live statistics/);
checks+=13;

/* P2.3 and P3.1 marketing must reflect shipped capabilities, not roadmap claims. */
assert.match(page, /<MarketingProductSystem locale=\{locale\} \/>[\s\S]*?<MarketingWorkflowIntelligence locale=\{locale\} \/>[\s\S]*?<MarketingConnectedWorkspace locale=\{locale\} \/>/);
assert.match(page, /t\('Smart Dependencies'\),t\('Advanced Reporting'\)/);
assert.match(metadata, /task dependencies/);
assert.match(metadata, /advanced operational reporting/);
for (const link of [header,mobile,footer]) assert.match(link, /#smart-workflows/);
assert.match(experience, /\{t\(feature.title\)\}/, 'Feature card titles must respect marketing locale');
assert.match(experience, /\{features.length\}/, 'Feature count must stay in sync');
assert.match(experience, /Can an Action depend on another Action\?/);
assert.match(experience, /Are advanced reports based on actual history\?/);
assert.match(experience, /No automatic stage movement|Smart Dependencies links prerequisite Actions/);
assert.match(intelligence, /data-marketing-dependency-demo/);
assert.match(intelligence, /data-marketing-reporting-demo/);
assert.match(intelligence, /setReviewDone\(done => !done\)/);
assert.match(intelligence, /setPeriod\(Number|setPeriod\(days\)/);
assert.match(intelligence, /role="tabpanel"/);
assert.match(intelligence, /role="tablist"/);
assert.match(intelligence, /ArrowRight/);
assert.match(intelligence, /KeyboardEvent<HTMLButtonElement>/);
assert.match(intelligence, /tickLabel\(bucket.label, index\)/,'Week/day labels must respect Turkish locale');
assert.match(intelligence, /Invented sample|invented sample/);
assert.doesNotMatch(intelligence, /fetch\(|localStorage|supabase|api\/tasks|createTask/);
assert.doesNotMatch(intelligence, /testimonials|customers agree|users served/i);
assert.match(turkishPage,/görev bağımlılıklarını/);
assert.match(turkishPage,/gelişmiş raporlamayı/);
assert.match(header,/\{t\('Start free'\)\}/,'Header CTA must not remain untranslated');
checks+=27;

const featureSource=experience.split('const features = [')[1]?.split('] as const;')[0] ?? '';
const featureLabels=[...featureSource.matchAll(/(?:title|description|eyebrow): '([^']+)'|tags: \[([^\]]+)\]/g)]
  .flatMap(match => match[1] ? [match[1]] : [...match[2].matchAll(/'([^']+)'/g)].map(item => item[1]));
assert.equal([...featureSource.matchAll(/no: '\d\d'/g)].length,14,'Marketing feature grid should present 14 confirmed areas');
for(const label of featureLabels) assert.ok(hasTurkishMarketingCopy(label),'Feature grid has untranslated Turkish string: '+label);
checks+=featureLabels.length+1;
for(const label of [
  'Smart workflows','Smart Dependencies','Advanced Reporting','Complete the review',
  'Reopen the review','See what got done.','Know what comes next.',
  'Can an Action depend on another Action?','Are advanced reports based on actual history?',
  'Interactive illustration · no account required','Historical completions use verified completion dates. This sample is not live analytics.',
]) {
  assert.ok(hasTurkishMarketingCopy(label),'Missing Turkish demo copy: '+label);
  checks++;
}

assert.match(metadata,/Everything moves together/);
assert.match(metadata,/canonical: '\/marketing'/);
assert.match(footer,/\/privacy/);
assert.match(footer,/\/refunds/);
assert.match(footer,/\/terms/);
assert.equal(vercel.git.deploymentEnabled,false,'Manual-only deployment setting MUST be preserved');
checks+=10;

console.log(JSON.stringify({marketingChecks:checks,
  includesAllCurrentProductSurfaces:true,
  exactPlanCatalog:true,
  interactiveDemoWithoutFakeCustomerProof:true,
  manualVercelDeploysPreserved:true}));
