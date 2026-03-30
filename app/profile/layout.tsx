'use client';

import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { useView } from '@/components/ViewContext';
import { useEffect, useState } from 'react';

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('profile');
  }, [setCurrentView]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} onCloseSidebar={() => setIsSidebarOpen(false)} />
      <div className="flex-1 overflow-y-auto">
        <Header 
          onSidebarToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        />
        <main>
          {children}
        </main>
      </div>
    </div>
  );
}
