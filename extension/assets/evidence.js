/* Evidence adapter. Original rule engine is retained; all output is inspection evidence, not certification. */
(function(g){
'use strict';
const base=g.StudioAudit;
if(!base || base.evidenceVersion==='0.2.0')return;
const VERSION='0.2.0', LIMIT=64000;
let capturedNodes=new Map();
const escape=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const css=v=>g.CSS?.escape?g.CSS.escape(v):String(v).replace(/[^\w-]/g,'\\$&');
function roots(doc){const result=[doc];for(let i=0;i<result.length;i++)for(const n of result[i].querySelectorAll('*'))if(n.shadowRoot)result.push(n.shadowRoot);return result;}
// An ID is used only when unique in its own root. Duplicate ancestors never shorten a path.
function selector(el){
 if(!el?.tagName)return 'document';
 const root=el.getRootNode(), parts=[];
 for(let n=el;n?.tagName;n=n.parentElement){
  let part=n.localName;
  if(n.id&&root.querySelectorAll('#'+css(n.id)).length===1){parts.unshift(part+'#'+css(n.id));break;}
  if(n.id)part+='#'+css(n.id);
  const peers=Array.from(n.parentNode?.children||[]).filter(s=>s.localName===n.localName);
  if(peers.length>1)part+=`:nth-of-type(${peers.indexOf(n)+1})`;
  parts.unshift(part);
 }
 return (root.host?selector(root.host)+' >>> ':'')+parts.join(' > ');
}
function matches(path,doc){
 try{let contexts=[doc];const parts=String(path).split(' >>> ');for(let i=0;i<parts.length;i++){
  const found=contexts.flatMap(r=>Array.from(r.querySelectorAll(parts[i])));
  if(i===parts.length-1)return found;contexts=found.map(n=>n.shadowRoot).filter(Boolean);
 }}catch{}return [];
}
function safeURL(v){
 if(/^#[^\s]*$/.test(v))return v;
 try{const u=new URL(v,'https://relative.invalid');if(!/^https?:$/.test(u.protocol))return '[URL 생략]';return (u.origin==='https://relative.invalid'?'':u.origin)+u.pathname;}catch{return '[URL 생략]';}
}
// Preserve semantic markup and text. No scripts, inline handlers, live form values or secret data attributes.
function cloneForEvidence(el){
 const clone=el.cloneNode(true), list=[clone,...clone.querySelectorAll('*')];
 for(const n of list){
  if(/^(SCRIPT|STYLE|TEMPLATE|OBJECT|EMBED|LINK|META|BASE)$/i.test(n.tagName)){
   if(n===clone){n.replaceChildren();for(const a of [...n.attributes])n.removeAttribute(a.name);}else n.remove();continue;
  }
  for(const a of [...n.attributes]){
   const k=a.name.toLowerCase();
   if(k.startsWith('on')||['srcdoc','nonce','integrity','ping','action','formaction'].includes(k)){n.removeAttribute(a.name);continue;}
   if(k.startsWith('data-')||/token|secret|password|authorization|cookie/i.test(k)){n.setAttribute(a.name,'[비공개]');continue;}
   if(k==='value'){n.setAttribute(a.name,'[입력값 가림]');continue;}
   if(['src','srcset','poster','href','xlink:href'].includes(k))n.setAttribute(a.name,k==='srcset'?'[리소스 목록 생략]':safeURL(a.value));
   if(k==='style'&&/url\s*\(|image-set\s*\(|expression\s*\(/i.test(a.value))n.removeAttribute('style');
  }
  if(/^(TEXTAREA)$/i.test(n.tagName)||n.hasAttribute('contenteditable'))n.textContent='[입력 내용 가림]';
 }
 return clone;
}
function markup(el){if(!el?.tagName)return '';return cloneForEvidence(el).outerHTML;}
function redactHTML(source){
 const d=new DOMParser().parseFromString('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">'+String(source||''),'text/html');
 return Array.from(d.body.children).map(markup).join('\n').slice(0,LIMIT);
}
function originalNode(path){const saved=capturedNodes.get(path);if(!saved||!saved.el.isConnected||selector(saved.el)!==path||markup(saved.el).slice(0,LIMIT)!==saved.html)throw new Error('대상 마크업이 변경되었습니다. 같은 화면에서 다시 검사하세요.');return saved.el;}

const visualProps=['display','position','box-sizing','font-family','font-size','font-weight','line-height','color','background-color','border','border-radius','padding','margin','width','height','max-width','min-height','text-align','white-space','flex-direction','gap','align-items'];
function preview(el){
 if(!el?.ownerDocument.defaultView)return {html:markup(el),note:'DOM 구조 미리보기. 외부 리소스·동작 미포함.'};
 const original=el, clone=cloneForEvidence(original), from=[original,...original.querySelectorAll('*')], to=[clone,...clone.querySelectorAll('*')];
 // Match by path rather than index: removed scripts must not shift element/style correspondence.
 const walk=(a,b,depth=0)=>{if(depth>12)return;const style=a.ownerDocument.defaultView.getComputedStyle(a);for(const key of visualProps){const v=style.getPropertyValue(key);if(!/url\s*\(|image-set\s*\(/i.test(v))b.style.setProperty(key,v);}
  b.style.setProperty('position','static');
  for(const child of b.children){const candidates=Array.from(a.children).filter(n=>n.localName===child.localName);const siblings=Array.from(b.children).filter(n=>n.localName===child.localName);const source=candidates[siblings.indexOf(child)];if(source)walk(source,child,depth+1);}
 };
 if(from.length<180&&to.length)walk(original,clone);
 clone.style.setProperty('outline','2px solid #be3030');clone.style.setProperty('outline-offset','3px');
 return {html:clone.outerHTML.slice(0,LIMIT),note:'격리 재구성 미리보기입니다. 이미지·외부 CSS·스크립트는 제외되며 원본 화면 캡처가 아닙니다.'};
}
function nodeEvidence(el){
 const code=markup(el), p=preview(el), r=el.ownerDocument.defaultView?base.rect(el):null;
 return {selector:selector(el),html:code.slice(0,LIMIT),truncated:code.length>LIMIT,tag:el.localName,name:base.name(el),hidden:base.isHidden(el),rect:r,preview:p};
}
function referenceList(root,id){
 const refs=[], attrs=['for','list','form','headers','aria-labelledby','aria-describedby','aria-controls','aria-owns','aria-activedescendant','aria-details','aria-errormessage','aria-flowto','href','xlink:href'];
 for(const el of root.querySelectorAll('*'))for(const attr of attrs){const value=el.getAttribute(attr);if(!value)continue;
  let ids=value.trim().split(/\s+/);if(/href$/.test(attr)){if(!value.startsWith('#'))continue;try{ids=[decodeURIComponent(value.slice(1))];}catch{ids=[value.slice(1)];}}
  if(ids.includes(id))refs.push({...nodeEvidence(el),attribute:attr,value});
 }return refs;
}
function duplicateGroups(doc){
 const findings=[];
 roots(doc).forEach((root,ri)=>{
  const byId=new Map();for(const n of root.querySelectorAll('[id]')){if(!n.id)continue;if(!byId.has(n.id))byId.set(n.id,[]);byId.get(n.id).push(n);}
  const used=new Set(byId.keys());
  for(const [id,elements] of byId){if(elements.length<2)continue;
   const proposed=elements.map(()=>{let n=1;while(used.has(id+'-'+n))n++;const name=id+'-'+n;used.add(name);return name;});
   const nodes=elements.map((el,i)=>{const e=nodeEvidence(el), clone=cloneForEvidence(el);clone.id=proposed[i];return {...e,proposedId:proposed[i],after:clone.outerHTML.slice(0,LIMIT)};});
   const references=referenceList(root,id);
   findings.push({id:`duplicate-id:root-${ri}:${id}`,ruleId:'duplicate-id',source:'builtin',status:'error',group:'markup',
    title:`id="${id}" 중복: ${nodes.length}개 요소`,detail:`동일 ${root.host?'Shadow DOM':'문서'} 트리에서 ${nodes.length}개 요소가 같은 ID를 사용합니다. 첫 번째 요소를 포함한 전체 대상과 연결 속성을 아래에 표시합니다.`,
    selector:nodes[0].selector,html:nodes.map((n,i)=>`<!-- 대상 ${i+1} -->\n${n.html}`).join('\n\n'),kwcag:['8.1.1'],wcag:[],nodes,references,duplicateId:id,root:root.host?selector(root.host)+' >>>':'document',totalNodes:nodes.length,
    impactExplanation:'레이블·ARIA·앵커가 의도와 다른 요소에 연결될 수 있습니다. ID 중복만으로 모든 WCAG 항목의 실패를 확정하지는 않습니다.',
    fix:`1. 각 ID를 서로 다르게 지정합니다.\n2. for·ARIA·앵커가 어느 대상을 가리켜야 하는지 확인하고 함께 변경합니다.\n3. 키보드 이동과 실제 스크린리더 이름을 재확인합니다.\n\n${nodes.map((n,i)=>`<!-- 대상 ${i+1}: 제안 ID ${n.proposedId} -->\n${n.after}`).join('\n\n')}\n\n<!-- 참조 예시: 첫 번째 대상을 뜻하는 레이블인 경우에만 -->\n<label for="${escape(proposed[0])}">실제 입력 항목 이름</label>`,
    verification:'중복 ID 0건과 레이블·ARIA 연결을 재검사하세요. 연결 대상의 의미는 자동으로 선택하지 않습니다.'});
  }
 });return findings;
}
const guideGroups=[
 [['button-name','aria-command-name','control-name'],['조작 요소의 목적을 스크린리더가 이름으로 구별할 수 있어야 합니다.','기존 버튼 구조는 유지하고 기능을 나타내는 텍스트나 aria-label을 제공하세요. 장식 아이콘은 이름 계산에서 제외하세요.','<button type="button" aria-label="검색">\n  <span class="icon-search" aria-hidden="true"></span>\n</button>','Tab 이동 시 실제 버튼 목적과 일치하는 이름·역할이 읽히는지 확인하세요.']],
 [['link-name','area-alt'],['목적지가 없는 이름이나 빈 링크는 링크 목록에서 구별하기 어렵습니다.','링크의 목적을 표현하는 텍스트를 넣으세요. 실제 이동이면 a, 페이지 내 동작이면 button을 사용하세요.','<a href="/support">고객센터 안내</a>','링크만 따로 탐색해도 목적을 이해할 수 있는지 확인하세요.']],
 [['image-alt','image-quality','image-decoration','input-image-alt','svg-img-alt','role-img-alt'],['이미지가 전달하는 정보·기능을 동등하게 제공해야 합니다.','정보 이미지는 실제 내용을 설명하고 장식 이미지만 alt=""로 처리하세요. 텍스트가 많은 이미지는 별도 상세 설명을 연결하세요.','<!-- 정보 이미지: 실제 내용을 확인하여 작성 -->\n<img src="award.png" alt="실제 수상명, 수여 기관, 수상 연도">\n<!-- 순수 장식인 경우에만 -->\n<img src="decoration.svg" alt="">','대체텍스트가 이미지 속 정보와 같은 의미인지 직접 비교하세요. 빈 alt를 일괄 오류 처리하지 않습니다.']],
 [['label','select-name','aria-input-field-name','label-title-only','label-content-name-mismatch'],['입력 항목과 이름이 연결되지 않으면 무엇을 입력하는지 알기 어렵습니다.','고유 ID와 label의 for를 연결하세요. 보이는 레이블이 접근 가능한 이름에 포함되어야 합니다.','<label for="email">이메일</label>\n<input id="email" type="email" autocomplete="email">','레이블 클릭과 Tab 진입 시 올바른 항목의 이름이 읽히는지 확인하세요.']],
 [['color-contrast','color-contrast-enhanced'],['텍스트가 배경과 충분히 구별되지 않을 수 있습니다.','측정된 전경·배경·대비율을 확인하고 색을 조정하세요. 일반 텍스트 4.5:1, 큰 텍스트 3:1 기준을 적용하고 실제 배경에서 재측정하세요.','.text { color: #222; background-color: #fff; }\n/* 단순 불투명 배경 예시입니다. 이미지·투명도·상속 색상은 재측정이 필요합니다. */','현재 크기·굵기·배경 조합으로 다시 측정하세요. CSS 예시를 적용했다는 이유만으로 통과 처리하지 않습니다.']],
 [['document-title'],['탭과 방문 기록에서 현재 페이지를 식별할 수 있어야 합니다.','페이지 고유 목적을 문서 title에 제공하세요.','<title>회원가입 | 서비스명</title>','다른 페이지와 구별되는 제목인지 확인하세요.']],
 [['html-lang','html-has-lang','html-lang-valid'],['주 언어가 없거나 잘못되면 발음 언어 선택이 달라질 수 있습니다.','페이지의 실제 주 언어를 html의 lang에 지정하세요.','<html lang="ko">','외국어 부분의 lang 지정과 실제 발음을 함께 검토하세요.']],
 [['aria-refs','aria-valid-attr-value','aria-valid-attr','aria-required-attr','aria-roles'],['역할·상태·연결 정보가 유효하지 않으면 보조기술에 잘못 전달됩니다.','아래 실패 조건의 속성을 확인하세요. 참조 ID의 존재·유일성과 역할에 필요한 속성을 함께 수정하세요.','<button type="button" aria-expanded="false" aria-controls="help-panel">도움말</button>\n<div id="help-panel" hidden>도움말 내용</div>\n<!-- 실제 열기/닫기 코드에서 hidden과 aria-expanded를 함께 갱신 -->','오류 속성이 사라졌는지, 실제 열린 상태와 발화된 상태가 일치하는지 확인하세요.']],
 [['aria-hidden-focus','hidden-focus'],['키보드 초점은 들어가지만 스크린리더에는 숨겨진 요소가 생길 수 있습니다.','비활성 영역에는 상황에 맞게 hidden 또는 inert를 사용하세요. aria-hidden만으로 키보드 초점을 제거하지 마세요.','<section hidden>현재 비활성 콘텐츠</section>\n<!-- 모달 외부 비활성화 예시 -->\n<main inert>모달 뒤의 콘텐츠</main>','비활성 영역을 Tab으로 진입하지 않는지, 닫은 뒤 원래 조작 요소로 돌아오는지 확인하세요.']],
 [['tabindex','tabindex-positive','focus-order-semantics'],['양수 tabindex와 DOM·시각 순서 불일치가 이동 흐름을 바꿀 수 있습니다.','양수 tabindex 대신 DOM 순서를 의미 있는 순서로 구성하고 기본 버튼·링크를 사용하세요.','<button type="button">이전</button>\n<button type="button">다음</button>\n<!-- 양수 tabindex를 제거하고 DOM 순서부터 정리 -->','Tab·Shift+Tab과 스크린리더의 읽기 탐색을 별도로 기록해 비교하세요.']],
 [['heading-order','empty-heading','heading-level'],['제목 수준이 문서 구조를 제대로 설명하는지 확인해야 합니다.','보이는 크기는 CSS로 제어하고 h1~h6은 실제 문서 계층에 맞추세요.','<h1>서비스 소개</h1>\n<h2>주요 기능</h2>\n<h3>접근성 검사</h3>','제목 단위 탐색으로 전체 구조를 이해할 수 있는지 확인하세요. 수준 건너뜀만으로 일괄 실패하지 않습니다.']],
 [['video-caption','audio-caption','media-alternative','media-autoplay'],['영상·음성 정보에 접근할 수 있는 동등한 수단을 확인해야 합니다.','자막·대본·필요한 화면해설을 제공하고 정확성·동기화·플레이어 조작을 확인하세요.','<video controls>\n  <source src="video.mp4" type="video/mp4">\n  <track kind="captions" src="captions-ko.vtt" srclang="ko" label="한국어">\n</video>\n<a href="#transcript">영상 대본</a>\n<section id="transcript"><h2>영상 대본</h2>실제 영상의 내용</section>','트랙 존재는 자막 정확성의 증거가 아닙니다. 영상 내용과 직접 비교하세요.']],
 [['nested-interactive','custom-keyboard'],['중첩된 조작 요소나 마우스 전용 요소는 초점·역할 전달이 불명확할 수 있습니다.','가능하면 기본 HTML 버튼을 사용하고 링크·버튼을 서로 안에 넣지 마세요.','<a href="/product">상품 상세</a>\n<button type="button">즐겨찾기</button>','각 기능에 Tab으로 도달하고 Enter·Space로 의도한 동작만 실행되는지 확인하세요.']],
 [['th-has-data-cells','td-headers-attr','scope-attr-valid','table-structure','td-has-header'],['데이터 셀과 행·열 제목의 관계를 전달해야 합니다.','데이터 표라면 caption·th·scope를 제공하세요. 복잡한 표는 headers와 고유 ID의 연결도 검토하세요.','<table><caption>월별 이용 현황</caption>\n<thead><tr><th scope="col">월</th><th scope="col">이용 건수</th></tr></thead>\n<tbody><tr><th scope="row">9월</th><td>120건</td></tr></tbody></table>','스크린리더의 표 탐색에서 각 값의 행·열 제목이 정확히 읽히는지 확인하세요.']],
 [['frame-title','frame-tested'],['프레임의 목적과 내부 콘텐츠의 검사 여부를 구별해야 합니다.','iframe의 내용을 식별하는 title을 제공하고 내부 페이지는 별도로 검사하세요.','<iframe src="/map" title="매장 위치 지도"></iframe>','title 존재만으로 프레임 내부 접근성이 검증되지는 않습니다.']],
 [['region','landmark-one-main','landmark-unique','landmark-no-duplicate-main','landmarks'],['문서의 주요 영역을 보조기술로 구분하기 쉬워야 합니다.','주요 콘텐츠는 main에 두고 여러 nav는 서로 구별되는 이름을 제공하세요.','<nav aria-label="주 메뉴">…</nav>\n<main><h1>페이지 제목</h1>…</main>\n<nav aria-label="관련 문서">…</nav>','랜드마크 탐색으로 주 메뉴·본문·관련 영역을 구별할 수 있는지 확인하세요.']]
];
function guide(f){const entry=guideGroups.find(([ids])=>ids.includes(f.ruleId));if(entry){const [impact,direction,example,verify]=entry[1];return {impact,direction,example,verify,kind:'reference-example'};}
 return {impact:f.detail||'해당 요소의 규칙 실패 조건을 확인하세요.',direction:f.fix||'아래 실패 조건에 나온 속성·연결 대상을 확인하고 공식 규칙의 요구 사항에 맞게 수정하세요.',example:/</.test(f.fix||'')?f.fix:'',verify:f.verification||'동일한 화면 상태에서 재검사하고 실제 키보드·보조기술 동작을 확인하세요.',kind:'rule-evidence'};
}
async function run(doc=document,options={}){
 const report=await base.run(doc,options),duplicates=duplicateGroups(doc);
 const original=report.findings.filter(f=>f.ruleId!=='duplicate-id');
 for(const f of original){
  const els=matches(f.selector,doc);f.nodes=els.map(nodeEvidence);f.totalNodes=f.nodes.length;
  if(f.nodes.length){f.selector=f.nodes[0].selector;f.html=f.nodes.map((n,i)=>`<!-- 대상 ${i+1} -->\n${n.html}`).join('\n\n');}
  else if(f.source==='axe'){f.html=redactHTML(f.html)||'노드가 이동·제거되었거나 현재 DOM에서 해석할 수 없는 경로입니다. 같은 화면 상태에서 재검사하세요.';f.evidenceUnavailable=true;}
  f.guidance=guide(f);if(f.source==='axe'&&f.guidance.kind==='reference-example'){f.originalTitle=f.title;f.title=f.guidance.impact;}
 }
 report.findings=[...duplicates,...original].slice(0,2500);
 report.version=VERSION;report.engine.evidence=VERSION;
 for(const check of report.checks)if(check.id==='duplicate-id'){check.findings=duplicates.length;check.status=duplicates.length?'findings':check.tested?'no-findings':'not-applicable';}
 report.privacy={markup:'입력값·실행 코드·비공개 data 속성·URL 인증정보/쿼리는 제외합니다. 화면 텍스트·ID·ARIA에는 개인정보가 남을 수 있으므로 내보내기 전에 확인하세요.',transfer:'자동 외부 전송 없음',screenshot:'명시적으로 원본 캡처를 요청한 경우에만 추가'};
 report.screenReader={status:'not-run',engine:null,steps:[],note:'DOM/axe/Tab 기록은 실제 스크린리더 실행 결과가 아닙니다. Windows NVDA 또는 macOS VoiceOver 실행 보고서를 가져오세요.'};
 report.limitations.push('노드별 마크업은 64,000자로 제한합니다. 잘린 경우 대상 카드에 표시됩니다. 격리 미리보기는 원본 화면 캡처와 다릅니다.');
 if(report.findings.some(f=>f.nodes?.some(n=>n.truncated)))report.limitations.push('일부 큰 요소의 마크업이 잘렸습니다. 원본 요소에서 전체 소스를 확인해야 합니다.');
 capturedNodes=new Map();for(const f of report.findings)for(const n of f.nodes||[]){const el=matches(n.selector,doc)[0];if(el)capturedNodes.set(n.selector,{el,html:n.html});}
 return report;
}
g.StudioEvidence=Object.freeze({roots,selector,matches,markup,redactHTML,originalNode,nodeEvidence,duplicateGroups,guide});
g.StudioAudit=Object.freeze({...base,evidenceVersion:VERSION,run,selector,snippet:markup});
})(globalThis);
