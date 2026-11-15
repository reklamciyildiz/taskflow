'use client';
import {T,useAppLocale} from '@/components/i18n/AppLocaleProvider';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTaskContext } from '@/components/TaskContext';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';
import { Shield, KeyRound } from 'lucide-react';

export default function SettingsAccountPage() {
  const {t}=useAppLocale();
  const { currentUser } = useTaskContext();
  const [showChangePassword, setShowChangePassword] = useState(false);

  if (!currentUser) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold"><T text="Account"/></h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <T text="Security and authentication settings for your account."/>
        </p>
      </div>

      {/* Account status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base"><T text="Account status"/></CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium"><T text="Active"/></span>
          </div>
          <p className="text-xs text-muted-foreground">{currentUser.email}</p>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium"><T text="Password"/></p>
                <p className="text-xs text-muted-foreground"><T text="Change your account password"/></p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowChangePassword(true)}>
              Change
            </Button>
          </div>

          <p className="rounded-xl border bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
            <T text="Actiproc does not currently offer built-in two-factor authentication or remote session revocation. For Google sign-in, manage account security in your Google Account. Password changes apply only to accounts with an Actiproc password."/>
          </p>
        </CardContent>
      </Card>

      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
    </div>
  );
}
