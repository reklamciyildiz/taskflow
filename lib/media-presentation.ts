/** Visual preferences are stored on the TipTap attachment node, never on the file.
 * Legacy documents lacking these attributes keep a stable compact card.
 */
export type MediaLayout = 'block' | 'grid';
export type MediaAlign = 'left' | 'center' | 'right';
export type MediaWidth = 40 | 65 | 100;

export function normalizeMediaLayout(raw:unknown):MediaLayout {
  return raw==='grid'?'grid':'block';
}
export function normalizeMediaAlign(raw:unknown):MediaAlign {
  return raw==='center'||raw==='right'?raw:'left';
}
export function normalizeMediaWidth(raw:unknown):MediaWidth {
  const n=Number(raw);
  if(!Number.isFinite(n))return 100;
  if(n<=52)return 40;
  if(n<=82)return 65;
  return 100;
}
export function formatMediaSize(bytes:number):string {
  if(!Number.isFinite(bytes)||bytes<0)return 'Unknown size';
  return bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/(1024*1024)).toFixed(1)} MB`;
}
export function adjacentMediaIndex(ids:readonly string[],activeId:string,offset:-1|1):string|null {
  const index=ids.indexOf(activeId);
  if(index<0||!ids.length)return null;
  return ids[(index+offset+ids.length)%ids.length];
}
