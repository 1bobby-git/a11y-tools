/* Render evidence as inert text and network-isolated previews, including imported reports. */
(function(g){
'use strict';
const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text??'');if(cls)n.className=cls;return n;};
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const text=v=>typeof v==='string'?v:'';
const validImage=v=>typeof v==='string'&&v.length<6000000&&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(v);
function safePreview(source){
 const policy="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; media-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
 const doc=new DOMParser().parseFromString('<meta http-equiv="Content-Security-Policy" content="'+policy+'">'+text(source),'text/html');
 doc.querySelectorAll('script,style,link,base,meta,iframe,object,embed,svg,math,template').forEach(n=>n.remove());
 for(const n of doc.querySelectorAll('*'))for(const a of [...n.attributes]){
  const key=a.name.toLowerCase();
  if(key.startsWith('on')||['src','srcset','poster','href','xlink:href','srcdoc','action','formaction','target','autofocus','contenteditable'].includes(key))n.removeAttribute(a.name);
  if(key==='style'&&/url\s*\(|image-set\s*\(|expression\s*\(/i.test(a.value))n.removeAttribute('style');
 }
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><style>body{margin:16px;font:14px/1.5 sans-serif;overflow-wrap:anywhere}body>*{max-width:100%!important}input,textarea{max-width:95%}</style></head><body>'+doc.body.innerHTML+'</body></html>';
}
function codeBox(title,code){const box=make('section',undefined,'evidence-code');box.append(make('h4',title),make('pre',text(code)));const b=make('button','코드 복사','button secondary');b.type='button';b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text(code));b.textContent='복사했습니다.';}catch{b.textContent='복사 불가: 위 코드를 선택해 복사하세요.';}});box.append(b);return box;}
function renderFinding(body,f,report,locate){
 const guide=f.guidance||g.StudioEvidence.guide(f), nodes=Array.isArray(f.nodes)?f.nodes:[];
 if(f.originalTitle)body.append(make('p','axe 원문: '+f.originalTitle,'hint'));
 body.append(make('h3','왜 문제인가요?'),make('p',f.impactExplanation||guide.impact),make('p',f.detail));
 const count=f.totalNodes??nodes.length;
 body.append(make('h3',f.duplicateId?`같은 트리의 중복 대상 전체 · ${count}개`:`문제 대상 · ${count}개`));
 if(f.duplicateId)body.append(make('p',`트리: ${f.root} / 첫 번째 요소도 포함합니다. 서로 다른 Shadow DOM은 별도로 검사합니다.`,'hint'));
 if(!nodes.length)body.append(codeBox('대상 마크업',f.html||'원본 노드 정보를 가져오지 못했습니다. 재검사하세요.'));
 nodes.forEach((node,i)=>{
  const box=make('article',undefined,'evidence-node');box.append(make('h4',`대상 ${i+1} / ${count}${node.hidden?' · 숨김 상태':''}`),make('code',node.selector,'evidence-selector'));
  const columns=make('div',undefined,'evidence-columns');columns.append(codeBox('현재 마크업',node.html));
  const visual=make('section',undefined,'evidence-visual');visual.append(make('h4','문제 영역 미리보기'));
  const p=make('p',node.preview?.note||'격리 재구성 미리보기. 원본 화면 캡처가 아닙니다.','hint');visual.append(p);
  const previewButton=make('button','마크업 미리보기 열기','button secondary');previewButton.type='button';
  previewButton.addEventListener('click',()=>{const frame=make('iframe');frame.setAttribute('sandbox','');frame.setAttribute('referrerpolicy','no-referrer');frame.title=`대상 ${i+1}의 격리 재구성 미리보기`;frame.srcdoc=safePreview(node.preview?.html||node.html);visual.append(frame);previewButton.remove();});visual.append(previewButton);
  if(validImage(node.screenshot?.dataUrl)){const img=make('img');img.src=node.screenshot.dataUrl;img.alt=`대상 ${i+1}의 실제 화면 캡처`;visual.append(make('p','실제 화면 캡처 · '+text(node.screenshot.capturedAt)),img);}
  columns.append(visual);box.append(columns);
  if(node.truncated)box.append(make('p','큰 요소라 마크업이 64,000자에서 잘렸습니다. 전체 원본은 대상 페이지에서 확인하세요.','flags'));
  const actions=make('div',undefined,'card-actions');
  if(locate){const b=make('button',`대상 ${i+1} 위치 보기`,'button secondary');b.type='button';b.addEventListener('click',()=>locate(node.selector));actions.append(b);}
  if(g.chrome?.runtime?.id&&report.sourceTab){
   const b=make('button','원본 위치 표시','button secondary');b.type='button';b.addEventListener('click',()=>liveAction('locate-evidence',node,report,b));actions.append(b);
   const capture=make('button','원본 영역 캡처','button secondary');capture.type='button';capture.addEventListener('click',()=>{
    if(!g.confirm('이 영역의 실제 화면을 캡처해 보고서에 저장합니다. 입력 필드는 가리지만 화면 텍스트에는 개인정보가 남을 수 있습니다. 계속하시겠습니까?'))return;
    liveAction('capture-evidence',node,report,capture);
   });actions.append(capture);
  }
  box.append(actions);
  if(node.after)box.append(codeBox('고유 ID 수정 예시 · 실제 페이지에는 자동 적용하지 않음',node.after));
  body.append(box);
 });
 if(Array.isArray(f.references)&&f.references.length){
  const box=make('details',undefined,'evidence-references');box.append(make('summary',`함께 수정할 연결 속성 · ${f.references.length}개`),make('p','다음 참조의 의도한 대상을 확인한 뒤 새 ID로 바꾸세요. 여러 후보 중 임의로 연결하지 않습니다.'));
  for(const ref of f.references){box.append(make('p',`${ref.attribute}="${ref.value}" · ${ref.selector}`),codeBox('연결된 마크업',ref.html));}
  body.append(box);
 }
 body.append(make('h3','어떻게 수정하나요?'),make('p',f.duplicateId?'요소마다 다른 ID를 지정하고 연결 속성도 함께 갱신하세요. 아래 예시의 레이블 대상은 의미를 확인한 뒤 선택해야 합니다.':guide.direction));
 body.append(codeBox(f.duplicateId?'전체 수정 예시':'참고 수정 예시 · 실제 기능에 맞게 적용',f.duplicateId?f.fix:guide.example||f.fix));
 body.append(make('h3','수정 후 확인'),make('p',f.verification||guide.verify));
}
async function liveAction(action,node,report,button){
 button.disabled=true;try{const result=await chrome.runtime.sendMessage({action,sourceTab:report.sourceTab,selector:node.selector});if(!result?.ok)throw new Error(result?.error||'원본 페이지 응답이 없습니다.');
  if(result.screenshot){node.screenshot=result.screenshot;g.StudioApp.save();g.StudioApp.loadReport(report,false);}else button.textContent='원본 위치를 표시했습니다.';
 }catch(e){button.textContent=e.message;}finally{button.disabled=false;}
}
function renderReader(container,report){
 if(!report)return;
 const section=make('section',undefined,'card reader-evidence'),sr=report.screenReader||{status:'not-run'};
 section.append(make('h2','실제 스크린리더 검사'),make('p',sr.status==='recorded'?`${sr.engine||'엔진 미기록'} ${sr.engineVersion||''} · 발화 기록 수집됨 · 접근성 합격 판정 아님`:sr.status==='partial'?'일부 기록만 수집됨 · 완료되지 않음':sr.status==='failed'?'실행 실패 · 검사 완료가 아님':'미실행 · DOM/axe/Tab 검사와 별개','flags'),make('p',sr.note||'Windows NVDA 또는 macOS VoiceOver 로컬 실행 결과를 JSON으로 가져오세요.'));
 if(sr.environment)section.append(make('p',JSON.stringify(sr.environment)));
 if(sr.error)section.append(make('p',sr.error,'flags'));
 for(const step of Array.isArray(sr.steps)?sr.steps:[]){
  const entry=make('details',undefined,'reader-step');entry.append(make('summary',`${step.sequence}. ${step.command} · ${step.assertion?.status||'관찰 기록'}`),make('p','발화는 실제 엔진이 반환한 기록입니다. 아래 DOM 초점은 가상 커서 위치와 같다고 볼 수 없습니다.'),make('pre',Array.isArray(step.speech)?step.speech.join('\n'):''));
  if(step.assertion)entry.append(make('p','기대 발화: '+text(step.assertion.expected)));
  if(step.domFocus)entry.append(make('code','동시점 DOM 초점: '+text(step.domFocus.selector)));
  if(Array.isArray(step.layoutChanges)&&step.layoutChanges.length)entry.append(make('pre',JSON.stringify(step.layoutChanges,null,2)));
  section.append(entry);
 }
 if(report.accessibilityTree){const ax=make('details');ax.append(make('summary','브라우저 접근성 트리 · 실제 스크린리더 발화와는 별개'),make('p',report.accessibilityTree.note),make('pre',JSON.stringify(report.accessibilityTree.nodes||[],null,2)));section.append(ax);}
 const link=make('a','실제 스크린리더 실행 안내 (새 창)');link.href='https://github.com/1bobby-git/a11y-tools/blob/main/SCREEN-READER.md';link.target='_blank';link.rel='noopener noreferrer';section.append(link);container.prepend(section);
}
function exportFinding(f){
 const nodes=Array.isArray(f.nodes)?f.nodes:[];
 return '<article><h3>'+esc(f.title)+'</h3><p>'+esc(f.detail)+'</p>'+(nodes.length?nodes.map((n,i)=>'<h4>대상 '+(i+1)+'</h4><p>'+esc(n.selector)+'</p><pre>'+esc(n.html)+'</pre>'+(n.truncated?'<p>마크업 잘림: 원본 확인 필요</p>':'')+(validImage(n.screenshot?.dataUrl)?'<img alt="실제 영역 캡처" style="max-width:100%" src="'+n.screenshot.dataUrl+'">':'')).join(''):'<pre>'+esc(f.html)+'</pre>')+
  (f.references||[]).map(r=>'<h4>연결 속성 '+esc(r.attribute)+'</h4><pre>'+esc(r.html)+'</pre>').join('')+'<h4>수정 방향</h4><p>'+esc(f.guidance?.direction)+'</p><pre>'+esc(f.fix)+'</pre><pre>'+esc(f.guidance?.example)+'</pre></article>';
}
g.StudioEvidenceUI=Object.freeze({renderFinding,renderReader,exportFinding,safePreview});
})(globalThis);
