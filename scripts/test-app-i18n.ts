import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APP_LOCALES,APP_INTL_LOCALE,isAppLocale,formatAppDate,formatAppNumber,formatAppCurrency} from '../lib/i18n/app-locale';
import {translateApp,trCatalog,hasTurkishAppTranslation} from '../lib/i18n/catalog';

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
];
for(const path of keyPaths){
  const code=read(path);
  assert.match(code,/AppLocaleProvider|useAppLocale|AppLanguageSwitcher/,path+' must use centralized localization');
  for(const match of code.matchAll(/<AppT text="([^"]+)"\s*\/>/g)){
    assert.equal(hasTurkishAppTranslation(match[1]),true,path+': missing translation: '+match[1]);
  }
  if(code.includes("'use client';"))assert.ok(code.indexOf("'use client';")<code.indexOf("import "),
    path+' client directive must precede imports');
}
const provider=read('components/i18n/AppLocaleProvider.tsx');
assert.match(provider,/fetch\('\/api\/users\/settings'/);
assert.match(provider,/method:'PATCH'/);
assert.match(provider,/localStorage\.setItem/);
assert.match(provider,/document\.documentElement\.lang=locale/);
assert.doesNotMatch(provider,/MutationObserver|innerHTML|textContent\s*=/);
assert.match(read('components/ShellProviders.tsx'),/<AppLocaleProvider>/);
const api=read('app/api/users/settings/route.ts');
assert.match(api,/key === 'locale'/);
assert.match(api,/value === 'en' \|\| value === 'tr'/);
assert.match(api,/requireAuthedUser/);
const migration=read('supabase/migrations/20261115120000_user_interface_locale.sql');
assert.match(migration,/add column if not exists locale/);
assert.match(migration,/check \(locale in \('en', 'tr'\)\)/);
console.log('App i18n catalog, language formatting, persistence, shell and translation coverage contracts passed');
