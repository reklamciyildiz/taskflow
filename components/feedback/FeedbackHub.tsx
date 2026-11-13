'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowRight,Check,ChevronUp,Clock3,Filter,HeartHandshake,Lightbulb,Loader2,MessageCircle,Plus,Search,Send,ShieldCheck,Sparkles,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Badge} from '@/components/ui/badge';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {useView} from '@/components/ViewContext';
import {
  FEEDBACK_AREAS,FEEDBACK_CATEGORIES,FEEDBACK_STATUSES,areaLabels,categoryLabels,statusLabels,
  type FeedbackPost,type FeedbackComment,type FeedbackArea,type FeedbackCategory,type FeedbackStatus,
  isOneOf
} from '@/lib/feedback/contract';

type Tab='ideas'|'mine'|'updates'|'admin';
type FeedData={posts:FeedbackPost[];hasMore:boolean;isStaff:boolean};
type UpdateItem={id:string;post_id:string;status:string;title:string;created_at:string;is_read:boolean};
type PendingPost={id:string;title:string;created_at:string;category:string;area:string};
type PendingComment={id:string;post_id:string;body:string;created_at:string};
type AdminData={posts:PendingPost[];comments:PendingComment[]};
type Detail={post:FeedbackPost;comments:FeedbackComment[]};
type FormState={title:string;description:string;category:FeedbackCategory;area:FeedbackArea};
const initialForm:FormState={title:'',description:'',category:'feature',area:'general'};
const sections:{key:Tab;label:string}[]=[
  {key:'ideas',label:'Tüm fikirler'}, {key:'mine',label:'Önerilerim'},
  {key:'updates',label:'Güncellemeler'}, {key:'admin',label:'Moderasyon'}
];
function readableDate(date:string){
  return new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short',year:'numeric'}).format(new Date(date));
}
async function requestJson<T=unknown>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{...options,cache:'no-store'});
  const payload=await response.json().catch(()=>({success:false,error:'Geçersiz sunucu yanıtı.'}));
  if(!response.ok||!payload.success)throw new Error(payload.error||'İşlem başarısız.');
  return payload.data as T;
}
function StatusTag({value}:{value:FeedbackStatus}){
  const style=value==='shipped'?'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300':
    value==='building'?'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300':
    value==='planned'?'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300':
    'border-border bg-muted text-muted-foreground';
  return <span className={'inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold '+style}>
    {statusLabels[value]}
  </span>;
}
export function FeedbackHub(){
  const {setCurrentView}=useView();
  const [tab,setTab]=useState<Tab>('ideas');
  const [staff,setStaff]=useState(false);
  const [posts,setPosts]=useState<FeedbackPost[]>([]);
  const [hasMore,setHasMore]=useState(false);
  const [page,setPage]=useState(0);
  const [qInput,setQInput]=useState('');
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('all');
  const [category,setCategory]=useState('all');
  const [sort,setSort]=useState<'popular'|'new'>('popular');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState<string|null>(null);
  const [createOpen,setCreateOpen]=useState(false);
  const [form,setForm]=useState<FormState>(initialForm);
  const [detail,setDetail]=useState<Detail|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [commentText,setCommentText]=useState('');
  const [updates,setUpdates]=useState<UpdateItem[]>([]);
  const [admin,setAdmin]=useState<AdminData>({posts:[],comments:[]});
  const [mergeTarget,setMergeTarget]=useState('');

  useEffect(()=>setCurrentView('feedback'),[setCurrentView]);
  useEffect(()=>{const timer=setTimeout(()=>setQuery(qInput.trim()),300);return()=>clearTimeout(timer);},[qInput]);
  useEffect(()=>{setPage(0);},[tab,query,status,category,sort]);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      if(tab==='updates'){
        setUpdates(await requestJson<UpdateItem[]>('/api/feedback/updates'));
      }else if(tab==='admin'){
        setAdmin(await requestJson<AdminData>('/api/feedback/moderate'));
      }else{
        const params=new URLSearchParams({scope:tab==='mine'?'mine':'all',sort,page:String(page)});
        if(query)params.set('q',query);
        if(status!=='all')params.set('status',status);
        if(category!=='all')params.set('category',category);
        const result=await requestJson<FeedData>('/api/feedback?'+params.toString());
        setPosts(result.posts);
        setHasMore(result.hasMore);
        setStaff(result.isStaff);
      }
    }catch(error){setNotice((error as Error).message);}
    finally{setLoading(false);}
  },[tab,page,query,status,category,sort]);
  useEffect(()=>{void load();},[load]);
  const unread=useMemo(()=>updates.filter(item=>!item.is_read).length,[updates]);

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(busy)return;
    setBusy(true);setNotice(null);
    try{
      await requestJson('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});
      setCreateOpen(false);setForm(initialForm);setTab('mine');setPage(0);
      setNotice('Önerin alındı. Moderasyon onayından sonra toplulukta yayınlanacak.');
      await load();
    }catch(error){setNotice((error as Error).message);}
    finally{setBusy(false);}
  };

  const openDetail=async(id:string)=>{
    setSelectedId(id);setDetail(null);setDetailLoading(true);setCommentText('');setMergeTarget('');
    try{setDetail(await requestJson<Detail>('/api/feedback/'+id));}
    catch(error){setNotice((error as Error).message);setSelectedId(null);}
    finally{setDetailLoading(false);}
  };
  const refreshDetail=async(id:string)=>{
    setDetail(await requestJson<Detail>('/api/feedback/'+id));
  };
  const toggleVote=async(post:FeedbackPost)=>{
    if(busy||post.moderation!=='approved')return;
    setBusy(true);
    try{
      const r=await requestJson<{my_vote:boolean;vote_count:number}>('/api/feedback/'+post.id+'/vote',{method:post.my_vote?'DELETE':'POST'});
      const update=(p:FeedbackPost)=>p.id===post.id?{...p,my_vote:r.my_vote,vote_count:r.vote_count}:p;
      setPosts(prev=>prev.map(update));
      setDetail(prev=>prev?{...prev,post:update(prev.post)}:prev);
    }catch(error){setNotice((error as Error).message);}
    finally{setBusy(false);}
  };
  const sendComment=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!detail||busy)return;
    setBusy(true);
    try{
      await requestJson('/api/feedback/'+detail.post.id+'/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:commentText})});
      setCommentText('');setNotice('Yorumun alındı ve inceleniyor.');
      await refreshDetail(detail.post.id);
    }catch(error){setNotice((error as Error).message);}
    finally{setBusy(false);}
  };
  const moderate=async(action:string,id:string,additional?:Record<string,string>)=>{
    if(busy)return;
    setBusy(true);
    try{
      await requestJson('/api/feedback/moderate',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,id,...additional})});
      setNotice('Değişiklik kaydedildi.');
      if(detail && (detail.post.id===id||action==='merge')) {
        if(action==='merge'){setSelectedId(null);setDetail(null);}
        else await refreshDetail(detail.post.id);
      }
      await load();
    }catch(error){setNotice((error as Error).message);}
    finally{setBusy(false);}
  };
  const markUpdates=async(id?:string)=>{
    try{
      await requestJson('/api/feedback/updates',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(id?{id}:{})});
      setUpdates(prev=>prev.map(u=>(!id||u.id===id)?{...u,is_read:true}:u));
    }catch(error){setNotice((error as Error).message);}
  };

  return <div className="mx-auto w-full max-w-[1320px] space-y-6 pb-16">
    <section className="relative overflow-hidden rounded-[28px] border border-emerald-900/30 bg-[#101e1c] px-5 py-8 text-white shadow-lg sm:px-9 sm:py-11">
      <div className="pointer-events-none absolute -right-12 -top-28 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl"/>
      <div className="pointer-events-none absolute bottom-[-160px] left-1/3 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl"/>
      <div className="relative z-10 max-w-2xl space-y-4">
        <div className="flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-emerald-100">
          <Sparkles className="h-3.5 w-3.5"/> Topluluk ve ürün gelişimi
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Fikirlerin Actiproc'u şekillendiriyor.</h1>
        <p className="max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
          Eksik gördüğün özellikleri paylaş, başkalarının fikirlerini destekle ve üzerinde çalıştığımız yenilikleri takip et.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button className="gap-2 bg-emerald-400 text-emerald-950 hover:bg-emerald-300" onClick={()=>{setNotice(null);setCreateOpen(true);}}>
            <Plus className="h-4 w-4"/> Fikir öner
          </Button>
          <span className="text-xs text-slate-400">Tüm planlarda ücretsiz</span>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-8 right-10 hidden rotate-[-9deg] rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur-md xl:block">
        <Lightbulb className="h-16 w-16 text-emerald-200/70"/>
      </div>
    </section>

    <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
      <main className="min-w-0 flex-1 space-y-4">
        <nav aria-label="Fikirler menüsü" className="flex gap-1 overflow-x-auto rounded-2xl border bg-card p-1.5">
          {sections.filter(s=>s.key!=='admin'||staff).map(s=>
            <button key={s.key} type="button" onClick={()=>{setTab(s.key);setNotice(null);}}
              aria-current={tab===s.key?'page':undefined}
              className={'whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors '+(tab===s.key?'bg-primary text-primary-foreground shadow-sm':'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              {s.label}{s.key==='updates'&&unread>0?<span className="ml-1.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] text-white">{unread}</span>:null}
            </button>
          )}
        </nav>
        {notice?<div role="status" className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">{notice}
          <button aria-label="Bildirimi kapat" className="ml-3 align-middle" onClick={()=>setNotice(null)}><X className="inline h-4 w-4"/></button>
        </div>:null}

        {(tab==='ideas'||tab==='mine')?<div className="space-y-3">
          <div className="flex flex-wrap gap-2 rounded-2xl border bg-card p-3">
            <div className="relative min-w-[170px] flex-[2]">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/>
              <Input aria-label="Fikir ara" value={qInput} onChange={e=>setQInput(e.target.value)} placeholder="Fikirlerde ara..." className="pl-9"/>
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Kategori filtrele" className="w-[156px]"><SelectValue placeholder="Kategoriler"/></SelectTrigger>
              <SelectContent><SelectItem value="all">Tüm kategoriler</SelectItem>
                {FEEDBACK_CATEGORIES.map(c=><SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Durum filtrele" className="w-[153px]"><SelectValue placeholder="Durumlar"/></SelectTrigger>
              <SelectContent><SelectItem value="all">Tüm durumlar</SelectItem>
                {FEEDBACK_STATUSES.map(s=><SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={s=>setSort(s as 'popular'|'new')}>
              <SelectTrigger aria-label="Sıralama" className="w-[139px]"><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="popular">En çok oy</SelectItem><SelectItem value="new">En yeni</SelectItem></SelectContent>
            </Select>
          </div>
          {loading?<div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Yükleniyor"/></div>:
           posts.length===0?<div className="rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
             <Lightbulb className="mx-auto mb-3 h-9 w-9 text-muted-foreground"/>
             <h2 className="font-semibold">Henüz uygun bir öneri yok</h2>
             <p className="mt-2 text-sm text-muted-foreground">İlk fikri sen paylaşabilirsin.</p>
             <Button variant="outline" className="mt-5 gap-2" onClick={()=>setCreateOpen(true)}><Plus className="h-4 w-4"/> Fikir paylaş</Button>
           </div>:
           <div className="space-y-3">{posts.map(post=><article key={post.id} className="flex gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/30 sm:gap-5 sm:p-5">
             <button type="button" aria-label={post.my_vote?'Oyunu geri al':'Bu öneriyi destekle'}
               disabled={busy||post.moderation!=='approved'}
               onClick={()=>void toggleVote(post)}
               className={'flex h-[70px] w-[55px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 '+(post.my_vote?'border-emerald-500/50 bg-emerald-500/10 text-emerald-600':'bg-muted/40 text-muted-foreground hover:border-primary/50 hover:text-primary')}>
               <ChevronUp className="h-5 w-5"/><span className="tabular-nums">{post.vote_count}</span>
             </button>
             <div className="min-w-0 flex-1 space-y-2.5">
               <div className="flex flex-wrap items-center gap-2">
                 <span className="text-xs font-medium text-muted-foreground">{categoryLabels[post.category]}</span>
                 <span className="text-xs text-muted-foreground">· {areaLabels[post.area]}</span>
                 {post.moderation==='pending'?<Badge variant="outline">Onay bekliyor</Badge>:null}
                 {post.moderation==='rejected'?<Badge variant="outline">Yayınlanmadı</Badge>:null}
                 {post.merged_into_id?<Badge variant="outline">Birleştirildi</Badge>:null}
               </div>
               <button type="button" onClick={()=>void openDetail(post.id)} className="block w-full text-left">
                 <h2 className="text-base font-semibold leading-snug tracking-tight hover:text-primary sm:text-lg">{post.title}</h2>
                 <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{post.description}</p>
               </button>
               <div className="flex flex-wrap items-center gap-3">
                 <StatusTag value={post.status}/>
                 <span className="flex items-center gap-1 text-xs text-muted-foreground"><MessageCircle className="h-3.5 w-3.5"/>{post.comment_count} yorum</span>
                 <span className="text-xs text-muted-foreground">{readableDate(post.created_at)}</span>
               </div>
             </div>
             <button type="button" onClick={()=>void openDetail(post.id)} aria-label="Fikir detayını aç" className="self-center rounded-lg p-1 text-muted-foreground hover:bg-muted"><ArrowRight className="h-5 w-5"/></button>
           </article>)}</div>}
          {!loading&&posts.length>0?<div className="flex items-center justify-between pt-2">
            <Button variant="outline" disabled={page===0} onClick={()=>setPage(n=>Math.max(0,n-1))}>Önceki</Button>
            <span className="text-xs text-muted-foreground">Sayfa {page+1}</span>
            <Button variant="outline" disabled={!hasMore} onClick={()=>setPage(n=>n+1)}>Sonraki</Button>
          </div>:null}
        </div>:null}

        {tab==='updates'?<section className="space-y-3">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Desteklediğin fikirlerde neler oldu?</h2>
            <Button variant="outline" size="sm" disabled={!updates.some(u=>!u.is_read)} onClick={()=>void markUpdates()}>Tümünü okundu işaretle</Button></div>
          {loading?<p className="py-8 text-sm text-muted-foreground">Güncellemeler yükleniyor...</p>:
          updates.length===0?<p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Henüz durum güncellemesi yok. İlgilendiğin önerilere oy vererek takip edebilirsin.</p>:
          updates.map(u=><button key={u.id} type="button" onClick={()=>{void markUpdates(u.id);void openDetail(u.post_id);}}
            className={'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors hover:border-primary/30 '+(u.is_read?'bg-card':'bg-primary/5')}>
            <span className="mt-1 rounded-full bg-primary/10 p-2"><Check className="h-4 w-4 text-primary"/></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm">{u.title}</strong>
              <span className="mt-1 block text-sm text-muted-foreground">
                Yeni durum: {isOneOf(u.status,FEEDBACK_STATUSES)?statusLabels[u.status]:'Güncellendi'}
              </span><span className="mt-2 block text-xs text-muted-foreground">{readableDate(u.created_at)}</span></span>
            {!u.is_read?<span className="mt-2 h-2 w-2 rounded-full bg-primary"/>:null}
          </button>)}
        </section>:null}

        {tab==='admin'&&staff?<section className="space-y-5">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/><h2 className="text-lg font-semibold">Platform moderasyonu</h2></div>
          <p className="text-sm text-muted-foreground">Yalnızca sunucuda izin verilen Actiproc yöneticileri burada işlem yapabilir.</p>
          {loading?<p className="py-8 text-sm text-muted-foreground">İnceleme kuyruğu yükleniyor...</p>:<>
          <h3 className="font-semibold">Öneriler · {admin.posts.length}</h3>
          {admin.posts.length===0?<p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Bekleyen öneri yok.</p>:
            admin.posts.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <button className="min-w-0 flex-1 text-left text-sm font-medium hover:text-primary" onClick={()=>void openDetail(p.id)}>{p.title}
                <span className="mt-1 block text-xs font-normal text-muted-foreground">{readableDate(p.created_at)} · {p.area}</span>
              </button>
              <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>void moderate('reject-post',p.id)}>Reddet</Button>
                <Button size="sm" disabled={busy} onClick={()=>void moderate('approve-post',p.id)}>Yayınla</Button></div>
            </div>)}
          <h3 className="pt-2 font-semibold">Yorumlar · {admin.comments.length}</h3>
          {admin.comments.length===0?<p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Bekleyen yorum yok.</p>:
            admin.comments.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="min-w-0 flex-1 text-sm"><p className="whitespace-pre-wrap break-words">{c.body}</p><span className="mt-2 block text-xs text-muted-foreground">{readableDate(c.created_at)}</span></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>void moderate('reject-comment',c.id)}>Reddet</Button>
                <Button size="sm" disabled={busy} onClick={()=>void moderate('approve-comment',c.id)}>Yayınla</Button></div>
            </div>)}
          </>}
        </section>:null}
      </main>

      <aside className="w-full space-y-4 xl:w-[280px] xl:shrink-0">
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2"><HeartHandshake className="h-4 w-4 text-primary"/><h2 className="font-semibold">Nasıl çalışır?</h2></div>
          <div className="space-y-4 text-sm">
            {[
              ['01','Fikrini paylaş','İhtiyacı ve çözmesini istediğin sorunu anlat.'],
              ['02','Topluluk desteklesin','Diğer kullanıcılar tek oyla önceliğini gösterebilir.'],
              ['03','Gelişmeleri takip et','Yayınlanan karar ve gelişmelerden haberdar ol.']
            ].map(s=><div key={s[0]} className="flex gap-3"><span className="text-xs font-bold text-primary">{s[0]}</span>
              <div><strong className="block text-sm">{s[1]}</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">{s[2]}</p></div></div>)}
          </div>
        </div>
        <div className="rounded-2xl border bg-muted/40 p-5">
          <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-muted-foreground"/><strong className="text-sm">Şeffaf önceliklendirme</strong></div>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">Oylar önemlidir ama teslim sözü değildir. Güvenlik, iş etkisi, kullanım sıklığı ve geliştirme maliyeti de değerlendirilir.</p>
        </div>
        <div className="rounded-2xl border bg-card p-5 text-xs leading-6 text-muted-foreground">
          Müşteri bilgileri, parolalar veya özel çalışma alanı içeriklerini burada paylaşma. Öneriler onaylandıktan sonra bütün Actiproc kullanıcılarına görünür.
        </div>
      </aside>
    </div>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-primary"/> Yeni fikir paylaş</DialogTitle>
          <DialogDescription>Önerini açıkça anlat. Gönderdikten sonra toplulukta yayınlanmadan önce incelenir.</DialogDescription></DialogHeader>
        <form onSubmit={e=>void submit(e)} className="space-y-4">
          <div className="space-y-1.5"><label htmlFor="feedback-title" className="text-sm font-medium">Fikrinin başlığı</label>
            <Input id="feedback-title" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
              minLength={8} maxLength={140} required placeholder="Örn. Tekrarlayan Action otomasyonları"/></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="feedback-category">Öneri türü</label>
              <Select value={form.category} onValueChange={value=>setForm(f=>({...f,category:value as FeedbackCategory}))}>
                <SelectTrigger id="feedback-category"><SelectValue/></SelectTrigger>
                <SelectContent>{FEEDBACK_CATEGORIES.map(c=><SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="feedback-area">Ürün alanı</label>
              <Select value={form.area} onValueChange={value=>setForm(f=>({...f,area:value as FeedbackArea}))}>
                <SelectTrigger id="feedback-area"><SelectValue/></SelectTrigger>
                <SelectContent>{FEEDBACK_AREAS.map(a=><SelectItem key={a} value={a}>{areaLabels[a]}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          <div className="space-y-1.5"><label htmlFor="feedback-description" className="text-sm font-medium">Hangi sorunu çözmeli?</label>
            <Textarea id="feedback-description" rows={6} value={form.description}
              minLength={20} maxLength={4000} required
              onChange={e=>setForm(f=>({...f,description:e.target.value}))}
              placeholder="Şu anda ne yapmak zor? Nasıl çalışmasını isterdin?"/></div>
          <p className="text-xs text-muted-foreground">Hassas şirket veya kişisel bilgileri paylaşma. Günlük en fazla 5 öneri gönderilebilir.</p>
          <DialogFooter><Button type="button" variant="outline" onClick={()=>setCreateOpen(false)}>Vazgeç</Button>
            <Button type="submit" disabled={busy||form.title.trim().length<8||form.description.trim().length<20} className="gap-2">
              {busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>} Öneriyi gönder</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(selectedId)} onOpenChange={open=>{if(!open){setSelectedId(null);setDetail(null);}}}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {detailLoading||!detail?<div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>:<>
          <DialogHeader>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{categoryLabels[detail.post.category]}</Badge>
              <Badge variant="secondary">{areaLabels[detail.post.area]}</Badge>
              <StatusTag value={detail.post.status}/>
              {detail.post.moderation!=='approved'?<Badge variant="outline">{detail.post.moderation==='pending'?'Onay bekliyor':'Yayınlanmadı'}</Badge>:null}
            </div>
            <DialogTitle className="pr-5 text-xl leading-snug">{detail.post.title}</DialogTitle>
            <DialogDescription>{readableDate(detail.post.created_at)} · Actiproc topluluğu</DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm leading-7">{detail.post.description}</p>
          {detail.post.merged_into_id?<Button variant="outline" onClick={()=>void openDetail(detail.post.merged_into_id!)}>Birleştirilen öneriyi görüntüle <ArrowRight className="ml-2 h-4 w-4"/></Button>:null}
          <div className="flex items-center gap-3 border-y py-3">
            <Button variant={detail.post.my_vote?'default':'outline'} disabled={busy||detail.post.moderation!=='approved'||Boolean(detail.post.merged_into_id)}
              className="gap-2" onClick={()=>void toggleVote(detail.post)}>
              <ChevronUp className="h-4 w-4"/>{detail.post.my_vote?'Destekliyorsun':'Destekle'} · {detail.post.vote_count}
            </Button>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><MessageCircle className="h-4 w-4"/>{detail.post.comment_count} yorum</span>
          </div>
          {staff&&detail.post.moderation==='approved'&&!detail.post.merged_into_id?<div className="space-y-3 rounded-xl border border-dashed bg-muted/30 p-4">
            <strong className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4"/> Platform yönetimi</strong>
            <div className="flex flex-wrap gap-2">{FEEDBACK_STATUSES.map(s=><Button key={s} size="sm" variant={s===detail.post.status?'default':'outline'} disabled={busy||s===detail.post.status}
              onClick={()=>void moderate('status',detail.post.id,{status:s})}>{statusLabels[s]}</Button>)}</div>
            <div className="flex gap-2"><Input aria-label="Birleştirme hedefi öneri UUID" placeholder="Birleştirilecek hedef fikir UUID" value={mergeTarget} onChange={e=>setMergeTarget(e.target.value)}/>
              <Button variant="outline" disabled={busy||!mergeTarget} onClick={()=>void moderate('merge',detail.post.id,{targetId:mergeTarget})}>Birleştir</Button></div>
          </div>:null}
          <section className="space-y-4">
            <h3 className="font-semibold">Yorumlar</h3>
            {detail.comments.length===0?<p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">Henüz yayınlanan yorum yok.</p>:
              detail.comments.map(c=><article key={c.id} className="rounded-xl border p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{c.is_mine?'Sen':'Topluluk üyesi'}</span>
                  <span className="text-xs text-muted-foreground">{readableDate(c.created_at)}</span></div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{c.body}</p>
                {c.moderation!=='approved'?<p className="mt-2 text-xs text-muted-foreground">{c.moderation==='pending'?'Yorum incelemede':'Yorum yayınlanmadı'}</p>:null}
              </article>)}
            {detail.post.moderation==='approved'&&!detail.post.merged_into_id?<form onSubmit={e=>void sendComment(e)} className="space-y-2">
              <label htmlFor="feedback-comment" className="text-sm font-medium">Yorum ekle</label>
              <Textarea id="feedback-comment" minLength={2} maxLength={1200} rows={3} required
                value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder="Bu fikir hakkında ne düşünüyorsun?"/>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Yorumlar yayından önce incelenir.</span>
                <Button type="submit" size="sm" disabled={busy||commentText.trim().length<2} className="gap-2">
                  <Send className="h-4 w-4"/> Yorum gönder
                </Button></div>
            </form>:null}
          </section>
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}
