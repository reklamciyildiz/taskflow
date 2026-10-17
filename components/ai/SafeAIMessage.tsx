'use client';

import { Fragment } from 'react';
import type { SourceCitation } from '@/lib/ai/retrieval/types';

const tokenPattern=/(`[^`\n]+`|\[cite:[0-9a-f]{64}\]|\*\*[^*\n]+\*\*)/g;

function Inline({ text,sources }:{ text:string;sources:SourceCitation[] }) {
  const sourceMap=new Map(sources.map((source,index)=>[source.citationId,index+1]));
  return <>{text.split(tokenPattern).filter(Boolean).map((part,index)=>{
    if (part.startsWith('[cite:')) {
      const id=part.slice(6,-1),number=sourceMap.get(id);
      return number ? <sup key={index} className="ml-0.5 text-primary" aria-label={`Source ${number}`}>[{number}]</sup> : null;
    }
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{part.slice(1,-1)}</code>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2,-2)}</strong>;
    return <Fragment key={index}>{part}</Fragment>;
  })}</>;
}

export function SafeAIMessage({ content,sources=[] }:{ content:string;sources?:SourceCitation[] }) {
  const blocks=content.split(/```/);
  return <div className="space-y-2 text-sm leading-6 [overflow-wrap:anywhere]">{blocks.map((block,index)=>{
    if (index%2===1) return <pre key={index} className="max-w-full overflow-x-auto rounded-lg border bg-muted/60 p-3 text-xs"><code>{block.replace(/^\w+\n/,'')}</code></pre>;
    return block.split(/\n{2,}/).filter(Boolean).map((paragraph,paragraphIndex)=>{
      const lines=paragraph.split('\n');
      const isList=lines.every((line)=>/^[-*] /.test(line));
      return isList
        ? <ul key={`${index}-${paragraphIndex}`} className="list-disc space-y-1 pl-5">{lines.map((line,lineIndex)=><li key={lineIndex}><Inline text={line.slice(2)} sources={sources}/></li>)}</ul>
        : <p key={`${index}-${paragraphIndex}`} className="whitespace-pre-wrap"><Inline text={paragraph} sources={sources}/></p>;
    });
  })}</div>;
}
