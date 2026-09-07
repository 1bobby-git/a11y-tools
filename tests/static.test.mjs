import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('KWCAG checklist has exactly 33 unique items',()=>{
  const context=vm.createContext({});vm.runInContext(read('public/assets/standards.js'),context);
  assert.equal(context.StudioStandards.length,33);assert.equal(new Set(context.StudioStandards.map(x=>x.id)).size,33);
});
test('runtime scripts parse without syntax errors',()=>{
  for(const p of ['public/assets/config.js','public/assets/standards.js','public/assets/core.js','public/assets/focus.js','public/assets/app.js','extension/background.js','extension/popup.js','extension/report-loader.js'])assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
});
test('extension permissions are limited to explicit active tab usage',()=>{
  const m=JSON.parse(read('extension/manifest.json'));assert.equal(m.manifest_version,3);
  assert.deepEqual(m.permissions,['activeTab','scripting','storage']);assert.equal(m.host_permissions,undefined);assert.equal(m.content_scripts,undefined);
});
test('source preview is sandboxed without same-origin privileges',()=>{
  assert.match(read('public/index.html'),/sandbox="allow-scripts"/);assert.doesNotMatch(read('public/index.html'),/allow-same-origin/);
  assert.match(read('public/assets/app.js'),/connect-src 'none'/);assert.match(read('public/assets/app.js'),/form-action 'none'/);
});
test('URL normalization strips credentials query and fragment',()=>{
  const context=vm.createContext({URL});vm.runInContext(read('public/assets/core.js'),context);
  assert.equal(context.StudioAudit.cleanURL('https://user:pass@example.com/a?q=secret#part'),'https://example.com/a');
});
test('application has no automatic analytics, remote API or stored secrets',()=>{
  assert.doesNotMatch(read('public/assets/app.js'),/localStorage\.setItem|document\.cookie|googletagmanager|google-analytics/);
  assert.doesNotMatch(read('extension/manifest.json'),/cookies|debugger|webRequest|<all_urls>/);
});
test('published output and extension reuse current inspection code',()=>{
  for(const f of ['core.js','focus.js','app.js']){
    assert.equal(read('public/assets/'+f),read('docs/assets/'+f));assert.equal(read('public/assets/'+f),read('extension/assets/'+f));
  }
});
