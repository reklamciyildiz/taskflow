'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Palette, Moon, LayoutList, Languages } from 'lucide-react';
import {useAppLocale} from '@/components/i18n/AppLocaleProvider';
import {AppLanguageSwitcher} from '@/components/i18n/AppLanguageSwitcher';
import {T} from '@/components/i18n/AppLocaleProvider';
import { useTheme } from 'next-themes';

async function saveSetting(key: string, value: boolean) {
  const saved = localStorage.getItem('taskflow-settings');
  const settings = saved ? JSON.parse(saved) : {};
  settings[key] = value;
  localStorage.setItem('taskflow-settings', JSON.stringify(settings));
  try {
    await fetch('/api/users/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
  } catch { /* best-effort */ }
}

export default function SettingsAppearancePage() {
  const { theme, setTheme } = useTheme();
  const {t}=useAppLocale();
  const [mounted, setMounted] = useState(false);
  const [compactView, setCompactView] = useState(false);

  useEffect(() => {
    setMounted(true);
    const load = async () => {
      try {
        const res = await fetch('/api/users/settings');
        const data = await res.json();
        if (data.success && data.data) {
          const src = data.meta?.source as 'db' | 'default' | undefined;
          if (src === 'default') {
            const s = JSON.parse(localStorage.getItem('taskflow-settings') || '{}');
            setCompactView(s.compact_view ?? s.compactView ?? false);
            return;
          }
          setCompactView(data.data.compact_view ?? false);
        }
      } catch {
        const s = JSON.parse(localStorage.getItem('taskflow-settings') || '{}');
        setCompactView(s.compact_view ?? s.compactView ?? false);
      }
    };
    void load();
  }, []);

  const handleCompactView = (checked: boolean) => {
    setCompactView(checked);
    void saveSetting('compact_view', checked);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold"><T text="Appearance"/></h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <T text="Customize how Actiproc looks and feels."/>
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4" />
            <T text="Display"/>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Languages className="mt-1 h-5 w-5 text-primary" aria-hidden="true"/>
              <div>
                <p className="text-sm font-semibold"><T text="Application language"/></p>
                <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground"><T text="Choose the language used in navigation, settings, and system messages."/></p>
                <p className="mt-1 text-xs text-muted-foreground"><T text="Your own notes, task titles and descriptions will not be translated."/></p>
              </div>
            </div>
            <AppLanguageSwitcher/>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Moon className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium"><T text="Dark mode"/></Label>
                <p className="text-xs text-muted-foreground"><T text="Switch between light and dark themes"/></p>
              </div>
            </div>
            {mounted && (
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              />
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <LayoutList className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium"><T text="Compact view"/></Label>
                <p className="text-xs text-muted-foreground"><T text="Reduce spacing in list and board views"/></p>
              </div>
            </div>
            <Switch checked={compactView} onCheckedChange={handleCompactView} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
