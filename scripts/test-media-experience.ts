import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { AttachmentNode } from '../components/editor/extensions/AttachmentNode';
import {
  adjacentMediaIndex, formatMediaSize,normalizeMediaAlign,normalizeMediaLayout,normalizeMediaWidth,
} from '../lib/media-presentation';

assert.equal(normalizeMediaLayout('grid'),'grid');
assert.equal(normalizeMediaLayout(undefined),'block');
assert.equal(normalizeMediaLayout('__proto__'),'block');
assert.equal(normalizeMediaAlign('left'),'left');
assert.equal(normalizeMediaAlign('center'),'center');
assert.equal(normalizeMediaAlign('right'),'right');
assert.equal(normalizeMediaAlign('unknown'),'left');
assert.equal(normalizeMediaWidth(25),40);
assert.equal(normalizeMediaWidth(40),40);
assert.equal(normalizeMediaWidth(65),65);
assert.equal(normalizeMediaWidth(75),65);
assert.equal(normalizeMediaWidth(100),100);
assert.equal(normalizeMediaWidth('Infinity'),100);
assert.equal(normalizeMediaWidth(undefined),100);
assert.equal(formatMediaSize(1024),'1 KB');
assert.equal(formatMediaSize(1024*1024),'1.0 MB');
assert.equal(formatMediaSize(-1),'Unknown size');
const images=['a','b','c'];
assert.equal(adjacentMediaIndex(images,'a',1),'b');
assert.equal(adjacentMediaIndex(images,'c',1),'a');
assert.equal(adjacentMediaIndex(images,'a',-1),'c');
assert.equal(adjacentMediaIndex(images,'missing',1),null);
assert.equal(adjacentMediaIndex([], 'a',1),null);

// The existing attachment JSON remains valid without any migration.
const schema=getSchema([StarterKit,AttachmentNode]);
const existing=schema.nodeFromJSON({type:'doc',content:[
  {type:'paragraph',content:[{type:'text',text:'Existing technical note'}]},
  {type:'attachment',attrs:{attachmentId:'11111111-1111-4111-8111-111111111111',
    align:'left',width:100,caption:'CAD screenshot'}},
]});
const roundtrip=existing.toJSON();
assert.equal(roundtrip.content?.[1].type,'attachment');
assert.equal(roundtrip.content?.[1].attrs.attachmentId,'11111111-1111-4111-8111-111111111111');
assert.equal(roundtrip.content?.[1].attrs.caption,'CAD screenshot');
assert.equal(roundtrip.content?.[1].attrs.display,'block');
assert.equal(roundtrip.content?.[1].attrs.altText,'');
const modern=schema.nodeFromJSON({type:'doc',content:[
  {type:'attachment',attrs:{attachmentId:'22222222-2222-4222-8222-222222222222',
    display:'grid',width:65,caption:'Second view',altText:'Engine-room view'}},
  {type:'attachment',attrs:{attachmentId:'33333333-3333-4333-8333-333333333333',
    display:'grid',width:65,caption:'Third view'}},
]});
assert.equal(modern.toJSON().content?.length,2);
assert.equal(modern.toJSON().content?.[0].attrs.altText,'Engine-room view');
assert.equal(modern.toJSON().content?.[0].attrs.display,'grid');

// Structural safeguards for private media. Runtime behavior is covered by
// scripts/test-attachments-browser.cjs with a real browser and mocked R2.
const src=(path:string)=>readFileSync(path,'utf8');
const node=src('components/editor/extensions/AttachmentNode.tsx');
assert.match(node,/useAttachmentUrl/);
assert.match(node,/data-attachment-id/);
assert.match(node,/altText/);
assert.match(node,/aria-label="Image caption"/);
assert.match(node,/deleteNode\(\)/);
assert.match(node,/normalizeMediaLayout/);
assert.match(node,/width:grid\?'100%'/);
assert.match(node,/role="toolbar"/);
assert.doesNotMatch(node,/<img\s+src=\{node\.attrs\.src\}/);
const provider=src('components/attachments/AttachmentProvider.tsx');
assert.match(provider,/function AttachmentPreview/);
assert.match(provider,/adjacentMediaIndex/);
assert.match(provider,/ArrowLeft/);
assert.match(provider,/ArrowRight/);
assert.match(provider,/ZoomIn/);
assert.match(provider,/ChecklistAttachmentRail/);
assert.match(provider,/attachmentRequest\(\`\/api\/attachments\/\$\{file\.id\}\?download=1\`\)/);
assert.match(provider,/ctx\.open\(file\)/);
assert.match(provider,/job\.onReady\?\.\(signed\.id,job\.file\)/);
const editor=src('components/editor/BlockEditor.tsx');
assert.match(editor,/display:image&&files\.filter/);
assert.match(editor,/Drop or paste screenshots directly into the editor/);
assert.match(editor,/prepareAttachmentTarget/);
const checklist=src('components/editor/components/TaskItemNodeView.tsx');
assert.match(checklist,/ChecklistAttachmentRail/);
assert.match(checklist,/checklistItemId:id/);
assert.match(checklist,/ChecklistNoteChip/);
console.log(JSON.stringify({
  suite:'premium-media-editor',status:'passed',
  existingTipTapNodesPreserved:true,privateUrls:true,
  imageGridAndZoom:true,checklistThumbnails:true,
}));
