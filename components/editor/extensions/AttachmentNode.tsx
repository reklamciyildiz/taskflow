/* eslint-disable @next/next/no-img-element -- Signed private image URLs must never enter a shared Next.js image cache. */
import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { AlignCenter, AlignLeft, AlignRight, FileText, GripVertical, Image as ImageIcon, LayoutGrid, Maximize2, RotateCcw, Trash2 } from 'lucide-react';
import { useAttachments, useAttachmentUrl } from '@/components/attachments/AttachmentProvider';
import {
  formatMediaSize, normalizeMediaAlign, normalizeMediaLayout,
  normalizeMediaWidth, type MediaAlign, type MediaWidth,
} from '@/lib/media-presentation';
import { cn } from '@/lib/utils';

const IMAGE_WIDTHS:readonly MediaWidth[]=[40,65,100];

function AttachmentView({node,updateAttributes,deleteNode,selected,editor}:NodeViewProps){
  const ctx=useAttachments();
  const knownFile=ctx?.files.find(file=>file.id===node.attrs.attachmentId);
  const root=React.useRef<HTMLElement>(null);
  const [visible,setVisible]=React.useState(false);
  const [captionOpen,setCaptionOpen]=React.useState(false);
  const retried=React.useRef(false);
  React.useEffect(()=>{
    if(!root.current)return;
    if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}
    },{rootMargin:'160px'});
    observer.observe(root.current);
    return ()=>observer.disconnect();
  },[]);
  const {url,file:remote,error,retry}=useAttachmentUrl(
    visible && (!knownFile || knownFile.mime_type.startsWith('image/') || knownFile.preview_allowed !== false)
      ? node.attrs.attachmentId : undefined,
    Boolean(knownFile?.mime_type.startsWith('image/')),
  );
  const file=knownFile??remote;
  const image=Boolean(file?.mime_type.startsWith('image/'));
  const grid=normalizeMediaLayout(node.attrs.display)==='grid' && image;
  const align=normalizeMediaAlign(node.attrs.align);
  const width=normalizeMediaWidth(node.attrs.width);
  const canEdit=Boolean(editor.isEditable && ctx?.canEdit);
  const caption=typeof node.attrs.caption==='string'?node.attrs.caption:'';
  const altText=typeof node.attrs.altText==='string'?node.attrs.altText:'';
  const filename=file?.filename||'Attached file';

  return (
    <NodeViewWrapper
      contentEditable={false}
      data-attachment-id={node.attrs.attachmentId}
      data-media-display={grid?'grid':'block'}
      className={cn('group relative my-3 min-w-0 max-w-full',
        grid&&'sm:!mr-2 sm:!inline-block sm:!w-[calc(50%_-_0.6rem)] sm:align-top')}
    >
      <figure ref={root}
        className={cn('relative flex max-w-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-card/90 shadow-sm transition-colors',
          selected?'border-primary/50 ring-1 ring-primary/20':'border-border/70 hover:border-primary/30',
          grid&&'h-full')}
        style={{
          width:grid?'100%':`${width}%`,
          marginLeft:align==='right'||align==='center'?'auto':0,
          marginRight:align==='left'||align==='center'?'auto':0,
        }}
      >
        <div className={cn('relative flex min-h-24 min-w-0 items-center justify-center overflow-hidden bg-muted/15',
          grid?'h-48 sm:h-52':'min-h-36')}>
          {image && url?(
            <button type="button"
              onClick={()=>file&&ctx?.open(file)}
              aria-label={`Enlarge image ${filename}`}
              className="group/preview relative flex min-h-24 w-full items-center justify-center p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              title="Open full-size preview">
              <img src={url} loading="lazy" decoding="async" alt={altText||caption||filename}
                className={cn('block max-w-full rounded-md object-contain',
                  grid?'max-h-44 sm:max-h-48':'max-h-[min(55dvh,30rem)]')}
                onError={()=>{if(!retried.current){retried.current=true;retry();}}}/>
              <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-background/90 px-2 py-1 text-[11px] font-medium text-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/preview:opacity-100 group-focus-visible/preview:opacity-100">
                <Maximize2 className="h-3 w-3"/> Enlarge
              </span>
            </button>
          ):(
            <div className="flex min-h-28 flex-col items-center justify-center gap-2 p-5 text-center text-muted-foreground">
              <span className="rounded-xl border border-border/60 bg-background p-2.5">
                {image?<ImageIcon className="h-5 w-5"/>:<FileText className="h-5 w-5"/>}
              </span>
              <span className="max-w-full truncate text-xs">{filename}</span>
              {!error&&visible&&<span className="text-[11px]">Loading preview…</span>}
              {!visible&&<span className="text-[11px]">Scroll to load preview</span>}
              {error&&<button type="button" className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-foreground hover:bg-muted"
                onClick={retry}><RotateCcw className="h-3 w-3"/>Retry preview</button>}
              {!image&&file&&<button type="button" aria-label={`Preview ${filename}`} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                onClick={()=>ctx?.open(file)}>Open file</button>}
            </div>
          )}
        </div>
        <figcaption className="flex min-w-0 items-start gap-2 border-t border-border/60 px-3 py-2.5">
          {canEdit&&<span title="Drag to reorder" className="mt-0.5 shrink-0 cursor-grab text-muted-foreground/65">
            <GripVertical className="h-3.5 w-3.5" aria-hidden/>
          </span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-foreground" title={filename}>{caption||filename}</p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {file?(file.width&&file.height?`${file.width} × ${file.height} · `:'')+formatMediaSize(file.size_bytes):'Private attachment'}
            </p>
          </div>
          {canEdit&&
            <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={captionOpen?'Close caption editor':'Edit caption'}
              onClick={()=>setCaptionOpen(value=>!value)}>{captionOpen?'Close':'Edit'}</button>}
        </figcaption>
        {canEdit&&(
          <div className="flex flex-wrap items-center gap-1 border-t border-border/50 bg-muted/10 px-2 py-1.5" role="toolbar"
            aria-label={`Image controls for ${filename}`}>
            <button type="button" className={cn('inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors',
                grid?'bg-primary/10 text-primary':'text-muted-foreground hover:bg-muted')}
              aria-pressed={grid} aria-label={grid?'Switch to single image':'Arrange alongside other images'}
              title="Two-column grid layout"
              onClick={()=>updateAttributes({display:grid?'block':'grid',width:grid?100:65})}>
              <LayoutGrid className="h-3.5 w-3.5"/> <span className="hidden sm:inline">Grid</span>
            </button>
            {!grid&&<div className="inline-flex items-center rounded-md border border-border/60 bg-background p-0.5"
              role="group" aria-label="Image size">
              {IMAGE_WIDTHS.map(value=><button key={value} type="button" aria-pressed={width===value}
                aria-label={value===40?'Small image':value===65?'Medium image':'Full width image'}
                onClick={()=>updateAttributes({width:value})}
                className={cn('h-7 min-w-9 rounded px-1.5 text-[10px] font-medium transition-colors',
                  width===value?'bg-primary/10 text-primary':'text-muted-foreground hover:bg-muted')}
              >{value===40?'S':value===65?'M':'L'}</button>)}
            </div>}
            {!grid&&<div className="inline-flex items-center rounded-md border border-border/60 bg-background p-0.5" role="group"
              aria-label="Image alignment">
              {(['left','center','right'] as MediaAlign[]).map(direction=>{
                const Icon=direction==='left'?AlignLeft:direction==='center'?AlignCenter:AlignRight;
                return <button key={direction} type="button" title={`Align ${direction}`}
                  aria-label={`Align image ${direction}`} aria-pressed={align===direction}
                  onClick={()=>updateAttributes({align:direction})}
                  className={cn('grid h-7 w-7 place-items-center rounded',
                    align===direction?'bg-primary/10 text-primary':'text-muted-foreground hover:bg-muted')}>
                  <Icon className="h-3.5 w-3.5"/>
                </button>;
              })}
            </div>}
            <div className="flex-1"/>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove ${filename} from note`} title="Remove from this note (file remains saved)"
              onClick={()=>{if(window.confirm('Remove this image from the note? The stored file will remain in Action Files.'))deleteNode();}}>
              <Trash2 className="h-3.5 w-3.5"/>
            </button>
          </div>
        )}
        {canEdit&&captionOpen&&<div className="space-y-2 border-t border-border/50 bg-background px-3 py-3">
          <label className="block text-[11px] font-medium text-foreground">Caption
            <input aria-label="Image caption" value={caption} maxLength={240}
              placeholder="Explain what this image shows…"
              onChange={event=>updateAttributes({caption:event.target.value})}
              className="mt-1 w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"/>
          </label>
          <label className="block text-[11px] font-medium text-foreground">Alternative text
            <input aria-label="Image alternative text" value={altText} maxLength={240}
              placeholder="Short description for screen readers"
              onChange={event=>updateAttributes({altText:event.target.value})}
              className="mt-1 w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"/>
          </label>
        </div>}
      </figure>
    </NodeViewWrapper>
  );
}

export const AttachmentNode=Node.create({
  name:'attachment',group:'block',atom:true,draggable:true,
  addAttributes(){
    return {
      attachmentId:{default:null},
      align:{default:'left'},
      width:{default:100},
      display:{default:'block'},
      caption:{default:''},
      altText:{default:''},
    };
  },
  // Never parse foreign <img>, URL or data: URI into private attachment nodes.
  parseHTML(){return [{
    tag:'div[data-attachment-id]',
    getAttrs:(element)=>({
      attachmentId:(element as HTMLElement).getAttribute('data-attachment-id'),
      align:(element as HTMLElement).getAttribute('data-attachment-align')||'left',
      width:Number((element as HTMLElement).getAttribute('data-attachment-width')||100),
      display:(element as HTMLElement).getAttribute('data-attachment-display')||'block',
      caption:(element as HTMLElement).getAttribute('data-attachment-caption')||'',
      altText:(element as HTMLElement).getAttribute('data-attachment-alt')||'',
    }),
  }];},
  renderHTML({node,HTMLAttributes}){
    return ['div',mergeAttributes(HTMLAttributes,{
      'data-attachment-id':node.attrs.attachmentId,
      'data-attachment-align':normalizeMediaAlign(node.attrs.align),
      'data-attachment-width':normalizeMediaWidth(node.attrs.width),
      'data-attachment-display':normalizeMediaLayout(node.attrs.display),
      'data-attachment-caption':String(node.attrs.caption||'').slice(0,240),
      'data-attachment-alt':String(node.attrs.altText||'').slice(0,240),
    }),'Attached file'];
  },
  addNodeView(){return ReactNodeViewRenderer(AttachmentView);},
});
