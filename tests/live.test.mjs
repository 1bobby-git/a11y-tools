import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fixture(){
  const env={url:'https://example.test/work',documentId:'doc-1',runs:0,closed:false,denied:false,broken:false,calls:[],local:{},session:{}};
  const store=key=>({get:async names=>{const result={};for(const name of Array.isArray(names)?names:[names])result[name]=structuredClone(env[key][name]);return result;},set:async values=>Object.assign(env[key],structuredClone(values)),remove:async names=>{for(const name of Array.isArray(names)?names:[names])delete env[key][name];}});
  let ctx;
  const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:()=>{}}},storage:{local:store('local'),session:store('session')},windows:{update:async(...a)=>env.calls.push(['window',...a])},tabs:{get:async id=>{if(env.closed)throw Error('closed');return {id,windowId:1,url:env.url};},update:async(...a)=>env.calls.push(['activate',...a]),create:async(...a)=>env.calls.push(['create',...a])},scripting:{executeScript:async spec=>{
    env.calls.push(['script',spec.target]);if(env.denied)throw Error('no activeTab permission');
    if(spec.target.documentIds&&!spec.target.documentIds.includes(env.documentId))throw Error('document no longer exists');
    return [{frameId:0,documentId:env.documentId,result:spec.func?await spec.func(...spec.args||[]):undefined}];
  }}};
  ctx=vm.createContext({chrome,URL,crypto:globalThis.crypto,structuredClone,console,document:{},importScripts:p=>vm.runInContext(read('extension/'+p),ctx)});
  ctx.StudioAudit={run:async()=>{env.runs++;if(env.broken)throw Error('audit failed');return {id:'fresh-'+env.runs,createdAt:new Date().toISOString(),page:{url:env.url,mode:'live'},findings:[{ruleId:'current-'+env.runs}],focus:{events:[]},screenReader:{status:'not-run'},manual:{}};}};
  ctx.StudioFocus={stop:()=>({events:[]})};ctx.StudioPlayer={stop:()=>({}),state:include=>({revision:3,running:false,started:false,...include?{focus:{events:[]}}:{}}),command:cmd=>({reason:cmd,focus:{events:[]}})};
  vm.runInContext(read('extension/background.js'),ctx);
  const sender={id:'test',url:'chrome-extension://test/report.html'};
  return {env,ctx,send:(m,s=sender)=>ctx.handle(m,s),init:async()=>{await ctx.handle({action:'audit',tabId:7},sender);return structuredClone(env.local.latestReport);}};
}
test('refresh executes a second live audit and ignores saved markup',async()=>{
  const f=fixture(),old=await f.init();old.html='<button id="old">old</button>';f.env.local.latestReport.focus={events:[{selector:'#old'}]};
  const r=await f.send({action:'refresh-report',sourceTab:old.sourceTab,reportId:old.id,html:old.html});
  assert.equal(f.env.runs,2);assert.equal(r.report.findings[0].ruleId,'current-2');assert.equal(r.report.refresh.basis,'live-dom');assert.equal(r.report.refresh.reloaded,false);
  assert.deepEqual(r.report.focus.events,[]);assert.deepEqual(r.report.manual,{});assert.equal(r.report.screenReader.status,'not-run');
  assert.equal(f.env.calls.filter(c=>c[0]==='create').length,1,'Refresh must reuse the existing report tab');
});
test('same-origin page reload is re-audited with a fresh document identity',async()=>{
  const f=fixture(),old=await f.init();f.env.documentId='doc-2';f.ctx.__studioScanId=undefined;
  const r=await f.send({action:'refresh-report',sourceTab:old.sourceTab,reportId:old.id});assert.equal(r.report.sourceTab.documentId,'doc-2');assert.notEqual(r.report.sourceTab.scanId,old.sourceTab.scanId);
});
test('closed original tab never falls back to stored evidence',async()=>{
  const f=fixture(),old=await f.init();f.env.closed=true;
  await assert.rejects(f.send({action:'refresh-report',sourceTab:old.sourceTab,reportId:old.id}),/닫혔거나/);assert.equal(f.env.runs,1);assert.equal(f.env.local.latestReport.id,old.id);
});
test('changed origin requires a new explicit extension invocation',async()=>{
  const f=fixture(),old=await f.init();f.env.url='https://other.test/';
  await assert.rejects(f.send({action:'refresh-report',sourceTab:old.sourceTab,reportId:old.id}),/다른 사이트/);assert.equal(f.env.runs,1);
});
test('expired activeTab permission preserves the previous report',async()=>{
  const f=fixture(),old=await f.init();f.env.denied=true;
  await assert.rejects(f.send({action:'refresh-report',sourceTab:old.sourceTab,reportId:old.id}),/권한/);assert.equal(f.env.local.latestReport.id,old.id);
});
test('audit failure never replaces a good report with empty success',async()=>{
  const f=fixture(),old=await f.init();f.env.broken=true;
  await assert.rejects(f.send({action:'refresh-report',sourceTab:old.sourceTab,reportId:old.id}),/audit failed/);assert.equal(f.env.local.latestReport.id,old.id);
});
test('an imported/forged source reference cannot authorize a tab',async()=>{
  const f=fixture(),old=await f.init();
  for(const sourceTab of [{...old.sourceTab,tabId:999},{...old.sourceTab,scanId:'unknown'}])await assert.rejects(f.send({action:'refresh-report',sourceTab,reportId:old.id}),/유효한 원본/);
  await assert.rejects(f.send({action:'refresh-report',sourceTab:old.sourceTab,reportId:'other-report'}),/유효한 원본/);assert.equal(f.env.runs,1);
});
test('content scripts cannot initiate refresh or playback control',async()=>{
  const f=fixture(),old=await f.init();await assert.rejects(f.send({action:'refresh-report',sourceTab:old.sourceTab,reportId:old.id},{tab:{id:7},url:'https://example.test/'}),/출처/);
});
test('player uses the bound document and does not navigate or create a new tab',async()=>{
  const f=fixture(),old=await f.init();const r=await f.send({action:'player-control',command:'play',sourceTab:old.sourceTab,reportId:old.id});assert.equal(r.status.reason,'play');
  assert.equal(f.env.calls.filter(c=>c[0]==='create').length,1);assert.ok(f.env.calls.some(c=>c[0]==='activate'));
});
test('old document playback is refused after navigation',async()=>{
  const f=fixture(),old=await f.init();f.env.documentId='doc-new';
  await assert.rejects(f.send({action:'player-control',command:'play',sourceTab:old.sourceTab,reportId:old.id}),/document no longer exists/);
});
test('only known passive playback operations are accepted',async()=>{
  const f=fixture(),old=await f.init();await assert.rejects(f.send({action:'player-control',command:'click',sourceTab:old.sourceTab,reportId:old.id}),/지원하지 않는/);
});
test('manual recording is protected from automatic playback replacement',async()=>{
  const f=fixture(),old=await f.init();f.env.session.focusSession={tabId:7};
  await assert.rejects(f.send({action:'player-control',command:'play',sourceTab:old.sourceTab,reportId:old.id}),/수동 초점 기록/);
});
test('all newly added browser scripts parse and built copies match',()=>{
  for(const file of ['player.js','preview-runtime.js','workspace.js']){new vm.Script(read('public/assets/'+file));assert.equal(read('public/assets/'+file),read('docs/assets/'+file));assert.equal(read('public/assets/'+file),read('extension/assets/'+file));}
  new vm.Script(read('extension/live.js'));
});
test('trusted extension report tabs remain allowed even with sender tab metadata',async()=>{
  const f=fixture(),old=await f.init();
  const result=await f.send({action:'refresh-report',sourceTab:old.sourceTab,reportId:old.id},{id:'test',url:'chrome-extension://test/report.html',tab:{id:99}});
  assert.equal(result.ok,true);assert.equal(f.env.runs,2);
  await assert.rejects(f.send({action:'refresh-report',sourceTab:result.report.sourceTab,reportId:result.report.id},{id:'other-extension',url:'chrome-extension://test/report.html'}),/출처/);
});
