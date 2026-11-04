import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { AxiomAIChatView } from '../../components/ai/AxiomAIChat';

declare global {
  interface Window { qa: { opened: string[]; refreshed: number } }
}
window.qa = { opened: [], refreshed: 0 };

function Fixture() {
  return (
    <main className="min-h-screen w-full bg-background p-2 text-foreground sm:p-4">
      <AxiomAIChatView
        enabled
        request={fetch}
        openTaskEditor={(taskId) => window.qa.opened.push(taskId)}
        refreshData={async () => { window.qa.refreshed += 1; }}
      />
      <Toaster richColors/>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture/>);
