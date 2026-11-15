import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APP_LOCALES,APP_INTL_LOCALE,isAppLocale,formatAppDate,formatAppNumber,formatAppCurrency} from '../lib/i18n/app-locale';
import {translateApp,trCatalog,hasTurkishAppTranslation} from '../lib/i18n/catalog';
import {instantiateProcessTemplate} from '../lib/process-template-catalog';

const read=(path:string)=>readFileSync(path,'utf8');
assert.deepEqual(APP_LOCALES,['en','tr']);
assert.equal(isAppLocale('tr'),true);
assert.equal(isAppLocale('de'),false);
assert.equal(APP_INTL_LOCALE.tr,'tr-TR');
assert.equal(translateApp('tr','Dashboard'),'Panel');
assert.equal(translateApp('en','Dashboard'),'Dashboard');
assert.equal(translateApp('tr','unknown customer document'),'unknown customer document');
assert.equal(translateApp('tr','Total: {count}',{count:42}),'Total: 42');
assert.equal(formatAppNumber('tr',1234.56),'1.234,56');
assert.equal(instantiateProcessTemplate('simple','tr')[0].title,'Yapılacak');
assert.equal(instantiateProcessTemplate('simple','en')[0].title,'To Do');
assert.equal(instantiateProcessTemplate('product-launch','tr').at(-1)?.title,'Yayınlandı');
assert.match(formatAppCurrency('tr',12,'USD'),/12/);
assert.match(formatAppDate('tr',new Date('2026-11-15T00:00:00Z'),{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}),/Kasım/i);
assert.ok(Object.keys(trCatalog).length>=700);
for(const [key,value] of Object.entries(trCatalog)){
  assert.ok(key.trim()&&value.trim(),'Empty translation key/value');
  assert.ok(!/[\r\n]/.test(key),'Key must not include line breaks');
}
const keyPaths=[
'components/Header.tsx','components/Sidebar.tsx','components/UserMenu.tsx',
'components/settings/SettingsNav.tsx','app/(shell)/settings/appearance/page.tsx',
'components/CreateTaskModal.tsx','components/CreateProjectModal.tsx',
'components/TaskBoard.tsx','components/TaskList.tsx',
'components/Analytics.tsx','components/Achievements.tsx',
'components/NotificationBell.tsx','components/search/GlobalCommandPalette.tsx',
'components/settings/CalendarSettings.tsx','components/settings/NotificationsSettings.tsx',
'components/onboarding/FirstSuccessJourney.tsx','components/billing/BillingClient.tsx',
'components/billing/AIUsageBillingCard.tsx','components/TeamMembers.tsx',
'components/TaskCard.tsx','components/Customers.tsx','components/Profile.tsx',
'components/knowledge/KnowledgeHubWorkspace.tsx',
'components/planner/PlannerV2View.tsx','components/planner/PlannerQuickAdd.tsx',
'components/dashboard/DashboardV2.tsx','components/dashboard/DashboardCapture.tsx',
'app/(shell)/integrations/IntegrationsClient.tsx','app/(shell)/settings/members/page.tsx',
'mobile/src/App.tsx','mobile/src/MobileMoreView.tsx','mobile/src/MobileSettingsView.tsx',
'mobile/src/MobileKnowledgeHub.tsx','mobile/src/MobileListView.tsx',
'app/(shell)/team/page.tsx','app/(shell)/settings/account/page.tsx',
'app/(shell)/settings/workspace/page.tsx','components/ActionPanel.tsx',
];
let checkedUiMessages=0;
for(const path of keyPaths){
  const code=read(path);
  assert.match(code,/AppLocaleProvider|useAppLocale|AppLanguageSwitcher/,path+' must use centralized localization');
  // Both aliases exist: <T/> and <AppT/>. Audit t('literal') as well.
  const literalUiMessages=[
    ...Array.from(code.matchAll(/<(?:AppT|T)\b[^>]*?\btext=(["'])(.*?)\1/g),match=>match[2]),
    ...Array.from(code.matchAll(/\bt\(\s*(["'])(.*?)\1/g),match=>match[2]),
  ];
  for(const message of literalUiMessages){
    assert.equal(hasTurkishAppTranslation(message),true,path+': missing Turkish UI translation: '+message);
    checkedUiMessages++;
  }
  if(code.includes("'use client';"))assert.ok(code.indexOf("'use client';")<code.indexOf("import "),
    path+' client directive must precede imports');
}
assert.ok(checkedUiMessages>=250,'Localization audit must cover all critical interface texts');
// Guard against regressions seen during manual Turkish-language QA.
// Navigation is not enough: body copy, dashboard headings and action controls
// must be locale-bound. User-entered names and descriptions are exempt.
const screenshotRegressions=[
  ['components/TaskCard.tsx',/>Completed Action</],
  ['components/TaskCard.tsx',/task\.priority\.toUpperCase\(\)/],
  ['components/planner/PlannerQuickAdd.tsx',/>Quick capture</],
  ['components/dashboard/DashboardCapture.tsx',/>Quick Capture</],
  ['components/knowledge/KnowledgeHubWorkspace.tsx',/>Ask Actiproc AI</],
  ['app/(shell)/integrations/IntegrationsClient.tsx',/>Create Webhook</],
  ['components/settings/NotificationsSettings.tsx',/>Notification channels</],
  ['components/settings/CalendarSettings.tsx',/>Refresh calendars</],
  ['components/settings/OrganizationSettings.tsx',/>Save labels</],
  ['components/billing/AIUsageBillingCard.tsx',/>Actiproc AI allowance</],
] as const;
for(const [path,legacyLiteral] of screenshotRegressions){
  assert.doesNotMatch(read(path),legacyLiteral,path+' reintroduced unlocalized UI text');
}

// The two native menus store labels as data, so t(title) alone cannot
// prove every visible entry has a Turkish translation.
for(const path of ['mobile/src/MobileMoreView.tsx','mobile/src/MobileSettingsView.tsx']){
  const source=read(path);
  for(const match of source.matchAll(/(?:title|detail):\s*'([^']+)'/g)){
    assert.ok(hasTurkishAppTranslation(match[1]),path+': missing native menu localization: '+match[1]);
  }
}
const provider=read('components/i18n/AppLocaleProvider.tsx');
assert.match(provider,/fetch\('\/api\/users\/settings'/);
assert.match(provider,/method:'PATCH'/);
assert.match(provider,/localStorage\.setItem/);
assert.match(provider,/document\.documentElement\.lang=locale/);
assert.doesNotMatch(provider,/MutationObserver|innerHTML|textContent\s*=/);
assert.match(read('components/ShellProviders.tsx'),/<AppLocaleProvider>/);
assert.match(read('mobile/src/main.tsx'),/<SessionProvider><AppLocaleProvider><App/);
assert.match(read('mobile/src/MobileSettingsView.tsx'),/<AppLanguageSwitcher\s*\/>/);
const api=read('app/api/users/settings/route.ts');
assert.match(api,/key === 'locale'/);
assert.match(api,/value === 'en' \|\| value === 'tr'/);
assert.match(api,/requireAuthedUser/);
const migration=read('supabase/migrations/20261115120000_user_interface_locale.sql');
assert.match(migration,/add column if not exists locale/);
assert.match(migration,/check \(locale in \('en', 'tr'\)\)/);
console.log('App i18n catalog, language formatting, persistence, shell and translation coverage contracts passed');
