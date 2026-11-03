import type { JSONContent } from '@tiptap/core';

/** Clipboard text is converted only into Tiptap nodes, never executable HTML. */
export const CODE_LANGUAGES = [
  ['plaintext', 'Plain text'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'],
  ['jsx', 'JSX'], ['tsx', 'TSX'], ['python', 'Python'], ['json', 'JSON'],
  ['bash', 'Bash'], ['sql', 'SQL'], ['html', 'HTML'], ['css', 'CSS'],
  ['csharp', 'C#'], ['java', 'Java'], ['go', 'Go'], ['rust', 'Rust'],
  ['php', 'PHP'], ['yaml', 'YAML'], ['xml', 'XML'], ['markdown', 'Markdown'],
] as const;

export function normalizeCodeLanguage(value: string | null | undefined): string {
  const source = (value ?? '').trim().toLowerCase().replace(/^language-/, '');
  const aliases: Record<string, string> = {
    js: 'javascript', node: 'javascript', ts: 'typescript',
    py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash',
    cs: 'csharp', 'c#': 'csharp', yml: 'yaml', md: 'markdown',
    text: 'plaintext', plain: 'plaintext', htm: 'html',
  };
  const normalized = aliases[source] ?? source;
  return CODE_LANGUAGES.some(([id]) => id === normalized) ? normalized : 'plaintext';
}

/** Conservative identification: ordinary paragraphs are never converted to code. */
export function detectCodeLanguage(value: string): string | null {
  const text = value.replace(/\r\n?/g, '\n');
  if (text.length > 100_000 || text.split('\n').length < 2) return null;
  if (/^\s*[{[][\s\S]*"[^"\n]+"\s*:\s*[\s\S]*[}\]]\s*$/.test(text)) return 'json';
  if (/^\s*(?:<!doctype html|<html|<div|<section|<main|<span|<script|<\?xml)\b/im.test(text) &&
    /<\/[\w:-]+>/.test(text)) return 'html';
  if (/^\s*(?:def|async def|class)\s+\w+.*:\s*$/m.test(text) ||
      (/^\s*(?:from\s+\w+\s+import|import\s+\w+)/m.test(text) &&
        /^\s+(?:return|print|raise|yield|if|for)\b/m.test(text))) return 'python';
  if (/^\s*(?:using System|namespace \w+)\s*[;{]/m.test(text)) return 'csharp';
  if (/^\s*(?:package main|func \w+)\b/m.test(text)) return 'go';
  if (/^\s*(?:fn|use|impl)\s+\w+/m.test(text)) return 'rust';
  if (/^\s*#!\/(?:bin\/(?:ba)?sh|usr\/bin\/env (?:ba)?sh)/m.test(text)) return 'bash';
  if (/^\s*(?:SELECT|WITH)\b[\s\S]*\bFROM\b/i.test(text)) return 'sql';
  if (/^\s*(?:import|export|const|let|var|function|class|interface|type|async function)\s+/m.test(text) &&
      /(?:[{};=]|=>)/.test(text)) {
    return /^\s*(?:interface\s+|type\s+\w+\s*=|import\s+type\s+)/m.test(text) ||
      /:\s*(?:string|number|boolean|Promise<)/.test(text) ? 'typescript' : 'javascript';
  }
  if (/^\s*(?:public|private|protected)\s+(?:static\s+)?(?:void|class|string|int)\s+/m.test(text) &&
      /[{};]/.test(text)) return 'java';
  if (/^\s*[\w.-]+\s*:\s*[^:\n]+$/m.test(text) &&
      /^\s+[\w.-]+\s*:\s*[^:\n]+$/m.test(text)) return 'yaml';
  return null;
}

const textNode = (text: string, marks?: JSONContent['marks']): JSONContent[] =>
  text ? [{ type: 'text', text, ...(marks?.length ? { marks } : {}) }] : [];

/** Plain Markdown subset; rich text/html clipboard goes through ProseMirror instead. */
function inline(source: string): JSONContent[] {
  const out: JSONContent[] = [];
  const pattern = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\x60([^\x60\n]+)\x60|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let offset = 0;
  for (const m of source.matchAll(pattern)) {
    const at = m.index ?? 0;
    out.push(...textNode(source.slice(offset, at)));
    if (m[2]) out.push(...textNode(m[2], [{ type: 'bold' }]));
    else if (m[3]) out.push(...textNode(m[3], [{ type: 'italic' }]));
    else if (m[4]) out.push(...textNode(m[4], [{ type: 'code' }]));
    else if (m[5] && m[6]) out.push(...textNode(m[5], [{ type: 'link', attrs: { href: m[6] } }]));
    offset = at + m[0].length;
  }
  return [...out, ...textNode(source.slice(offset))];
}

function paragraph(lines: string[]): JSONContent {
  const content: JSONContent[] = [];
  lines.forEach((line, i) => {
    if (i) content.push({ type: 'hardBreak' });
    content.push(...inline(line));
  });
  return { type: 'paragraph', ...(content.length ? { content } : {}) };
}

function proseBlocks(lines: string[]): JSONContent[] {
  const nodes: JSONContent[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
    if (heading) {
      nodes.push({ type: 'heading', attrs: { level: heading[1].length }, content: inline(heading[2]) });
      i++; continue;
    }
    if (/^\s{0,3}>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s{0,3}>\s?(.*)$/);
        if (!m) break;
        quoted.push(m[1]); i++;
      }
      nodes.push({ type: 'blockquote', content: [paragraph(quoted)] });
      continue;
    }
    if (/^\s{0,3}(?:[-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s{0,3}\d+[.)]\s+/.test(line), items: JSONContent[] = [];
      const pattern = ordered ? /^\s{0,3}\d+[.)]\s+(.+)$/ : /^\s{0,3}[-*+]\s+(.+)$/;
      while (i < lines.length) {
        const m = lines[i].match(pattern);
        if (!m) break;
        items.push({ type: 'listItem', content: [paragraph([m[1]])] });
        i++;
      }
      nodes.push({ type: ordered ? 'orderedList' : 'bulletList', content: items });
      continue;
    }
    const regular: string[] = [];
    while (i < lines.length && lines[i].trim() &&
      !/^\s{0,3}(?:#{1,3}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/.test(lines[i])) {
      regular.push(lines[i]); i++;
    }
    if (regular.length) nodes.push(paragraph(regular));
    else { nodes.push(paragraph([lines[i]])); i++; }
  }
  return nodes;
}

function codeBlock(text: string, language: string): JSONContent {
  return { type: 'codeBlock', attrs: { language: normalizeCodeLanguage(language) },
    ...(text ? { content: [{ type: 'text', text }] } : {}) };
}

/** Null delegates to Tiptap's native paste handler; never hijack ordinary prose. */
export function parseRichNoteClipboard(source: string): JSONContent[] | null {
  const value = source.replace(/\r\n?/g, '\n');
  if (!value || value.length > 200_000 || !value.includes('\n')) return null;
  const lines = value.split('\n');
  const nodes: JSONContent[] = [];
  let prose: string[] = [];
  let fenced = false;
  const flush = () => { if (prose.length) nodes.push(...proseBlocks(prose)); prose = []; };

  for (let i = 0; i < lines.length;) {
    const m = lines[i].match(/^\s{0,3}(\x60{3,}|~{3,})\s*([\w+#.-]*)\s*$/);
    if (m) {
      const marker = m[1][0] === '~' ? '~' : '\x60';
      const closing = new RegExp('^\\s{0,3}' + marker + '{' + m[1].length + ',}\\s*$');
      let end = i + 1;
      while (end < lines.length && !closing.test(lines[end])) end++;
      if (end < lines.length) {
        flush();
        nodes.push(codeBlock(lines.slice(i + 1, end).join('\n'), m[2]));
        fenced = true; i = end + 1; continue;
      }
    }
    prose.push(lines[i]); i++;
  }
  if (fenced) { flush(); return nodes; }

  const language = detectCodeLanguage(value);
  if (language) return [codeBlock(value, language)];
  if (/^\s{0,3}(?:#{1,3}\s+|>\s?[^ ]|[-*+]\s+|\d+[.)]\s+)/m.test(value))
    return proseBlocks(lines);
  return null;
}
