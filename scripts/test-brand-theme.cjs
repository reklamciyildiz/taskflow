// Actiproc forest design source contract. No live user data or credentials.
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const read=p=>readFileSync(p,'utf8');
const css=read('app/globals.css');
const marketing=read('app/(marketing)/marketing.css');
const sidebar=read('components/Sidebar.tsx');
const header=read('components/Header.tsx');
const shell=read('components/shell/AppShellLayout.tsx');
const billing=read('components/billing/BillingClient.tsx');
const upgrade=read('components/billing/UpgradePlanModal.tsx');
const knowledge=read('components/knowledge/KnowledgeHubWorkspace.tsx');
const planner=read('components/planner/PlannerTimeline.tsx');
const lists=read('shared/product-ui/axiom-workspace-lists.css');
const views=read('shared/product-ui/axiom-workspace-views.css');
const board=read('components/TaskBoard.tsx');
const taskCard=read('components/TaskCard.tsx');
const vercel=JSON.parse(read('vercel.json'));
let checks=0;
function lum(h){const v=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4));return .2126*v[0]+.7152*v[1]+.0722*v[2];}
function contrast(a,b){const [hi,lo]=[lum(a),lum(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05);}
for(const [a,b,min] of [['#287A52','#FFFFFF',4.5],['#287A52','#F4F6F0',4.5],['#C8FF93','#102518',7],['#EFF3F4','#0C1216',7],['#53695A','#F4F6F0',4.5],['#B1BEC4','#0C1216',4.5]]){
 assert.ok(contrast(a,b)>=min,'Insufficient contrast: '+a+' '+b);checks++;
}
for(const [name,hex] of [['primary','#287A52'],['background','#F4F6F0'],['foreground','#18291E'],['secondary','#DDEBDD'],['muted-foreground','#53695A'],['ring','#287A52'],['primary','#C8FF93'],['background','#0C1216'],['foreground','#EFF3F4'],['card','#1B2329']]){
 assert.ok(css.includes('--'+name+': ')&&css.includes('/* '+hex+' */'),'Missing palette '+name+' '+hex);checks++;
}
for(const [name,source] of [['shell',shell],['sidebar',sidebar],['header',header]]){
 assert.match(source,new RegExp('actiproc-'+(name==='shell'?'shell':name==='sidebar'?'sidebar':'app-header')));checks++;
}
assert.match(sidebar,/actiproc-sidebar-active/);checks++;
assert.match(sidebar,/aria-current=\{isActive \? 'page' : undefined\}/);checks++;
assert.match(header,/bg-popover text-popover-foreground/);checks++;
assert.match(css,/prefers-reduced-motion: reduce/);checks++;
assert.match(marketing,/\.marketing-theme \{/);checks++;
for(const source of [lists,views]){assert.doesNotMatch(source,/#60a5fa/i);assert.match(source,/hsl\(var\(--primary\)\)/);checks+=2;}
assert.doesNotMatch(billing,/bg-blue-600|hover:bg-blue-700|accent-blue-600/);checks++;
assert.match(billing,/bg-primary px-4 text-xs font-semibold text-primary-foreground/);checks++;
assert.doesNotMatch(upgrade,/bg-sky-500|text-sky-300/);checks++;
assert.doesNotMatch(knowledge,/bg-blue-500|bg-indigo-500|text-sky-300/);checks++;
assert.match(planner,/border-primary\/70 bg-primary\/20/);checks++;
assert.match(css,/--destructive:/);checks++;
assert.match(css,/--chart-3:/);checks++;
assert.equal(vercel.git.deploymentEnabled,false,'Do not turn on Vercel auto deployment');checks++;

for(const [source,klass] of [[board,'actiproc-board-hero'],[board,'actiproc-board-lane'],[board,'actiproc-board-controls'],[taskCard,'actiproc-task-card'],[knowledge,'actiproc-knowledge-hero'],[knowledge,'actiproc-knowledge-card'],[knowledge,'actiproc-knowledge-toolbar'],[billing,'actiproc-billing-hero']]){
 assert.ok(source.includes(klass),'Missing dark-surface hook '+klass);checks++;
}
for(const selector of ['.dark .actiproc-shell','.dark .actiproc-sidebar','.dark .actiproc-board-lane-header','.dark .actiproc-knowledge-card','.dark .actiproc-billing-hero']){
 assert.ok(css.includes(selector),'Missing premium graphite selector '+selector);checks++;
}
assert.ok(board.includes('data-tone={terminal'), 'Stage colors must remain semantic');checks++;
assert.ok(css.includes('prefers-reduced-motion: reduce'),'Motion reduction must remain supported');checks++;
console.log(JSON.stringify({checks,contrastPass:true,lightAndDark:true,graphiteDark:true,semanticBoardStages:true,marketingIsolated:true,manualDeploymentPreserved:true}));
