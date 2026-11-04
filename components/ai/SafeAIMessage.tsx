'use client';

import { Fragment } from 'react';
import type { SourceCitation } from '@/lib/ai/retrieval/types';

const tokenPattern = /(\x60[^\x60\n]+\x60|\[cite:[0-9a-f]{64}\]|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

function Inline({ text, sources }: { text: string; sources: SourceCitation[] }) {
  const sourceMap = new Map(sources.map((source, index) => [source.citationId, index + 1]));
  return (
    <>
      {text.split(tokenPattern).filter(Boolean).map((part, index) => {
        if (part.startsWith('[cite:')) {
          const id = part.slice(6, -1);
          const number = sourceMap.get(id);
          return number ? <sup key={index} className="ml-0.5 rounded text-[0.72em] font-semibold text-primary" aria-label={'Source ' + number}>[{number}]</sup> : null;
        }
        if (part.startsWith('\x60') && part.endsWith('\x60')) {
          return <code key={index} className="rounded-md border border-border/60 bg-muted/75 px-1.5 py-0.5 font-mono text-[0.85em]">{part.slice(1, -1)}</code>;
        }
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

function RichParagraph({ value, sources }: { value: string; sources: SourceCitation[] }) {
  const lines = value.split('\n');
  const heading = value.match(/^(#{1,3})\s+([\s\S]+)$/);
  if (heading && !heading[2].includes('\n')) {
    const className = heading[1].length === 1 ? 'text-[19px] sm:text-xl'
      : heading[1].length === 2 ? 'text-base sm:text-[17px]' : 'text-[14px]';
    return <h3 className={'mb-2 mt-4 font-semibold tracking-[-0.025em] text-foreground first:mt-0 ' + className}>
      <Inline text={heading[2]} sources={sources}/>
    </h3>;
  }
  if (lines.every(line => /^[-*] /.test(line))) {
    return <ul className="my-2 list-disc space-y-1.5 pl-5 marker:text-primary/75">
      {lines.map((line, i) => <li key={i} className="pl-0.5"><Inline text={line.slice(2)} sources={sources}/></li>)}
    </ul>;
  }
  if (lines.every(line => /^\d+[.)]\s+/.test(line))) {
    return <ol className="my-2 list-decimal space-y-1.5 pl-5 marker:text-primary/75">
      {lines.map((line, i) => <li key={i} className="pl-0.5"><Inline text={line.replace(/^\d+[.)]\s+/, '')} sources={sources}/></li>)}
    </ol>;
  }
  if (lines.every(line => /^>\s?/.test(line))) {
    return <blockquote className="my-3 border-l-[3px] border-primary/45 bg-primary/[0.045] py-2 pl-3 pr-2 text-foreground/85">
      <Inline text={lines.map(line => line.replace(/^>\s?/, '')).join('\n')} sources={sources}/>
    </blockquote>;
  }
  if (/^(-{3,}|\*{3,})$/.test(value.trim())) return <hr className="my-4 border-border/70"/>;
  return <p className="whitespace-pre-wrap text-foreground/90"><Inline text={value} sources={sources}/></p>;
}

export function SafeAIMessage({ content, sources = [] }: { content: string; sources?: SourceCitation[] }) {
  // Never interpret model-supplied HTML. All formatting stays within React text nodes.
  const parts = content.split(/(\x60{3}[^\n]*\n[\s\S]*?\x60{3})/g);
  return (
    <div className="space-y-3 text-[13px] leading-[1.85] text-foreground [overflow-wrap:anywhere] sm:text-[13.5px]">
      {parts.map((part, index) => {
        if (!part) return null;
        if (/^\x60{3}/.test(part)) {
          const match = part.match(/^\x60{3}([a-zA-Z0-9+#._-]{0,35})\n([\s\S]*?)\x60{3}$/);
          if (!match) return <RichParagraph key={index} value={part} sources={sources}/>;
          return (
            <div key={index} className="my-4 max-w-full overflow-hidden rounded-xl border border-border/80 bg-muted/35">
              {match[1] && <div className="border-b border-border/65 bg-muted/45 px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{match[1]}</div>}
              <pre className="max-w-full overflow-x-auto p-3.5 font-mono text-[11.5px] leading-[1.75] text-foreground [tab-size:2] sm:text-xs">
                <code>{match[2].replace(/\n$/, '')}</code>
              </pre>
            </div>
          );
        }
        return part.split(/\n{2,}/).filter(Boolean).map((paragraph, paragraphIndex) =>
          <RichParagraph key={index + '-' + paragraphIndex} value={paragraph.trim()} sources={sources}/>
        );
      })}
    </div>
  );
}
