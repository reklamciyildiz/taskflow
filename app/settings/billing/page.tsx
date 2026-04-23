'use client';

import Link from 'next/link';
import { useTaskContext } from '@/components/TaskContext';
import { BillingClient } from '@/components/billing/BillingClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

export default function BillingPage() {
  const { currentUser, organizationId } = useTaskContext();
  const isAdmin = currentUser?.role === 'admin' || (currentUser?.role as string) === 'owner';

  if (!isAdmin || !organizationId) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-lg pt-8">
          <Button variant="ghost" size="sm" className="mb-6 gap-1 text-muted-foreground" asChild>
            <Link href="/settings">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to settings
            </Link>
          </Button>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldAlert className="h-5 w-5 text-amber-500" aria-hidden />
                Billing restricted
              </CardTitle>
              <CardDescription>Only organization owners and admins can manage billing.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/settings">Return to settings</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <BillingClient organizationId={organizationId} showBackLink />
    </div>
  );
}
