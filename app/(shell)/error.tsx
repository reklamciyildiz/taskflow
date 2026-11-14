'use client';

import {useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {AlertTriangle,RefreshCw} from 'lucide-react';

/** Unexpected app-shell render failures. Reports only a bounded digest, not user data. */
export default function AppShellError({error,reset}:{
  error:Error&{digest?:string};reset:()=>void;
}){
  useEffect(()=>{
    void fetch('/api/monitoring/client-error',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code:'CLIENT_RENDER_FAILURE',scope:'shell',
        ...(typeof error.digest==='string'&&/^[\w-]{1,64}$/.test(error.digest)?{digest:error.digest}:{})}),
      credentials:'same-origin',cache:'no-store',
    }).catch(()=>undefined);
  },[error]);

  return <main role="alert" className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center gap-4 px-5 text-center">
    <span className="rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4 text-amber-600">
      <AlertTriangle className="h-7 w-7" aria-hidden="true"/>
    </span>
    <h1 className="text-xl font-semibold">This page could not be displayed</h1>
    <p className="text-sm leading-6 text-muted-foreground">
      Your saved work has not been deleted. Try loading this screen again.
      If the problem persists, contact Actiproc support.
    </p>
    <Button type="button" onClick={reset} className="gap-2">
      <RefreshCw className="h-4 w-4"/> Try again
    </Button>
  </main>;
}
