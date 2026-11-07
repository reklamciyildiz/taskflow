import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTIPROC_PLANS } from '../lib/billing-plans';
import { AI_PLAN_LIMITS } from '../lib/ai/ai-plan-catalog';

const read = (path: string) => readFileSync(path,'utf8');
const page = read('app/(marketing)/marketing/page.tsx');
const experience = read('components/marketing/MarketingExperience.tsx');
const preview = read('components/marketing/MarketingWorkspacePreview.tsx');
const audience = read('components/marketing/MarketingAudienceSwitch.tsx');
const header = read('components/marketing/MarketingHeader.tsx');
const mobile = read('components/marketing/MarketingMobileMenu.tsx');
const pricing = read('components/marketing/sections/MarketingPricing.tsx');
const footer = read('components/marketing/MarketingFooter.tsx');
const css = read('app/(marketing)/marketing.css');
const metadata = read('app/(marketing)/layout.tsx');
const vercel = JSON.parse(read('vercel.json'));

let checks = 0;
for (const name of ['MarketingHero','MarketingWorkflow','MarketingProductSystem',
  'MarketingConnectedWorkspace','MarketingIntegrations','MarketingPricing',
  'MarketingFinalCta','MarketingFAQ','MarketingFooter']) {
  assert.match(page, new RegExp('<' + name + '\\b'));
  checks++;
}
assert.match(page,/id="main-content"/);
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
assert.match(preview,/aria-label="Search the sample workspace"/);
assert.match(preview,/onClick=\{\(\)=>setPinned/);
assert.match(preview,/onClick=\{\(\)=>setView/);
assert.match(preview,/setMoved\(true\)/);
assert.match(preview,/setCreated\(!created\)/);
checks+=4;

assert.match(header,/MarketingMobileMenu/);
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
for(const mode of ["'solo'", "'team'", "'organization'"]) assert.ok(audience.includes(mode));
assert.match(audience,/role="tablist"/);
assert.match(audience,/aria-selected=\{selected === tab.key\}/);
assert.match(audience,/not live statistics/);
checks+=13;
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
