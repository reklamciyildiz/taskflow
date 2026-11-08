'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTaskContext } from '@/components/TaskContext';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';
import { Shield, KeyRound } from 'lucide-react';

export default function SettingsAccountPage() {
  const { currentUser } = useTaskContext();
  const [showChangePassword, setShowChangePassword] = useState(false);

  if (!currentUser) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Security and authentication settings for your account.
        </p>
      </div>

      {/* Account status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Account status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium">Active</span>
          </div>
          <p className="text-xs text-muted-foreground">{currentUser.email}</p>
          <p className="text-xs text-muted-foreground">
            Member since {new Date().getFullYear()}
          </p>
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
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-muted-foreground">Change your account password</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowChangePassword(true)}>
              Change
            </Button>
          </div>

        </CardContent>
      </Card>

      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
    </div>
  );
}
