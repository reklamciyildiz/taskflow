'use client';

import { TaskBoard } from '@/components/TaskBoard';
import { TaskList } from '@/components/TaskList';
import { Customers } from '@/components/Customers';
import { Analytics } from '@/components/Analytics';
import { Settings } from '@/components/Settings';
import { Profile } from '@/components/Profile';
import { TeamMembers } from '@/components/TeamMembers';
import { Achievements } from '@/components/Achievements';
import { KnowledgeHubView } from '@/components/KnowledgeHubView';
import { DashboardInsights } from '@/components/DashboardInsights';
import { DashboardShell } from '@/components/DashboardShell';
import { FocusDashboard } from '@/components/FocusDashboard';
import dynamic from 'next/dynamic';

const Integrations = dynamic(() => import('@/app/(shell)/integrations/page'), { ssr: false });

import { useView, ViewType } from '@/components/ViewContext';

export function Dashboard() {
  const { currentView } = useView();

  const renderView = () => {
    const view = currentView as ViewType;
    switch (view) {
      case 'board':
        return (
          <>
            <TaskBoard />
          </>
        );
      case 'list':
        return <TaskList />;
      case 'knowledge-hub':
        return <KnowledgeHubView />;
      case 'customers':
        return <Customers />;
      case 'integrations':
        return <Integrations />;
      case 'analytics':
        return <Analytics />;
      case 'settings':
        return <Settings />;
      case 'profile':
        return <Profile />;
      case 'team':
        return <TeamMembers />;
      case 'achievements':
        return <Achievements />;
      default:
        return <TaskBoard />;
    }
  };

  return <DashboardShell>{renderView()}</DashboardShell>;
}