"use client";

import React from 'react';
import CodeBlock from '@tiptap/extension-code-block';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Check, Copy, FileCode2 } from 'lucide-react';
import { toast } from 'sonner';
import { CODE_LANGUAGES, normalizeCodeLanguage } from '../rich-paste';

const JS_KEYWORDS = new Set([
  'import', 'export', 'from', 'default', 'const', 'let', 'var', 'function', 'return',
  'async', 'await', 'class', 'extends', 'new', 'this', 'if', 'else', 'for', 'while',
  'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'typeof',
  'instanceof', 'in', 'of', 'void', 'null', 'undefined', 'true', 'false', 'yield',
  'interface', 'type', 'implements', 'public', 'private', 'protected', 'readonly',
  'number', 'string', 'boolean', 'as', 'satisfies', 'keyof', 'unknown', 'never',
]);
const PY_KEYWORDS = new Set([
  'def', 'class', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'is', 'and', 'or',
  'return', 'yield', 'async', 'await', 'import', 'from', 'as', 'with', 'pass', 'try',
  'except', 'finally', 'raise', 'lambda', 'True', 'False', 'None', 'self', 'print',
]);
const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'group', 'by', 'having', 'order', 'limit', 'offset', 'join',
  'left', 'right', 'inner', 'outer', 'on', 'as', 'insert', 'into', 'values', 'update',
  'set', 'delete', 'create', 'table', 'alter', 'drop', 'with', 'distinct', 'and', 'or',
  'not', 'null', 'is', 'case', 'when', 'then', 'else', 'end', 'count', 'sum',
]);
const COMMON_KEYWORDS = new Set([
  ...JS_KEYWORDS, ...PY_KEYWORDS, 'package', 'using', 'namespace', 'static',
  'func', 'fn', 'impl', 'struct', 'enum', 'match', 'var', 'println', 'echo',
]);

function tokenClass(value: string, language: string): string | null {
  if (value.startsWith('//') || value.startsWith('/*') ||
      (value.startsWith('#') && !['html', 'css', 'xml'].includes(language))) return 'comment';
  if (/^["'\x60]/.test(value)) return 'string';
  if (/^\d/.test(value)) return 'number';
  if (language === 'json' && /^(true|false|null)$/.test(value)) return 'keyword';
  const words = language === 'python' ? PY_KEYWORDS : language === 'sql' ? SQL_KEYWORDS : COMMON_KEYWORDS;
  return words.has(language === 'sql' ? value.toLowerCase() : value) ? 'keyword' : null;
}

// Decorations change only appearance: code bytes and user selection are kept in
// the ProseMirror document. Bound work for long pasted files.
const CODE_TOKEN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b/g;

function syntaxDecorations(doc: any): DecorationSet {
  const spans: Decoration[] = [];
  let remaining = 3000;
  doc.descendants((node: any, pos: number) => {
    if (node.type.name !== 'codeBlock') return true;
    const language = normalizeCodeLanguage(node.attrs.language);
    if (language === 'plaintext' || language === 'markdown' || node.textContent.length > 40_000) return false;
    const code = node.textContent as string;
    CODE_TOKEN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while (remaining > 0 && (match = CODE_TOKEN.exec(code)) !== null) {
      const category = tokenClass(match[0], language);
      if (category) {
        spans.push(Decoration.inline(pos + 1 + match.index, pos + 1 + match.index + match[0].length, {
          class: 'actiproc-syntax-' + category,
        }));
        remaining--;
      }
    }
    return false;
  });
  return DecorationSet.create(doc, spans);
}

const syntaxPlugin = new Plugin({
  key: new PluginKey('actiproc-code-syntax'),
  props: { decorations: state => syntaxDecorations(state.doc) },
});

function PremiumCodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const [copied, setCopied] = React.useState(false);
  const language = normalizeCodeLanguage(node.attrs.language);
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1300);
    } catch {
      toast.error('Could not copy code. Select the code and copy it manually.');
    }
  };
  return (
    <NodeViewWrapper className="actiproc-codeblock" data-language={language}>
      <div className="actiproc-codeblock-header" contentEditable={false}>
        <span className="actiproc-codeblock-label"><FileCode2 aria-hidden="true" className="h-3.5 w-3.5" /> CODE</span>
        <div className="actiproc-codeblock-actions">
          <select
            aria-label="Code language"
            className="actiproc-code-language"
            value={language}
            disabled={!editor.isEditable}
            onChange={event => updateAttributes({ language: event.target.value })}
          >
            {CODE_LANGUAGES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          <button
            type="button"
            aria-label={copied ? 'Code copied' : 'Copy code'}
            className="actiproc-code-copy"
            onClick={() => void copyCode()}
          >
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
      <pre className="actiproc-codeblock-body" spellCheck={false}>
        <NodeViewContent as="code" className="actiproc-codeblock-content" spellCheck={false} />
      </pre>
    </NodeViewWrapper>
  );
}

export const PremiumCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      language: {
        default: 'plaintext',
        rendered: false,
        parseHTML: element => {
          const className = element.querySelector('code')?.getAttribute('class') ?? '';
          const language = className.match(/(?:^|\s)language-([\w+#-]+)/)?.[1] ||
            element.getAttribute('data-language');
          return normalizeCodeLanguage(language);
        },
      },
    };
  },
  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), syntaxPlugin];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PremiumCodeBlockView);
  },
}).configure({
  defaultLanguage: 'plaintext',
  enableTabIndentation: true,
  tabSize: 2,
});
