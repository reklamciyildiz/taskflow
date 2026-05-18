'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Palette, Moon, LayoutList } from 'lucide-react';
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
        <h1 className="text-xl font-semibold">Appearance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize how Axiom looks and feels.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4" />
            Display
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Moon className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium">Dark mode</Label>
                <p className="text-xs text-muted-foreground">Switch between light and dark themes</p>
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
                <Label className="text-sm font-medium">Compact view</Label>
                <p className="text-xs text-muted-foreground">Reduce spacing in list and board views</p>
              </div>
            </div>
            <Switch checked={compactView} onCheckedChange={handleCompactView} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
