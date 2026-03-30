'use client';

import { createContext, useContext, useState } from 'react';

export type ViewType =
  | 'dashboard'
  | 'processes'
  | 'board'
  | 'list'
  | 'customers'
  | 'integrations'
  | 'analytics'
  | 'settings'
  | 'profile'
  | 'team'
  | 'achievements'
  | 'knowledge-hub';

interface ViewContextType {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
}

const ViewContext = createContext<ViewContextType | undefined>(undefined);

export function ViewProvider({ children }: { children: React.ReactNode }) {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');

  return (
    <ViewContext.Provider value={{ currentView, setCurrentView }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useView() {
  const context = useContext(ViewContext);
  if (context === undefined) {
    throw new Error('useView must be used within a ViewProvider');
  }
  return context;
}
