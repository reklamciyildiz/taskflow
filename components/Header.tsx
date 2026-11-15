'use client';

import {useEffect,useState} from 'react';
import {Menu,PanelLeftClose,PanelLeftOpen,Search,Plus,Command as CommandIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ThemeToggle} from '@/components/ThemeToggle';
import {UserMenu} from '@/components/UserMenu';
import {NotificationBell} from '@/components/NotificationBell';
import {CreateTaskModal} from '@/components/CreateTaskModal';
import {GlobalCommandPalette} from '@/components/search/GlobalCommandPalette';
import {useTaskContext} from '@/components/TaskContext';

interface HeaderProps {
  onSidebarToggle:()=>void;
  /** lg+: is the sidebar expanded (not collapsed) */
  desktopSidebarExpanded?:boolean;
}

export function Header({onSidebarToggle,desktopSidebarExpanded=true}:HeaderProps) {
  const [showCreateTask,setShowCreateTask]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const {currentUserRole}=useTaskContext();
  const canCreateAction=currentUserRole!=='viewer';

  // The palette is mounted in the shared authenticated app shell.
  // Do not hijack browser-native shortcuts on public/auth/marketing pages.
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      const modifier=event.ctrlKey||event.metaKey;
      if(modifier&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='k'){
        event.preventDefault();
        setSearchOpen(open=>!open);
        return;
      }
      if(modifier&&event.shiftKey&&!event.altKey&&event.key.toLowerCase()==='a'&&canCreateAction){
        const target=event.target as HTMLElement|null;
        const typing=target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName??'');
        if(typing||searchOpen||showCreateTask)return;
        event.preventDefault();
        setShowCreateTask(true);
      }
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[canCreateAction,searchOpen,showCreateTask]);

  return (
    <header className="actiproc-app-header sticky top-0 z-40 border-b bg-card/95 backdrop-blur-xl supports-[backdrop-filter]:bg-card/80">
      <div className="flex h-16 items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Button type="button" variant="ghost" size="sm" className="shrink-0 lg:hidden"
          onClick={onSidebarToggle} aria-label="Toggle navigation">
          <Menu className="h-5 w-5"/>
        </Button>
        <Button type="button" variant="ghost" size="sm"
          className="hidden shrink-0 text-muted-foreground hover:text-foreground lg:inline-flex"
          onClick={onSidebarToggle}
          aria-label={desktopSidebarExpanded?'Collapse sidebar':'Expand sidebar'}
          title={desktopSidebarExpanded?'Collapse sidebar':'Expand sidebar'}>
          {desktopSidebarExpanded?<PanelLeftClose className="h-5 w-5"/>:<PanelLeftOpen className="h-5 w-5"/>}
        </Button>

        <div className="max-w-md flex-1">
          <button type="button" aria-label="Search everything. Shortcut Control K or Command K"
            aria-keyshortcuts="Control+K Meta+K" onClick={()=>setSearchOpen(true)}
            className="actiproc-header-search group flex h-10 w-full items-center gap-3 rounded-xl border border-input bg-background/70 px-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true"/>
            <span className="min-w-0 flex-1 truncate text-[13px]">Search everything...</span>
            <span className="hidden items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-1 text-[10px] font-semibold text-muted-foreground sm:inline-flex">
              <CommandIcon className="h-3 w-3" aria-hidden="true"/> K
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {canCreateAction&&<>
            <Button type="button" size="sm" onClick={()=>setShowCreateTask(true)}
              className="hidden rounded-xl bg-primary font-semibold text-primary-foreground shadow-[0_8px_20px_-14px_hsl(var(--primary)/0.65)] hover:bg-primary/90 sm:flex">
              <Plus className="mr-2 h-4 w-4"/> Add Action
            </Button>
            <Button type="button" size="sm" aria-label="Add Action" onClick={()=>setShowCreateTask(true)}
              className="rounded-xl bg-primary p-2 font-semibold text-primary-foreground hover:bg-primary/90 sm:hidden">
              <Plus className="h-4 w-4"/>
            </Button>
          </>}
          <NotificationBell/>
          <ThemeToggle/>
          <UserMenu/>
        </div>
      </div>
      <GlobalCommandPalette open={searchOpen} onOpenChange={setSearchOpen}
        onCreateAction={()=>setShowCreateTask(true)}/>
      <CreateTaskModal open={showCreateTask} onClose={()=>setShowCreateTask(false)}/>
    </header>
  );
}
