import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAIResponseMarkdown, safeMarkdownHref } from '../lib/ai/chat/response-markdown';

let checks = 0;
const example = [
  'Actiproc sürecinde tam olarak **8 aksiyon kartı** var:',
  '',
  '| # | Kart | Öncelik | Aşama | Durum |',
  '|:---|---|:---:|---:|---|',
  '| 1 | Uygulama İçi Geliştirmeler | Yüksek | Güncel Geliştirmeler | Açık |',
  '| 2 | Entegrasyon & Eklentiler | Orta | Güncel Geliştirmeler | Açık |',
  '| 3 | Yeni UI&UX Özellikleri | Yüksek | İşimiz Bitti | ✅ Tamamlandı |',
  '',
  '**Özet:** 2 tamamlanmış, 6 açık.',
].join('\n');

const blocks = parseAIResponseMarkdown(example);
assert.deepEqual(blocks.map(block => block.type), ['paragraph', 'table', 'paragraph']);
assert.equal(blocks[1].type, 'table');
if (blocks[1].type !== 'table') throw new Error('Expected table');
assert.equal(blocks[1].headers.length, 5);
assert.equal(blocks[1].rows.length, 3);
assert.equal(blocks[1].rows[0][1], 'Uygulama İçi Geliştirmeler');
assert.equal(blocks[1].rows[2][4], '✅ Tamamlandı');
assert.deepEqual(blocks[1].align, ['left','left','center','right','left']);
checks += 7;

const mixed = [
  '## Summary', '',
  '- First **bold** item',
  '  - Nested item',
  '- [x] Completed task',
  '- [ ] Pending task', '',
  '> Verified **quotation**', '',
  '~~~ts',
  'const render = (text: string) => text;',
  'console.log(render("test"));',
  '~~~', '',
  '---', '',
  '7. Seventh entry', '8. Eighth entry',
].join('\n');
const parsed = parseAIResponseMarkdown(mixed);
assert.deepEqual(parsed.map(block=>block.type), ['heading','list','quote','code','rule','list']);
const list = parsed[1];
assert.equal(list.type,'list');
if(list.type !== 'list')throw new Error('Expected list');
assert.equal(list.items.length,3);
assert.equal(list.items[0].children[0].type,'list');
assert.equal(list.items[1].checked,true);
assert.equal(list.items[2].checked,false);
const code=parsed[3];
assert.equal(code.type,'code');
if(code.type !== 'code')throw new Error('Expected code');
assert.equal(code.language,'ts');
assert.match(code.code,/console\.log/);
const ordered=parsed[5];
assert.equal(ordered.type,'list');
if(ordered.type !== 'list')throw new Error('Expected ordered list');
assert.equal(ordered.start,7);
checks += 10;

const split = parseAIResponseMarkdown([
  '| Label | Value |', '| --- | --- |',
  '| Escaped \\\\| Pipe | '+String.fromCharCode(96)+'a|b'+String.fromCharCode(96)+' |',
].join('\n'));
assert.equal(split[0].type,'table');
if(split[0].type !== 'table')throw new Error('Expected escaped pipe table');
assert.equal(split[0].rows[0].length,2);
assert.equal(split[0].rows[0][1],String.fromCharCode(96)+'a|b'+String.fromCharCode(96));
checks += 3;

const incomplete=parseAIResponseMarkdown('~~~python\nprint("hello")');
assert.equal(incomplete[0].type,'code');
if(incomplete[0].type !== 'code')throw new Error('Expected streaming code');
assert.equal(incomplete[0].code,'print("hello")');
checks += 2;

const nonTable=parseAIResponseMarkdown('A sentence with a | separator\nNot a table');
assert.equal(nonTable.length,1);
assert.equal(nonTable[0].type,'paragraph');
checks+=2;

const URLs: Array<[string,string|null]> = [
  ['https://example.com/path','https://example.com/path'],
  ['/board?task=example','/board?task=example'],
  ['mailto:help@example.com','mailto:help@example.com'],
  ['javascript:alert(1)',null],
  ['data:text/html;base64,evil',null],
  ['//evil.example/path',null],
  ['\\\\evil.example',null],
  ['https://example.com\njavascript:evil',null],
];
for (const [url,expected] of URLs) { assert.equal(safeMarkdownHref(url),expected); checks++; }

const renderer=readFileSync('components/ai/SafeAIMessage.tsx','utf8');
assert.match(renderer,/<table /);
assert.match(renderer,/aria-label="Scrollable response table"/);
assert.match(renderer,/<th key=\{index\} scope="col"/);
assert.match(renderer,/aria-label="Copy code"/);
assert.match(renderer,/aria-label="Copy table"/);
assert.match(renderer,/safeMarkdownHref\(destination\)/);
assert.doesNotMatch(renderer,/dangerouslySetInnerHTML|rehypeRaw|innerHTML\s*=/);
const prompt=readFileSync('lib/ai/chat/prompt.ts','utf8');
assert.match(prompt,/Response presentation rules/);
assert.match(prompt,/Markdown header AND separator row/);
checks+=9;
console.log(JSON.stringify({responseMarkdownChecks:checks,realTables:true,noExternalImages:true,htmlEscaped:true}));
