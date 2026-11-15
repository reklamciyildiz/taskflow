'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {
  ArrowRight,BookOpen,Building2,CheckSquare2,FileText,FolderKanban,
  Home,Keyboard,Loader2,Plus,Search,Settings,Users,Workflow
} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {
  Command,CommandGroup,CommandInput,CommandItem,CommandList,CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {useTaskContext} from '@/components/TaskContext';
import type {GlobalSearchResult,SearchKind} from '@/lib/search/global-search';
import {normalizeSearchText} from '@/lib/search/global-search';

const GROUPS:Array<{kind:SearchKind;label:string;icon:typeof Search}>=[
  {kind:'action',label:'Actions',icon:CheckSquare2},
  {kind:'process',label:'Processes',icon:FolderKanban},
  {kind:'note',label:'Notes',icon:FileText},
  {kind:'checklist',label:'Checklists',icon:BookOpen},
  {kind:'team',label:'Teams',icon:Users},
  {kind:'customer',label:'Customers',icon:Building2},
];
type QuickAction={id:string;title:string;subtitle:string;shortcut?:string;icon:typeof Search;path?:string;task?:boolean};
const QUICK_ACTIONS:readonly QuickAction[]=[
  {id:'new-action',title:'Create Action',subtitle:'Capture a task in the current workspace',shortcut:'Ctrl/⌘ + Shift + A',icon:Plus,task:true},
  {id:'process-center',title:'Process Center',subtitle:'Create and manage workflows',icon:Workflow,path:'/dashboard/processes'},
  {id:'dashboard',title:'Dashboard',subtitle:'Your daily overview',icon:Home,path:'/'},
  {id:'planner',title:'Planner',subtitle:'Review today and upcoming work',icon:BookOpen,path:'/planner'},
  {id:'knowledge',title:'Knowledge Hub',subtitle:'Browse notes and decisions',icon:FileText,path:'/dashboard/knowledge-hub'},
  {id:'customers',title:'Customers',subtitle:'Find your customer directory',icon:Building2,path:'/customers'},
  {id:'settings',title:'Settings',subtitle:'Account and workspace preferences',icon:Settings,path:'/settings'},
];

export function GlobalCommandPalette({open,onOpenChange,onCreateAction}:{
  open:boolean;onOpenChange:(next:boolean)=>void;onCreateAction:()=>void;
}){
  const router=useRouter();
  const {currentTeam,setCurrentTeam,currentUserRole}=useTaskContext();
  const [query,setQuery]=useState('');
  const [scope,setScope]=useState<'all'|'team'>('all');
  const [results,setResults]=useState<GlobalSearchResult[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [partial,setPartial]=useState(false);
  const requestRef=useRef(0);

  useEffect(()=>{
    if(open)return;
    requestRef.current+=1;
    setQuery('');setResults([]);setLoading(false);setError(null);setPartial(false);
  },[open]);

  useEffect(()=>{
    const number=++requestRef.current;
    if(!open||query.trim().length<2){setResults([]);setLoading(false);setError(null);setPartial(false);return;}
    const controller=new AbortController();
    setLoading(true);setError(null);
    const timer=window.setTimeout(async()=>{
      try{
        const qs=new URLSearchParams({q:query.trim()});
        if(scope==='team'&&currentTeam?.id)qs.set('teamId',currentTeam.id);
        const response=await fetch('/api/search?'+qs.toString(),{
          signal:controller.signal,credentials:'same-origin',cache:'no-store'
        });
        if(!response.ok)throw new Error(response.status===403?'Search is not permitted for this team.':'Search is temporarily unavailable.');
        const payload=await response.json() as {
          success?:boolean;data?:GlobalSearchResult[];partial?:boolean;
        };
        if(number!==requestRef.current||controller.signal.aborted)return;
        if(!payload.success||!Array.isArray(payload.data))throw new Error('Search is temporarily unavailable.');
        setResults(payload.data);setPartial(Boolean(payload.partial));
      }catch(err){
        if(controller.signal.aborted||number!==requestRef.current)return;
        setResults([]);setError(err instanceof Error?err.message:'Search failed');
      }finally{
        if(number===requestRef.current&&!controller.signal.aborted)setLoading(false);
      }
    },190);
    return ()=>{controller.abort();window.clearTimeout(timer);};
  },[open,query,scope,currentTeam?.id]);

  const filteredQuick=useMemo(()=>{
    const needle=normalizeSearchText(query);
    return QUICK_ACTIONS.filter(action=>{
      if(action.task&&currentUserRole==='viewer')return false;
      return !needle||[action.title,action.subtitle].some(v=>normalizeSearchText(v).includes(needle));
    });
  },[query,currentUserRole]);

  const go=useCallback((item:GlobalSearchResult)=>{
    onOpenChange(false);
    if(item.kind==='team'&&item.teamId){
      setCurrentTeam(item.teamId);
      router.push('/team');
      return;
    }
    if(item.teamId&&currentTeam?.id!==item.teamId)setCurrentTeam(item.teamId);
    if(item.taskId){
      const qs=new URLSearchParams({task:item.taskId});
      if(item.checklistId)qs.set('checklist',item.checklistId);
      if(item.noteId)qs.set('note',item.noteId);
      router.push('/board?'+qs.toString());
    }else if(item.kind==='process'&&item.projectId){
      router.push('/board?project='+encodeURIComponent(item.projectId));
    }else if(item.kind==='customer'){
      router.push('/customers?customer='+encodeURIComponent(item.id));
    }
  },[onOpenChange,router,setCurrentTeam,currentTeam?.id]);

  const selectQuick=(action:QuickAction)=>{
    onOpenChange(false);
    if(action.task)onCreateAction();
    else if(action.path)router.push(action.path);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl overflow-hidden rounded-[22px] border bg-popover p-0 shadow-2xl sm:w-full">
      <DialogTitle className="sr-only">Search and commands</DialogTitle>
      <DialogDescription className="sr-only">Search your authorized workspace. Use arrow keys to select, Enter to open, Escape to close.</DialogDescription>
      <Command shouldFilter={false} loop className="rounded-[22px] bg-transparent">
        <div className="flex items-center gap-2 border-b px-4 pr-12">
          <CommandInput autoFocus value={query} onValueChange={setQuery}
            placeholder="Search Actions, notes, checklists, Processes..."
            className="h-14 flex-1 text-[15px] [&>input]:h-14 [&>input]:text-[15px]"/>
          {loading?<Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="Searching"/>:null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <div className="flex items-center gap-1 rounded-full border bg-muted/50 p-1" role="group" aria-label="Search team scope">
            {(['all','team'] as const).map(value=>
              <button key={value} type="button" aria-pressed={scope===value} onClick={()=>setScope(value)}
                disabled={value==='team'&&!currentTeam}
                className={'rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 '+
                  (scope===value?'bg-background text-foreground shadow-sm':'text-muted-foreground hover:text-foreground')}>
                {value==='all'?'All accessible teams':'Current team'}
              </button>)}
          </div>
          <span className="text-[11px] text-muted-foreground">{query.trim().length>=2?results.length+' matches':'Type at least 2 characters to search'}</span>
        </div>
        <CommandList className="max-h-[min(55dvh,460px)] min-h-[190px] overscroll-contain p-2">
          {error?<div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>:null}
          {!query.trim()&&<div className="px-3 py-3 text-xs text-muted-foreground">Navigate instantly or search across your authorized workspace.</div>}
          {query.trim().length>=2&&results.length===0&&!loading&&!error?
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No matches found. Try another name or keyword.</div>:null}
          {GROUPS.map(group=>{
            const matches=results.filter(item=>item.kind===group.kind);
            if(matches.length===0)return null;
            const Icon=group.icon;
            return <CommandGroup key={group.kind} heading={group.label}>
              {matches.map(item=><CommandItem key={item.kind+':'+item.id}
                value={item.kind+':'+item.id} onSelect={()=>go(item)}
                className="my-0.5 flex min-h-[51px] cursor-pointer gap-3 rounded-xl px-3 py-2.5 data-[selected=true]:bg-accent">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-muted/50 text-muted-foreground">
                  <Icon className="h-4 w-4" aria-hidden="true"/>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[13px] font-semibold">{item.title}</span>
                  {item.subtitle?<span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>:null}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true"/>
              </CommandItem>)}
            </CommandGroup>;
          })}
          {filteredQuick.length>0&&<><CommandSeparator/><CommandGroup heading={query?'Quick commands':'Quick navigation'}>
            {filteredQuick.map(action=>{
              const Icon=action.icon;
              return <CommandItem key={action.id} value={'quick:'+action.id} onSelect={()=>selectQuick(action)}
                className="my-0.5 flex min-h-10 cursor-pointer gap-3 rounded-xl px-3">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true"/>
                <span className="min-w-0 flex-1 truncate text-sm">{action.title}</span>
                {action.shortcut?<CommandShortcut>{action.shortcut}</CommandShortcut>:null}
              </CommandItem>;
            })}
          </CommandGroup></>}
          {partial?<p className="px-4 py-3 text-xs leading-5 text-muted-foreground">Large workspace: deep note and checklist content is searched within a recent-content window. Refine your search for more precise results.</p>:null}
        </CommandList>
        <div className="flex items-center justify-between gap-4 border-t bg-muted/25 px-4 py-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-2"><Keyboard className="h-3.5 w-3.5"/> <kbd>↑↓</kbd> navigate <kbd>↵</kbd> open</span>
          <span><kbd>Esc</kbd> close <span className="mx-1.5 opacity-40">·</span> <kbd>⌘/Ctrl K</kbd></span>
        </div>
      </Command>
    </DialogContent>
  </Dialog>;
}
