/**
 * A bounded, dependency-free subset of GitHub-flavored Markdown.
 * Produces display data only, never HTML. React safely escapes all text.
 * Partial streaming responses are supported.
 */
export type MarkdownAlign = 'left' | 'center' | 'right';
export type MarkdownListItem = { text: string; checked?: boolean; children: MarkdownBlock[] };
export type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'rule' }
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; headers: string[]; rows: string[][]; align: MarkdownAlign[] }
  | { type: 'quote'; children: MarkdownBlock[] }
  | { type: 'list'; ordered: boolean; start: number; items: MarkdownListItem[] };

const MAX_NESTING = 5;
const MAX_TABLE_COLUMNS = 20;

/** Refuse executable schemes and remote images in untrusted model output. */
export function safeMarkdownHref(raw: string): string | null {
  const href = raw.trim();
  if (!href || /[\u0000-\u001f\u007f]/.test(href) || href.startsWith('//') ||
      href.startsWith('\\')) return null;
  if (/^https?:\/\/[^\s/]+/i.test(href)) {
    try {
      const url = new URL(href);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
    } catch { return null; }
  }
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(href)) return href;
  if (/^\/(?!\/)[^\\]*$/.test(href)) return href;
  if (/^#[a-z][\w-]*$/i.test(href)) return href;
  return null;
}

function splitTableRow(line: string): string[] {
  let source = line.trim();
  if (source.startsWith('|')) source = source.slice(1);
  if (source.endsWith('|') && !source.endsWith('\\|')) source = source.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  let codeDelimiter = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\\' && i + 1 < source.length && (source[i + 1] === '|' || source[i + 1] === '\\')) {
      current += source[i + 1]; i++; continue;
    }
    if (ch === '\x60') {
      let ticks = 1;
      while (source[i + ticks] === '\x60') ticks++;
      if (!codeDelimiter) codeDelimiter = ticks;
      else if (ticks === codeDelimiter) codeDelimiter = 0;
      current += '\x60'.repeat(ticks);
      i += ticks - 1;
      continue;
    }
    if (ch === '|' && codeDelimiter === 0) { cells.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function tableHeaderAt(lines: string[], index: number) {
  if (index + 1 >= lines.length || !lines[index].includes('|') || !lines[index + 1].includes('-')) return null;
  const headers = splitTableRow(lines[index]);
  const separators = splitTableRow(lines[index + 1]);
  if (headers.length < 2 || headers.length > MAX_TABLE_COLUMNS || separators.length !== headers.length ||
      separators.some(value => !/^:?-{3,}:?$/.test(value))) return null;
  const align: MarkdownAlign[] = separators.map(value =>
    value.startsWith(':') && value.endsWith(':') ? 'center' :
    value.endsWith(':') ? 'right' : 'left');
  return { headers, align };
}

const headingPattern = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const fencePattern = /^ {0,3}(\x60{3,}|~{3,})([^\x60]*)$/;
const rulePattern = /^ {0,3}(?:\* {0,2}){3,}$|^ {0,3}(?:- {0,2}){3,}$|^ {0,3}(?:_ {0,2}){3,}$/;
const quotePattern = /^ {0,3}>\s?/;
const listPattern = /^(\s{0,12})([-*+]|\d+[.)])\s+(.+)$/;

function isBlockStart(lines: string[], index: number) {
  const value = lines[index];
  return Boolean(headingPattern.test(value) || fencePattern.test(value) ||
    rulePattern.test(value) || quotePattern.test(value) || listPattern.test(value) ||
    tableHeaderAt(lines, index));
}

function parseLines(lines: string[], depth: number): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const fence = line.match(fencePattern);
    if (fence) {
      const char = fence[1][0], length = fence[1].length;
      const language = fence[2].trim().split(/\s+/)[0].replace(/[^\w+#.-]/g, '').slice(0, 32);
      const code: string[] = [];
      index++;
      const closing = new RegExp('^ {0,3}' + (char === '\x60' ? '\x60' : '~') + '{' + length + ',}\\s*$');
      while (index < lines.length && !closing.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push({ type: 'code', language, code: code.join('\n') });
      continue;
    }
    const table = tableHeaderAt(lines, index);
    if (table) {
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        const cells = splitTableRow(lines[index]);
        rows.push(table.headers.map((_, column) => cells[column] ?? ''));
        index++;
      }
      blocks.push({ type: 'table', headers: table.headers, align: table.align, rows });
      continue;
    }
    const heading = line.match(headingPattern);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() }); index++; continue; }
    if (rulePattern.test(line.trim())) { blocks.push({ type: 'rule' }); index++; continue; }
    if (quotePattern.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && (quotePattern.test(lines[index]) || !lines[index].trim())) {
        quote.push(lines[index].replace(quotePattern, '')); index++;
      }
      blocks.push({ type: 'quote', children: depth < MAX_NESTING ? parseLines(quote, depth + 1)
        : [{ type: 'paragraph', text: quote.join('\n') }] });
      continue;
    }
    const firstList = line.match(listPattern);
    if (firstList) {
      const indent = firstList[1].length;
      const ordered = /^\d/.test(firstList[2]);
      const start = ordered ? Number.parseInt(firstList[2], 10) || 1 : 1;
      const items: MarkdownListItem[] = [];
      while (index < lines.length) {
        const match = lines[index].match(listPattern);
        if (!match || match[1].length !== indent || /^\d/.test(match[2]) !== ordered) break;
        const text = match[3];
        const children: string[] = [];
        index++;
        while (index < lines.length) {
          const next = lines[index];
          if (!next.trim()) {
            if (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
              children.push(''); index++; continue;
            }
            break;
          }
          const nextItem = next.match(listPattern);
          if (nextItem && nextItem[1].length === indent) break;
          if (next.length - next.trimStart().length <= indent) break;
          children.push(next.slice(Math.min(next.length, indent + 2)));
          index++;
        }
        const check = text.match(/^\[([ xX])\]\s+(.*)$/);
        const item: MarkdownListItem = {
          text: check ? check[2] : text,
          children: depth < MAX_NESTING ? parseLines(children, depth + 1) : [],
        };
        if (check) item.checked = check[1].toLowerCase() === 'x';
        items.push(item);
        if (index < lines.length && !lines[index].trim()) break;
      }
      if (items.length) { blocks.push({ type: 'list', ordered, start, items }); continue; }
    }
    const paragraph = [line.trim()];
    index++;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index++;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  }
  return blocks;
}

/** Incomplete streaming Markdown is rendered rather than dropped. */
export function parseAIResponseMarkdown(content: string): MarkdownBlock[] {
  if (!content) return [];
  return parseLines(content.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'), 0);
}
