(function(){
  'use strict';
  const $=id=>document.getElementById(id), S=window.StudioStandards, CFG=window.STUDIO_CONFIG;
  const labels={inspect:'검사 시작',results:'검사 결과',focus:'초점 · 레이아웃',manual:'수동 검토',guide:'사용 안내'};
  const groups={markup:'마크업',media:'이미지 · 영상',focus:'초점',other:'기타'};
  let report=null, toastTimer=null, previewChannel=null, previewReportId=null, previewRecording=false, scriptCache=null, pendingRefresh=null;
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function uuid(){if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
  function toast(message){$('toast').textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').textContent='';},7500);}
  function showView(key,focus=false){
    if(!labels[key])key='inspect';
    document.querySelectorAll('.view').forEach(n=>{n.hidden=n.id!=='view-'+key;});
    document.querySelectorAll('[data-view]').forEach(n=>{if(n.dataset.view===key)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
    $('breadcrumb').textContent='워크스페이스 / '+labels[key];document.title=labels[key]+' — 접근성 스튜디오';
    if(focus)$('main').focus({preventScroll:true});
    window.dispatchEvent(new CustomEvent('studio:view',{detail:key}));
  }
  window.addEventListener('hashchange',()=>showView(location.hash.slice(1),true));
  function empty(container,title,message){container.replaceChildren();const b=el('div',undefined,'empty-state');b.append(el('span','[ ]'),el('h2',title),el('p',message));container.append(b);}
  function safeString(v,max=10000){return typeof v==='string'?v.slice(0,max):'';}
  function validateReport(value){
    if(!value||typeof value!=='object'||value.schemaVersion!==1||value.generator!=='accessibility-studio'||!Array.isArray(value.findings)||!value.page)throw new Error('지원하는 접근성 스튜디오 v1 보고서가 아닙니다.');
    if(value.findings.length>2500)throw new Error('보고서 결과 상한은 2,500건입니다.');
    if(!value.findings.every(f=>f&&typeof f==='object'&&['error','review'].includes(f.status)&&typeof f.ruleId==='string'))throw new Error('결과 항목 형식이 올바르지 않습니다.');
    // Render all imported text through textContent. No imported HTML is executed.
    if(typeof value.id!=='string'||typeof value.createdAt!=='string')throw new Error('보고서 식별자 또는 시간이 올바르지 않습니다.');
    for(const f of value.findings){
      for(const key of ['nodes','references'])if(f[key]!==undefined&&(!Array.isArray(f[key])||f[key].some(n=>!n||typeof n!=='object'||typeof n.html!=='string'||typeof n.selector!=='string')))throw new Error('대상 마크업 형식이 올바르지 않습니다.');
    }
    if(value.screenReader?.steps!==undefined&&(!Array.isArray(value.screenReader.steps)||value.screenReader.steps.length>500||value.screenReader.steps.some(s=>!s||typeof s!=='object')))throw new Error('스크린리더 기록 형식이 올바르지 않습니다.');
    const data=structuredClone(value);
    data.inventory=data.inventory&&typeof data.inventory==='object'?data.inventory:{};
    for(const k of ['images','media','headings','landmarks','focusables','frames'])data.inventory[k]=Array.isArray(data.inventory[k])?data.inventory[k].slice(0,2500):[];
    data.focus=data.focus&&typeof data.focus==='object'?data.focus:{events:[],layoutShifts:[]};
    data.focus.events=Array.isArray(data.focus.events)?data.focus.events.slice(-500):[];
    if(data.focus.events.some(e=>!e||typeof e!=='object'||(e.samples&&!Array.isArray(e.samples))||(e.samples||[]).some(s=>!s||typeof s!=='object')))throw new Error('초점 기록 형식이 올바르지 않습니다.');
    data.limitations=Array.isArray(data.limitations)?data.limitations.slice(0,100).map(x=>safeString(x)):[];
    data.checks=Array.isArray(data.checks)?data.checks.slice(0,500):[];
    const manual={};for(const rule of S){const m=value.manual?.[rule.id];if(m&&['pass','fail','na','pending'].includes(m.status))manual[rule.id]={status:m.status,evidence:safeString(m.evidence,4000)};}
    data.manual=manual;data.reviewer=safeString(data.reviewer,500);
    return data;
  }
  function persist(){
    if(!report)return;
    try{sessionStorage.setItem('a11y-studio-report',JSON.stringify(report));}catch{toast('브라우저 저장 공간이 부족합니다. 현재 결과를 JSON으로 저장하세요.');}
  }
  function loadReport(value,navigate=true){
    report=validateReport(value);persist();renderAll();$('compare-summary').hidden=true;
    window.dispatchEvent(new Event('studio:report'));
    if(navigate){location.hash='results';showView('results',true);}
    toast('검사 결과를 불러왔습니다. 미검사 범위도 확인하세요.');
  }
  function renderStats(){
    $('stat-errors').textContent=report?report.findings.filter(f=>f.status==='error').length:'—';
    $('stat-review').textContent=report?report.findings.filter(f=>f.status==='review').length:'—';
    $('stat-focus').textContent=report?report.focus.events.length:'—';
    $('stat-manual').textContent=Object.values(report?.manual||{}).filter(m=>m.status!=='pending').length+' / 33';
    $('nav-count').textContent=report?report.findings.length:0;
    document.querySelectorAll('.report-action').forEach(n=>n.disabled=!report);
  }
  function renderAll(){renderStats();renderFindings();renderInventory();renderFocus();renderManual();
    if(!report){$('report-meta').textContent='검사를 실행하거나 JSON 보고서를 가져오세요.';$('report-scope').textContent='아직 검사한 페이지가 없습니다.';$('coverage').replaceChildren();return;}
    $('report-meta').textContent=`${report.page.title||'제목 없음'} · ${report.page.url||'HTML 입력'}`;
    const scope=$('report-scope');scope.replaceChildren();
    const when=new Date(report.createdAt);const viewport=report.page.viewport;
    scope.append(el('strong',`${report.page.mode==='demo'?'의도적 오류 데모':report.page.mode==='source'?'HTML 샌드박스':'실제 페이지'} · ${report.page.state||'현재 상태'}`),el('p',`${Number.isNaN(when.getTime())?'검사 시간 확인 불가':when.toLocaleString('ko-KR')} · ${viewport?viewport.width+' × '+viewport.height:'뷰포트 미기록'} · 기본 규칙 ${report.engine?.builtin||'알 수 없음'} · ${report.engine?.axe?'axe-core '+report.engine.axe:'axe 미실행'}`));
    scope.append(el('p','오류 수는 항목별 발견 건수이며, 같은 요소에 여러 규칙이 보고될 수 있습니다. 전체 사이트 준수율이나 인증 점수가 아닙니다.','hint'));
    $('coverage').replaceChildren();
    const table=makeTable(['규칙','실행 대상','결과'],report.checks.map(c=>[c.title||c.id,String(c.tested??'—'),c.status==='no-findings'?'해당 검사에서 발견 없음':c.status==='not-applicable'?'검사 대상 없음':c.status==='executed'?'실행 완료':'결과 있음']));$('coverage').append(table,el('h3','한계 및 미검사 범위'));
    for(const note of report.limitations)$('coverage').append(el('p',note));
  }
  function renderFindings(){
    const container=$('findings');if(!report){empty(container,'아직 검사 결과가 없습니다.','검사를 실행하거나 보고서를 가져오세요.');return;}
    const status=$('status-filter').value,group=$('group-filter').value,q=$('finding-search').value.toLowerCase();
    const list=report.findings.filter(f=>(status==='all'||f.status===status)&&(group==='all'||f.group===group)&&[f.title,f.detail,f.selector,f.ruleId].join(' ').toLowerCase().includes(q));
    $('filter-summary').textContent=`전체 ${report.findings.length}건 중 ${list.length}건 표시`;
    if(!list.length){empty(container,'표시할 결과가 없습니다.','필터를 확인하세요. 발견 없음은 전체 접근성 준수를 의미하지 않습니다.');return;}
    container.replaceChildren();const fragment=document.createDocumentFragment();
    for(const f of list){
      const d=el('details',undefined,'finding '+f.status),summary=el('summary');
      summary.append(el('span',f.status==='error'?'자동 오류':'검토 필요','badge'),document.createTextNode(safeString(f.title,1000)),el('code',safeString(f.selector,1500),'finding-selector'));
      const body=el('div',undefined,'finding-detail'),meta=el('div',undefined,'finding-meta');
      meta.append(el('span',groups[f.group]||'기타'),el('span',f.source==='axe'?'axe-core':'기본 규칙'),el('span',f.ruleId));
      for(const id of Array.isArray(f.kwcag)?f.kwcag:[])meta.append(el('span','KWCAG '+id));
      body.append(meta);
      StudioEvidenceUI.renderFinding(body,f,report,previewChannel&&report.id===previewReportId?selector=>{location.hash='inspect';$('preview').contentWindow.postMessage({channel:previewChannel,type:'locate',selector},'*');}:null);
      if(typeof f.helpUrl==='string'&&/^https:\/\/(dequeuniversity\.com|www\.w3\.org)\//.test(f.helpUrl)){const a=el('a','공식 규칙 설명 (새 창)');a.href=f.helpUrl;a.target='_blank';a.rel='noopener noreferrer';body.append(a);}
      if(previewChannel&&report.id===previewReportId){const b=el('button','미리보기에서 위치 보기','button secondary');b.type='button';b.addEventListener('click',()=>{location.hash='inspect';$('preview').contentWindow.postMessage({channel:previewChannel,type:'locate',selector:f.selector},'*');});body.append(b);}
      d.append(summary,body);fragment.append(d);
    }container.append(fragment);
  }
  function makeTable(headers,rows){const wrapper=el('div',undefined,'table-wrap'),t=el('table'),thead=el('thead'),tr=el('tr');for(const h of headers){const th=el('th',h);th.scope='col';tr.append(th);}thead.append(tr);t.append(thead);const tbody=el('tbody');for(const row of rows){const r=el('tr');for(const cell of row)r.append(el('td',String(cell??'')));tbody.append(r);}t.append(tbody);wrapper.append(t);return wrapper;}
  function renderInventory(){const container=$('inventory');container.replaceChildren();if(!report)return;
    const inventories=[['이미지',['선택자','대체텍스트','기본 계산 이름'],report.inventory.images.map(v=>[v.selector,v.alt===null?'alt 없음':v.alt===''?'빈 alt (문맥 검토)':v.alt,v.name])],['영상 · 오디오',['선택자','종류','자막 트랙'],report.inventory.media.map(v=>[v.selector,v.kind,JSON.stringify(v.tracks||[])])],['제목 구조',['수준','제목','선택자'],report.inventory.headings.map(v=>[v.level,v.name,v.selector])],['랜드마크',['역할 / 요소','이름','선택자'],report.inventory.landmarks.map(v=>[v.role,v.name,v.selector])],['프레임 (내부 미검사)',['제목','선택자','범위'],report.inventory.frames.map(v=>[v.title,v.selector,'내부 미검사'])]];
    for(const [title,headers,rows] of inventories){const section=el('section',undefined,'inventory-group');section.append(el('h3',`${title} · ${rows.length}`));section.append(rows.length?makeTable(headers,rows):el('p','수집된 대상 없음'));container.append(section);}
  }
  function renderFocus(){const c=$('focus-timeline');c.replaceChildren();$('focus-candidates').replaceChildren();
    if(!report?.focus.events.length){empty(c,'기록된 초점 이동이 없습니다.','실제 페이지 또는 데모에서 초점 기록을 실행하세요. DOM 순서로 가상 기록을 만들지 않습니다.');}
    else{c.append(el('p',safeString(report.focus.note),'hint'));for(const e of report.focus.events){
      const card=el('article',undefined,'timeline-step'),heading=el('h2');heading.append(el('span',String(e.sequence),'number'),document.createTextNode(`${e.via||'DOM focus'} · ${e.name||'이름 없음'}`));card.append(heading,el('code',safeString(e.selector,1500)),el('p',`${e.elapsedMs||0}ms · ${e.tag||''}`));
      if(Array.isArray(e.flags)&&e.flags.length)card.append(el('p',e.flags.join(' / '),'flags'));
      const samples=Array.isArray(e.samples)?e.samples:[];
      for(const s of samples){card.append(el('p',`${s.delayMs}ms 후 · 크기 ${s.rect?.width} × ${s.rect?.height} · 가로 넘침 ${s.overflowPx??0}px · 표본 가림 ${s.cover?.covered??0}/${s.cover?.total??0}`));if(s.changes?.length){const d=el('details');d.append(el('summary','위치·크기 변화 근거'),makeTable(['선택자','Δx','Δy','Δ너비','Δ높이'],s.changes.map(v=>[v.selector,v.dx,v.dy,v.dw,v.dh])));card.append(d);}}
      c.append(card);
    }}
    StudioEvidenceUI.renderReader(c,report);
    if(report)$('focus-candidates').append(makeTable(['DOM 순서','이름','요소','tabindex','선택자'],report.inventory.focusables.map(v=>[v.domIndex,v.name,v.tag,v.tabindex,v.selector])));
  }
  function ensureReport(){if(!report){report={schemaVersion:1,generator:'accessibility-studio',version:CFG.version,id:uuid(),createdAt:new Date().toISOString(),page:{title:'수동 검토',url:'검사 대상 미지정',mode:'manual',state:'수동 검토'},engine:{builtin:null,axe:null},findings:[],checks:[],inventory:{images:[],media:[],headings:[],landmarks:[],focusables:[],frames:[]},focus:{events:[],layoutShifts:[]},limitations:['수동 검토만 작성했습니다. 자동 검사는 실행하지 않았습니다.'],manual:{}};}}
  function renderManual(){const c=$('manual-list');c.replaceChildren();$('reviewer').value=report?.reviewer||'';
    for(const item of S){const row=el('article',undefined,'manual-row'),desc=el('div'),heading=el('h2');heading.append(el('span',item.id,'manual-id'),document.createTextNode(item.title));desc.append(heading,el('p',item.guide));
      const label=el('label','검토 결과'),select=el('select');select.id='manual-'+item.id;select.setAttribute('aria-label',item.title+' 검토 결과');for(const [value,name] of [['pending','미검토'],['pass','통과 (수동)'],['fail','실패 (수동)'],['na','해당 없음']]){const option=el('option',name);option.value=value;select.append(option);}select.value=report?.manual[item.id]?.status||'pending';label.append(select);
      const evidenceLabel=el('label','판단 근거 / 재현 순서','evidence'),area=el('textarea');area.rows=2;area.maxLength=4000;area.value=report?.manual[item.id]?.evidence||'';area.setAttribute('aria-label',item.title+' 판단 근거');evidenceLabel.append(area);
      const update=()=>{ensureReport();report.manual[item.id]={status:select.value,evidence:area.value};persist();renderStats();};select.addEventListener('change',update);area.addEventListener('input',update);row.append(desc,label,evidenceLabel);c.append(row);
    }
  }
  function download(content,type,name){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function reportHTML(){
    if(!report)return '';
    const findings=report.findings.map(f=>StudioEvidenceUI.exportFinding(f)).join('');
    const manual=S.map(s=>{const m=report.manual[s.id]||{};return `<tr><th>${esc(s.id+' '+s.title)}</th><td>${esc({pass:'통과 (수동)',fail:'실패 (수동)',na:'해당 없음',pending:'미검토'}[m.status]||'미검토')}</td><td>${esc(m.evidence)}</td></tr>`;}).join('');
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>접근성 검사 보고서</title><style>body{font:14px/1.8 Arial,'Malgun Gothic',sans-serif;max-width:1050px;margin:40px auto;padding:20px;color:#1c3329}article{border:1px solid #bccdc2;padding:20px;margin:15px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f5f2;padding:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bccdc2;padding:10px;text-align:left}h1{font-size:28px}h2{margin-top:35px}@media print{article{break-inside:avoid}body{margin:0}}</style></head><body><h1>접근성 검사 보고서</h1><p>${esc(report.page.title)} · ${esc(report.page.url)}</p><p>${esc(report.createdAt)} · ${esc(report.page.state)} · ${report.engine?.axe?'axe-core '+esc(report.engine.axe):'axe 미실행'}</p><p>자동 검사 오류 ${report.findings.filter(f=>f.status==='error').length}건 / 검토 필요 ${report.findings.filter(f=>f.status==='review').length}건. 법적 준수·인증 결과가 아닙니다.</p><h2>미검사 및 한계</h2>${report.limitations.map(n=>'<p>'+esc(n)+'</p>').join('')}<h2>자동 검사 결과</h2>${findings||'<p>발견 없음. 전체 준수를 의미하지 않습니다.</p>'}<h2>실제 스크린리더 실행 기록</h2><pre>${esc(JSON.stringify(report.screenReader||{status:'not-run'},null,2))}</pre><h2>실제 DOM 초점 기록</h2><pre>${esc(JSON.stringify(report.focus,null,2))}</pre><h2>KWCAG 2.2 수동 검토</h2><p>검토자 / 환경: ${esc(report.reviewer)}</p><table><thead><tr><th>항목</th><th>판단</th><th>근거</th></tr></thead><tbody>${manual}</tbody></table></body></html>`;
  }
  async function readReport(file){if(!file)throw new Error('파일을 선택하세요.');if(file.size>CFG.maxReportBytes)throw new Error('10 MB 이하의 보고서만 열 수 있습니다.');return validateReport(JSON.parse(await file.text()));}
  async function getScripts(){if(!scriptCache)scriptCache=Promise.all(['core.js','evidence.js','focus.js','vendor-axe.js','player.js','preview-runtime.js'].map(async file=>{const r=await fetch('assets/'+file);if(!r.ok)throw new Error('검사 엔진 파일을 읽지 못했습니다. 로컬 서버 또는 게시된 웹에서 실행하세요.');return r.text();})).catch(e=>{scriptCache=null;throw e;});return scriptCache;}
  function sanitizeSource(source){
    // Inert parsing; never attach the source DOM to the host document.
    const parsePolicy="<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; base-uri 'none'; form-action 'none'\">";
    const parsed=new DOMParser().parseFromString(parsePolicy+source,'text/html');let removed=0;
    parsed.querySelectorAll('script,base,link,meta[http-equiv],object,embed').forEach(n=>{n.remove();removed++;});
    for(const n of parsed.querySelectorAll('*'))for(const attr of [...n.attributes]){
      const key=attr.name.toLowerCase();
      if(key.startsWith('on')||['srcdoc','action','formaction','ping','target','nonce','integrity','crossorigin'].includes(key)){n.removeAttribute(attr.name);removed++;}
      if(['src','srcset','poster','background','xlink:href','href'].includes(key)){
        const allowed=key==='href'&&attr.value.startsWith('#')||key==='src'&&n.tagName==='IMG'&&/^data:image\/(png|jpeg|gif|webp|avif);base64,/i.test(attr.value);
        if(!allowed){n.removeAttribute(attr.name);removed++;}
      }
    }
    return {parsed,removed};
  }
  async function runSource(source,mode='source'){
    if(!source.trim())throw new Error('검사할 HTML을 입력하세요.');if(new Blob([source]).size>CFG.maxInputBytes)throw new Error('HTML 입력은 2 MB 이하로 제한합니다.');
    if(pendingRefresh)pendingRefresh.reject(new Error('새 워크스페이스를 열어 이전 재검사를 취소했습니다.'));
    const scripts=await getScripts(),{parsed,removed}=sanitizeSource(source),channel=uuid(),nonce=uuid().replace(/-/g,'');previewChannel=channel;previewReportId=null;previewRecording=false;
    $('record-preview').textContent='초점 기록 시작';$('preview-card').hidden=false;$('preview').style.width=$('viewport-width').value+'px';
    const policy=`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; media-src 'none'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';`;
    const meta=parsed.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content=policy;parsed.head.prepend(meta);
    const setup=`\nStudioPreview.connect({channel:${JSON.stringify(channel)},mode:${JSON.stringify(mode)},limitation:${JSON.stringify('원본 스크립트·외부 리소스를 차단한 HTML 검사입니다. 제거한 실행·외부 연결 항목 '+removed+'개. 실사이트와 레이아웃·동작이 다를 수 있습니다.')}});`;
    const trusted=parsed.createElement('script');trusted.setAttribute('nonce',nonce);trusted.textContent=scripts.join('\n')+setup;parsed.body.append(trusted);
    // outerHTML escapes script text inconsistently, so protect every closing script token in trusted code.
    const html='<!doctype html>'+parsed.documentElement.outerHTML;
    const safeCode=trusted.textContent.replace(/<\/script/gi,'<\\/script');
    const start=html.lastIndexOf('<script nonce="'+nonce+'">');
    const final=start>=0?html.slice(0,start)+`<script nonce="${nonce}">${safeCode}<\/script></body></html>`:html;
    $('preview').srcdoc=final;toast('격리된 HTML을 실제로 검사하고 있습니다.');
  }
  window.addEventListener('message',e=>{
    if(e.source!==$('preview').contentWindow||e.data?.channel!==previewChannel)return;
    const {type,payload,requestId}=e.data;
    if(requestId&&(!pendingRefresh||pendingRefresh.id!==requestId))return;
    if(type==='report'){
      if(requestId&&report?.id!==pendingRefresh.reportId){pendingRefresh.reject(new Error('다른 보고서가 열려 재검사 결과를 적용하지 않았습니다.'));return;}
      try{previewReportId=payload.id;loadReport(payload);if(requestId)pendingRefresh.resolve(report);}catch(err){if(requestId)pendingRefresh.reject(err);else toast(err.message);}
    }
    if(type==='playback'&&payload?.started){previewRecording=false;$('record-preview').textContent='초점 기록 시작';}
    if(type==='playback'&&report?.id===previewReportId)window.dispatchEvent(new CustomEvent('studio:playback',{detail:payload}));
    if(type==='error'){if(requestId)pendingRefresh.reject(new Error(payload));else toast('검사 실패: '+payload);}
    if(type==='focus'&&report&&report.id===previewReportId){report.focus=payload;persist();renderStats();renderFocus();$('preview-note').textContent=`실제 초점 이벤트 ${payload.events?.length||0}개 기록. 완료 후 중지하고 초점 · 레이아웃에서 확인하세요.`;}
    if(type==='started'){previewRecording=true;$('record-preview').textContent='초점 기록 중지';toast('미리보기 안을 선택한 뒤 Tab / Shift+Tab으로 이동하세요.');}
    if(type==='stopped'){previewRecording=false;$('record-preview').textContent='초점 기록 시작';location.hash='focus';}
    if(type==='located')toast('미리보기의 해당 요소로 스크롤했습니다. 초점을 강제로 이동하지 않았습니다.');
  });
  $('record-preview').addEventListener('click',()=>{if(previewChannel)$('preview').contentWindow.postMessage({channel:previewChannel,type:previewRecording?'stop':'start'},'*');});
  $('run-source').addEventListener('click',async()=>{const b=$('run-source');b.disabled=true;try{await runSource($('html-source').value);}catch(e){toast(e.message);}finally{b.disabled=false;}});
  $('run-demo').addEventListener('click',async()=>{const b=$('run-demo');b.disabled=true;try{const r=await fetch('demo.html');if(!r.ok)throw new Error('데모를 불러오지 못했습니다. 게시된 웹 또는 로컬 서버에서 실행하세요.');const source=await r.text();$('html-source').value=source;await runSource(source,'demo');}catch(e){toast(e.message);}finally{b.disabled=false;}});
  $('open-site-form').addEventListener('submit',e=>{e.preventDefault();try{const u=new URL($('target-url').value);if(!/^https?:$/.test(u.protocol))throw new Error('http 또는 https 주소만 사용할 수 있습니다.');window.open(u.href,'_blank','noopener,noreferrer');toast('대상 탭에서 확장 프로그램을 실행하세요. URL을 열기만 했으며 아직 검사하지 않았습니다.');}catch(err){toast(err.message);}});
  $('report-file').addEventListener('change',async e=>{try{loadReport(await readReport(e.target.files[0]));}catch(err){toast('보고서 불러오기 실패: '+err.message);}e.target.value='';});
  $('compare-report').addEventListener('click',()=>{if(!report){toast('현재 보고서를 먼저 여세요.');return;}$('compare-file').click();});
  $('compare-file').addEventListener('change',async e=>{try{const previous=await readReport(e.target.files[0]);const key=f=>f.source+'|'+f.ruleId+'|'+f.selector+'|'+f.status;const before=new Set(previous.findings.map(key)),after=new Set(report.findings.map(key));const added=[...after].filter(k=>!before.has(k)).length,removed=[...before].filter(k=>!after.has(k)).length;const same=previous.page.url===report.page.url&&previous.page.state===report.page.state&&previous.engine?.axe===report.engine?.axe&&JSON.stringify(previous.page.viewport)===JSON.stringify(report.page.viewport);$('compare-summary').hidden=false;$('compare-summary').textContent=`새로 발견 ${added}건 / 이번에 미발견 ${removed}건. ${same?'같은 URL·상태·뷰포트·axe 버전입니다.':'URL·상태·뷰포트·엔진 조건이 달라 직접적인 개선 판정은 불가능합니다.'} 선택자 변경·검사 범위 변경으로 미발견될 수 있으므로 수정 완료를 확정하지 않습니다.`;}catch(err){toast(err.message);}e.target.value='';});
  for(const id of ['status-filter','group-filter'])$(id).addEventListener('change',renderFindings);$('finding-search').addEventListener('input',renderFindings);
  $('export-json').addEventListener('click',()=>{if(report)download(JSON.stringify(report,null,2),'application/json','accessibility-report-'+report.id.slice(0,8)+'.json');});
  $('export-html').addEventListener('click',()=>{if(report)download(reportHTML(),'text/html','accessibility-report.html');});
  $('reviewer').addEventListener('input',()=>{ensureReport();report.reviewer=$('reviewer').value;persist();renderStats();});
  $('clear-session').addEventListener('click',()=>{try{sessionStorage.removeItem('a11y-studio-report');}catch{}report=null;renderAll();window.dispatchEvent(new Event('studio:report'));location.hash='inspect';toast('이 페이지의 보고서를 지웠습니다.');});
  async function refreshReport(){
    if(!report)throw new Error('먼저 검사를 실행하세요.');
    const previousId=report.id;
    if(window.chrome?.runtime?.id&&report.sourceTab){
      const result=await chrome.runtime.sendMessage({action:'refresh-report',sourceTab:report.sourceTab,reportId:report.id,state:report.page.state});
      if(!result?.ok)throw new Error(result?.error||'원본 탭의 응답이 없습니다.');
      if(report?.id!==previousId)throw new Error('다른 보고서가 열려 재검사 결과를 적용하지 않았습니다.');
      loadReport(result.report);return report;
    }
    if(!previewChannel||previewReportId!==report.id)throw new Error('현재 DOM에 연결되지 않은 보고서입니다. 원본 사이트의 확장에서 다시 검사하거나 HTML 검사로 새 워크스페이스를 여세요. 저장된 마크업으로 대신 검사하지 않습니다.');
    if(pendingRefresh)throw new Error('이미 새로고침 중입니다.');
    return new Promise((resolve,reject)=>{
      const id=uuid(),finish=fn=>value=>{if(pendingRefresh?.id===id){clearTimeout(pendingRefresh.timer);pendingRefresh=null;}fn(value);};
      pendingRefresh={id,reportId:previousId,resolve:finish(resolve),reject:finish(reject),timer:setTimeout(()=>{pendingRefresh?.reject(new Error('현재 DOM 재검사 응답이 없습니다. 기존 결과를 유지합니다.'));},45000)};
      previewRecording=false;$('record-preview').textContent='초점 기록 시작';
      $('preview').contentWindow.postMessage({channel:previewChannel,type:'refresh',requestId:id},'*');
    });
  }
  function updateFocus(focus,id){if(report?.id!==id)return;report.focus=focus;persist();renderStats();renderFocus();}
  window.StudioApp=Object.freeze({loadReport,getReport:()=>report,save:persist,validateReport,reportHTML,showView,runSource,refreshReport,updateFocus,toast,
    getPreview:()=>({channel:previewChannel,reportId:previewReportId}),
    sendPreview:message=>{if(previewChannel&&report?.id===previewReportId)$('preview').contentWindow.postMessage({channel:previewChannel,...message},'*');}});
  try{const saved=sessionStorage.getItem('a11y-studio-report');if(saved)report=validateReport(JSON.parse(saved));}catch{try{sessionStorage.removeItem('a11y-studio-report');}catch{}}
  renderAll();showView(location.hash.slice(1));
})();
