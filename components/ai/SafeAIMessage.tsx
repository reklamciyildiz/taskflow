'use client';

import { memo, useMemo, type ReactNode } from 'react';
import { Check, CheckCircle2, Copy, FileCode2, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SourceCitation } from '@/lib/ai/retrieval/types';
import {
  parseAIResponseMarkdown, safeMarkdownHref, type MarkdownBlock,
  type MarkdownAlign,
} from '@/lib/ai/chat/response-markdown';

// No HTML rendering or arbitrary image loading. All model text is escaped by React.
// A known citation is displayed as its validated index, never as an internal ID.
const inlinePattern = /(\[cite:[a-f0-9]{64}\]|\x60+[^\x60\n]+\x60+|!\[[^\]\n]+\]\([^)]+\)|\[[^\]\n]+\]\([^)]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/gi;

function Inline({ text, citations, depth = 0 }: {
  text: string; citations: Map<string, number>; depth?: number;
}): ReactNode {
  if (depth > 4 || !text) return text;
  const output: ReactNode[] = [];
  let previous = 0;
  for (const match of text.matchAll(inlinePattern)) {
    const value = match[0];
    const start = match.index;
    if (start > previous) output.push(text.slice(previous, start));
    const key = start;
    const citation = value.match(/^\[cite:([a-f0-9]{64})\]$/i);
    if (citation) {
      const number = citations.get(citation[1].toLowerCase());
      if (number) {
        output.push(<sup key={key} aria-label={'Verified source ' + number}
          className="ml-0.5 inline-flex -translate-y-0.5 rounded-md border border-primary/15 bg-primary/[0.07] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary">[{number}]</sup>);
      }
    } else if (value.startsWith('\x60')) {
      const ticks = value.match(/^\x60+/)?.[0].length ?? 1;
      output.push(<code key={key} className="rounded-md border border-border/60 bg-muted/75 px-1.5 py-0.5 font-mono text-[0.84em] text-foreground">
        {value.slice(ticks, -ticks)}
      </code>);
    } else if (value.startsWith('![')) {
      // Do not fetch remote images from untrusted AI output (privacy/tracking).
      output.push(<span key={key} className="text-muted-foreground">
        [Image: {value.slice(2, value.indexOf(']'))}]
      </span>);
    } else if (value.startsWith('[')) {
      const divider = value.indexOf('](');
      const title = value.slice(1, divider);
      const destination = value.slice(divider + 2, -1);
      const href = safeMarkdownHref(destination);
      output.push(href
        ? <a key={key} href={href} target={href.startsWith('http') ? '_blank' : undefined}
            rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="font-medium text-primary underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <Inline text={title} citations={citations} depth={depth + 1}/>
          </a>
        : <span key={key}>{title}</span>);
    } else if (value.startsWith('**') || value.startsWith('__')) {
      output.push(<strong key={key} className="font-semibold text-foreground">
        <Inline text={value.slice(2, -2)} citations={citations} depth={depth + 1}/>
      </strong>);
    } else if (value.startsWith('~~')) {
      output.push(<del key={key} className="text-muted-foreground">
        <Inline text={value.slice(2, -2)} citations={citations} depth={depth + 1}/>
      </del>);
    } else if (value.startsWith('*') || value.startsWith('_')) {
      output.push(<em key={key} className="text-foreground/90">
        <Inline text={value.slice(1, -1)} citations={citations} depth={depth + 1}/>
      </em>);
    } else {
      output.push(value);
    }
    previous = start + value.length;
  }
  if (previous < text.length) output.push(text.slice(previous));
  return output.length ? output : text;
}

async function copyText(content: string, label: string) {
  try {
    await navigator.clipboard.writeText(content);
    toast.success(label);
  } catch {
    toast.error('Could not copy. Please try again.');
  }
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <section aria-label={'Code block ' + (language || '')}
      className="my-4 min-w-0 max-w-full overflow-hidden rounded-xl border border-border/75 bg-background/80 shadow-[0_8px_24px_-23px_hsl(var(--foreground)/0.28)]">
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-border/65 bg-muted/45 px-3.5">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-mono text-[10px] font-medium text-muted-foreground">
          <FileCode2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/>
          {language || 'Code'}
        </span>
        <button type="button" aria-label="Copy code" onClick={() => void copyText(code, 'Code copied')}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <Copy className="h-3.5 w-3.5" aria-hidden="true"/> Copy
        </button>
      </div>
      <pre className="actiproc-ai-scrollbar max-h-[460px] max-w-full overflow-auto px-4 py-3.5 font-mono text-[11.5px] leading-[1.8] text-foreground [tab-size:2] sm:text-xs">
        <code>{code}</code>
      </pre>
    </section>
  );
}

function MarkdownTable({ headers, rows, align, citations }: {
  headers: string[]; rows: string[][]; align: MarkdownAlign[];
  citations: Map<string, number>;
}) {
  const alignment = (side: MarkdownAlign) =>
    side === 'right' ? 'text-right' : side === 'center' ? 'text-center' : 'text-left';
  const asTsv = [headers, ...rows].map(row => row.map(value =>
    value.replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t')).join('\n');
  return (
    <section aria-label="AI response table"
      className="my-4 min-w-0 max-w-full overflow-hidden rounded-xl border border-border/75 bg-background/55 shadow-[0_8px_25px_-23px_hsl(var(--foreground)/0.26)]">
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-border/60 bg-muted/25 px-3">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-muted-foreground">
          <Table2 className="h-3.5 w-3.5 text-primary" aria-hidden="true"/>
          Table <span className="font-normal tabular-nums text-muted-foreground/80">· {rows.length} rows</span>
        </span>
        <button type="button" aria-label="Copy table" onClick={() => void copyText(asTsv, 'Table copied')}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <Copy className="h-3.5 w-3.5" aria-hidden="true"/> Copy
        </button>
      </div>
      <div className="actiproc-ai-scrollbar w-full max-w-full overflow-x-auto overscroll-x-contain"
        role="region" tabIndex={0} aria-label="Scrollable response table">
        <table className="w-full border-collapse text-[12px] leading-[1.65] sm:text-[12.5px]"
          style={{ minWidth: headers.length > 3 ? Math.min(1000, headers.length * 125) + 'px' : '100%' }}>
          <thead>
            <tr className="border-b border-border/75 bg-muted/60">
              {headers.map((header, index) => (
                <th key={index} scope="col"
                  className={'px-3.5 py-3 align-top font-semibold text-foreground ' + alignment(align[index])}>
                  <Inline text={header} citations={citations}/>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/45">
            {rows.map((row, index) => (
              <tr key={index} className="transition-colors odd:bg-card/20 even:bg-muted/[0.13] hover:bg-primary/[0.055]">
                {headers.map((_, column) => (
                  <td key={column} className={'max-w-[260px] px-3.5 py-2.5 align-top text-foreground/85 [overflow-wrap:anywhere] ' + alignment(align[column])}>
                    <Inline text={row[column] ?? ''} citations={citations}/>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RenderBlocks({ blocks, citations }: {
  blocks: MarkdownBlock[]; citations: Map<string, number>;
}): ReactNode {
  return blocks.map((block, index) => {
    switch (block.type) {
      case 'paragraph':
        return <p key={index} className="whitespace-pre-line text-foreground/90">
          <Inline text={block.text} citations={citations}/>
        </p>;
      case 'heading': {
        const headingStyle = block.level <= 2
          ? 'mt-5 mb-1.5 text-[16px] leading-6 sm:text-[17px]'
          : 'mt-4 mb-1 text-[14px] leading-6 sm:text-[15px]';
        return block.level <= 2
          ? <h3 key={index} className={'font-semibold tracking-[-0.02em] text-foreground first:mt-0 ' + headingStyle}>
              <Inline text={block.text} citations={citations}/>
            </h3>
          : <h4 key={index} className={'font-semibold tracking-[-0.015em] text-foreground first:mt-0 ' + headingStyle}>
              <Inline text={block.text} citations={citations}/>
            </h4>;
      }
      case 'rule':
        return <hr key={index} className="my-5 border-border/65"/>;
      case 'code':
        return <CodeBlock key={index} language={block.language} code={block.code}/>;
      case 'table':
        return <MarkdownTable key={index} headers={block.headers} rows={block.rows}
          align={block.align} citations={citations}/>;
      case 'quote':
        return <blockquote key={index} className="my-4 rounded-r-lg border-l-[3px] border-primary/45 bg-primary/[0.045] px-4 py-2.5 text-foreground/90">
          <RenderBlocks blocks={block.children} citations={citations}/>
        </blockquote>;
      case 'list': {
        const ListTag = block.ordered ? 'ol' : 'ul';
        const tasks = block.items.some(item => item.checked !== undefined);
        return <ListTag key={index} start={block.ordered ? block.start : undefined}
          className={'my-3 space-y-1.5 pl-5 ' + (tasks ? 'list-none pl-0' :
            block.ordered ? 'list-decimal marker:font-semibold marker:text-muted-foreground' :
              'list-disc marker:text-primary/75')}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex} className="min-w-0 pl-0.5 text-foreground/90">
              <span className={tasks ? 'inline-flex items-start gap-2' : ''}>
                {item.checked !== undefined &&
                  <span role="img" aria-label={item.checked ? 'Completed' : 'Pending'}
                    className="mt-[5px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-primary/50 text-primary">
                    {item.checked && <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true"/>}
                  </span>}
                <span><Inline text={item.text} citations={citations}/></span>
              </span>
              {item.children.length > 0 && <div className="mt-1.5"><RenderBlocks blocks={item.children} citations={citations}/></div>}
            </li>
          ))}
        </ListTag>;
      }
    }
  });
}

/**
 * A safe structured answer renderer. Works in dark/light mode and with
 * incomplete token streams, without turning LLM text into DOM/HTML.
 */
export const SafeAIMessage = memo(function SafeAIMessage({
  content, sources = [],
}: { content: string; sources?: SourceCitation[] }) {
  const blocks = useMemo(() => parseAIResponseMarkdown(content), [content]);
  const citations = useMemo(() => new Map(sources.map((source, index) =>
    [source.citationId.toLowerCase(), index + 1])), [sources]);
  return (
    <div className="actiproc-ai-answer min-w-0 max-w-full space-y-3 text-[13px] leading-[1.85] text-foreground [overflow-wrap:anywhere] sm:text-[13.5px]">
      <RenderBlocks blocks={blocks} citations={citations}/>
    </div>
  );
});
