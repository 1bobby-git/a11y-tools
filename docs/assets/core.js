/* Accessibility Studio: conservative, evidence-based DOM checks.
 * A missing finding is NOT conformance. Heuristics are always `review`.
 * No input values, cookies, storage or request bodies are collected.
 */
(function (g) {
  'use strict';
  if (g.StudioAudit?.version === '0.1.0') return;
  const version = '0.1.0';
  const trim = (v, max = 240) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const cleanURL = value => {
    try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u.origin + u.pathname : '로컬 또는 HTML 입력'; }
    catch { return 'HTML 입력'; }
  };
  const all = (root, selector) => {
    const found = Array.from(root.querySelectorAll(selector));
    // Open shadow roots are inspected; closed shadow roots are not observable.
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) found.push(...all(host.shadowRoot, selector));
    return found;
  };
  function parent(el) { return el.parentElement || el.getRootNode?.().host || null; }
  function isHidden(el) {
    for (let n = el; n && n.nodeType === 1; n = parent(n)) {
      if (n.hidden || n.hasAttribute('inert') || n.getAttribute('aria-hidden') === 'true') return true;
      if (n.ownerDocument.defaultView) {
        const s = n.ownerDocument.defaultView.getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return true;
      }
    }
    return false;
  }
  function selector(el) {
    if (!el || el.nodeType !== 1) return 'document';
    const esc = v => (g.CSS?.escape ? g.CSS.escape(v) : String(v).replace(/[^a-zA-Z0-9_-]/g, '\\$&'));
    const parts = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      let part = n.tagName.toLowerCase();
      if (n.id) { part += '#' + esc(n.id); parts.unshift(part); break; }
      const siblings = n.parentElement ? Array.from(n.parentElement.children).filter(s => s.tagName === n.tagName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(n) + 1})`;
      parts.unshift(part);
      if (parts.length >= 7) break;
    }
    const host = el.getRootNode?.().host;
    return (host ? selector(host) + ' >>> ' : '') + parts.join(' > ');
  }
  function find(selectorText, doc = document) {
    const parts = String(selectorText).split(' >>> ');
    let root = doc, el = null;
    try { for (let i = 0; i < parts.length; i++) { el = root.querySelector(parts[i]); if (!el) return null; root = el.shadowRoot; } }
    catch { return null; }
    return el;
  }
  function ref(el, id) { return el.getRootNode().getElementById?.(id) || null; }
  function text(el, depth = 0) {
    if (!el || depth > 12) return '';
    return trim(Array.from(el.childNodes || []).map(n => {
      if (n.nodeType === 3) return n.textContent;
      if (n.nodeType !== 1 || /^(SCRIPT|STYLE|TEMPLATE)$/.test(n.tagName) || isHidden(n)) return '';
      return n.tagName === 'IMG' ? (n.getAttribute('alt') || '') : text(n, depth + 1);
    }).join(' '));
  }
  function name(el) {
    const labelled = (el.getAttribute('aria-labelledby') || '').trim();
    if (labelled) {
      const value = labelled.split(/\s+/).map(id => ref(el, id)?.textContent || '').join(' ');
      if (trim(value)) return trim(value);
    }
    if (trim(el.getAttribute('aria-label'))) return trim(el.getAttribute('aria-label'));
    if (el.labels?.length) { const value = Array.from(el.labels).map(l => text(l)).join(' '); if (trim(value)) return trim(value); }
    if (el.tagName === 'IMG' || (el.tagName === 'INPUT' && el.type === 'image')) return trim(el.getAttribute('alt') || el.title);
    if (el.tagName === 'INPUT' && /^(submit|reset|button)$/.test(el.type)) return trim(el.getAttribute('value') || ({submit:'제출', reset:'초기화'}[el.type] || ''));
    if (el.tagName === 'SVG') return trim(el.querySelector('title')?.textContent || el.getAttribute('title'));
    // This fallback is not the full accessible-name algorithm. axe handles it when installed.
    return trim(text(el) || el.getAttribute('title'));
  }
  function snippet(el) {
    if (!el?.tagName) return '';
    const allowed = /^(id|class|role|alt|title|lang|type|tabindex|scope|for|headers|disabled|hidden|inert|controls|autoplay|muted|kind|aria-[a-z-]+)$/;
    const escape = value => String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    const attrs = Array.from(el.attributes).filter(a => allowed.test(a.name)).map(a => `${a.name}="${escape(trim(a.value, 160))}"`).join(' ');
    return `<${el.tagName.toLowerCase()}${attrs ? ' ' + attrs : ''}>${/^(INPUT|IMG|BR|HR)$/.test(el.tagName) ? '' : '…</' + el.tagName.toLowerCase() + '>'}`;
  }
  function rect(el) {
    const r = el.getBoundingClientRect();
    return Object.fromEntries(['x','y','width','height','top','right','bottom','left'].map(k => [k, Math.round(r[k] * 10) / 10]));
  }
  function focusables(doc = document) {
    return all(doc, 'a[href],area[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"],audio[controls],video[controls],iframe')
      .filter(el => !el.matches(':disabled') && el.tabIndex >= 0 && !isHidden(el) && (!el.ownerDocument.defaultView || el.getClientRects().length > 0));
  }
  async function run(doc = document, options = {}) {
    const live = Boolean(doc.defaultView);
    const findings = [], checks = [], inventory = {images:[], media:[], headings:[], landmarks:[], focusables:[], frames:[]};
    const cap = 2500;
    function add(ruleId, status, group, title, detail, el, kwcag, fix = '', wcag = []) {
      if (findings.length >= cap) return;
      findings.push({id: `${ruleId}:${selector(el)}:${findings.length}`, ruleId, status, group, title, detail,
        selector: selector(el), html: snippet(el), kwcag: kwcag ? [kwcag] : [], wcag, fix, source:'builtin'});
    }
    function check(id, title, candidates, fn) {
      const before = findings.length;
      for (const el of candidates) fn(el);
      checks.push({id, title, tested:candidates.length, findings:findings.length-before,
        status:candidates.length ? (findings.length > before ? 'findings' : 'no-findings') : 'not-applicable'});
    }
    check('document-title','문서 제목', [doc.documentElement], el => {
      if (!trim(doc.title)) add('document-title','error','markup','문서 제목이 없습니다.','문서를 식별할 수 있는 title을 제공하세요.',el,'6.4.2','<title>회원가입 | 서비스명</title>',['2.4.2']);
    });
    check('html-lang','문서 언어', [doc.documentElement], el => {
      if (!trim(el.lang)) add('html-lang','error','markup','기본 언어가 지정되지 않았습니다.','실제 주 언어에 맞게 html의 lang을 지정하세요.',el,'7.1.1','<html lang="ko">',['3.1.1']);
    });
    const ids = new Map();
    check('duplicate-id','중복 id', all(doc,'[id]'), el => {
      const root = el.getRootNode(); if (!ids.has(root)) ids.set(root,new Set());
      if (el.id && ids.get(root).has(el.id)) add('duplicate-id','error','markup','같은 트리 안에서 id가 중복되었습니다.','레이블·ARIA 참조가 잘못 연결될 수 있습니다. 참조하는 속성도 함께 수정하세요.',el,'8.1.1','각 요소에 고유한 id를 사용하고 for·aria-labelledby·aria-controls 참조를 함께 갱신하세요.');
      ids.get(root).add(el.id);
    });
    check('aria-refs','ARIA 참조', all(doc,'[aria-labelledby],[aria-describedby],[aria-controls],[aria-owns]'), el => {
      for (const attr of ['aria-labelledby','aria-describedby','aria-controls','aria-owns']) {
        const missing = (el.getAttribute(attr)||'').trim().split(/\s+/).filter(Boolean).filter(id => !ref(el,id));
        if (missing.length) add('aria-refs', attr === 'aria-controls' ? 'review' : 'error','markup',`${attr}의 연결 대상이 없습니다.`,`${missing.join(', ')} 참조를 확인하세요. aria-controls는 아직 열리지 않은 동적 콘텐츠일 수 있습니다.`,el,'8.2.1','실제 대상의 id와 참조 속성을 일치시키세요.',['4.1.2']);
      }
    });
    check('image-alt','이미지 대체 콘텐츠', all(doc,'img,input[type="image"],svg[role="img"],[role="img"]'), el => {
      if (isHidden(el)) return;
      const alt = el.getAttribute('alt'), accessibleName = name(el);
      inventory.images.push({selector:selector(el),kind:el.tagName.toLowerCase(),alt, name:accessibleName,html:snippet(el)});
      if (el.tagName === 'IMG' && alt === '') {
        add('image-decoration','review','media','빈 alt가 장식용 이미지에 적합한지 확인하세요.','빈 alt 자체는 오류가 아닙니다. 정보·문자가 있는 이미지인지, 주변 텍스트와 중복되는지 판단하세요.',el,'5.1.1','장식: <img src="decoration.svg" alt="">\n정보: <img src="award.png" alt="이미지의 실제 수상 정보">');
      } else if (!accessibleName && el.getAttribute('role') !== 'presentation' && el.getAttribute('role') !== 'none') {
        add('image-alt','error','media','이미지의 대체 이름을 찾지 못했습니다.','텍스트 또는 기능을 전달하는 이미지라면 동등한 대체 콘텐츠를 연결하세요.',el,'5.1.1','<img src="image.jpg" alt="실제 이미지가 전달하는 내용">',['1.1.1']);
      } else {
        add('image-quality','review','media','대체텍스트의 의미를 확인하세요.',`현재 이름: ${accessibleName || '(역할 제거)'} — 문맥·기능·이미지 내 텍스트와의 동등성은 자동으로 판정하지 않습니다.`,el,'5.1.1','복잡한 표·차트는 간단한 alt와 별도 상세 설명을 함께 제공하세요.');
      }
    });
    check('media-alternative','영상·오디오 대체 수단', all(doc,'video,audio'), el => {
      const tracks = Array.from(el.querySelectorAll('track')).map(t => ({kind:t.kind,lang:t.srclang,label:t.label,hasSource:Boolean(t.getAttribute('src'))}));
      inventory.media.push({selector:selector(el),kind:el.tagName.toLowerCase(),controls:el.controls,autoplay:el.autoplay,muted:el.muted,tracks,html:snippet(el)});
      add('media-alternative','review','media',tracks.some(t=>/captions|subtitles/.test(t.kind)) ? '자막 트랙의 실제 내용과 동기화를 확인하세요.' : '멀티미디어 대체 수단을 확인하세요.',
        '자막·대본·수어 또는 별도 대체 콘텐츠를 확인하세요. track이 없다고 무조건 실패하지 않으며, 트랙이 있어도 정확성은 검토해야 합니다.',el,'5.2.1','<video controls>\n  <source src="video.mp4" type="video/mp4">\n  <track kind="captions" src="captions-ko.vtt" srclang="ko" label="한국어">\n</video>\n<a href="#transcript">영상 대본</a>');
      if (el.autoplay && !el.muted) add('media-autoplay','review','media','소리 있는 자동 재생 설정이 있습니다.','브라우저의 실제 재생 여부와 중지·음량 제어 수단을 확인하세요.',el,'5.4.2','자동 재생을 제거하거나 사용자가 직접 재생하도록 구성하세요.');
    });
    check('control-name','컨트롤 이름', all(doc,'button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[role="link"]'), el => {
      if (isHidden(el)) return;
      if (!name(el)) add('control-name','review', /INPUT|SELECT|TEXTAREA/.test(el.tagName) ? 'markup':'focus','컨트롤의 이름을 확인하세요.','기본 규칙에서 이름을 찾지 못했습니다. 전체 접근 가능한 이름 계산은 axe-core 결과 및 실제 보조기술로 확인하세요.',el,'7.3.2','<label for="email">이메일</label>\n<input id="email" type="email" autocomplete="email">\n<!-- 아이콘 버튼은 기능을 확인한 뒤 aria-label을 제공 -->',['4.1.2']);
    });
    check('tabindex-positive','명시적 초점 순서', all(doc,'[tabindex]'), el => {
      if (Number(el.getAttribute('tabindex')) > 0) add('tabindex-positive','review','focus','양수 tabindex가 초점 순서를 변경합니다.','DOM 순서보다 먼저 이동할 수 있습니다. 실제 Tab 기록과 콘텐츠의 의미를 함께 검토하세요.',el,'6.1.2','가능하면 DOM 순서를 개선하고 기본 키보드 순서를 유지하세요.',['2.4.3']);
    });
    check('hidden-focus','숨김 영역의 초점 후보', all(doc,'[aria-hidden="true"]'), el => {
      const candidates = [el,...el.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(n=>n.tabIndex>=0 && !n.disabled);
      if(candidates.length && !el.closest('[inert],[hidden]')) add('hidden-focus','review','focus','aria-hidden 영역에 초점 후보가 있습니다.','aria-hidden은 키보드 초점을 제거하지 않습니다. 실제로 접근 가능한지 확인하세요.',el,'6.1.2','숨긴 영역에는 상황에 맞게 hidden 또는 inert를 사용하고, 모달 전환 시 초점을 관리하세요.');
    });
    check('custom-keyboard','사용자 정의 조작 요소', all(doc,'[role="button"],[role="checkbox"],[role="tab"],[onclick]'), el => {
      if (isHidden(el) || /BUTTON|INPUT|SELECT|TEXTAREA|A|SUMMARY/.test(el.tagName)) return;
      if (el.tabIndex < 0 && el.getAttribute('role') !== 'tab') add('custom-keyboard','review','focus','키보드 접근 경로를 확인하세요.','클릭 또는 위젯 역할이 있지만 기본 Tab 후보가 아닙니다. 복합 위젯의 방향키 이동은 별도로 확인합니다.',el,'6.1.1','가능하면 <button type="button">실제 동작 이름</button>을 사용하세요.');
    });
    let lastLevel = 0;
    check('heading-order','제목 구조', all(doc,'h1,h2,h3,h4,h5,h6,[role="heading"]'), el => {
      if (isHidden(el)) return;
      const level = Number(el.getAttribute('aria-level') || el.tagName.slice(1));
      inventory.headings.push({level:Number.isFinite(level)?level:null,name:text(el),selector:selector(el)});
      if (!text(el)) add('heading-empty','review','markup','빈 제목의 의미를 확인하세요.','CSS 대체 콘텐츠 또는 동적 로딩 여부를 확인하세요.',el,'6.4.2','구역의 실제 내용을 설명하는 제목을 제공하세요.');
      if (lastLevel && level > lastLevel + 1) add('heading-order','review','markup','제목 수준이 건너뛰어졌습니다.','제목 계층의 의미를 확인하세요. 수준 건너뜀만으로 기준 위반을 확정하지 않습니다.',el,'5.3.2','실제 콘텐츠 계층에 맞게 h1~h6 또는 aria-level을 구성하세요.');
      lastLevel = level;
    });
    inventory.landmarks = all(doc,'main,nav,header,footer,aside,[role="main"],[role="navigation"],[role="banner"],[role="contentinfo"]')
      .filter(el=>!isHidden(el)).map(el=>({role:el.getAttribute('role')||el.tagName.toLowerCase(),name:name(el),selector:selector(el)}));
    check('table-structure','표 구조', all(doc,'table'), el => {
      if (isHidden(el) || /^(presentation|none)$/.test(el.getAttribute('role')||'')) return;
      add('table-structure','review','markup','표의 제목·머리글 관계를 확인하세요.',`caption ${el.querySelector('caption')?'있음':'없음'}, th ${el.querySelectorAll('th').length}개. 레이아웃용 표인지 데이터 표인지에 따라 판단이 달라집니다.`,el,'5.3.1','데이터 표에는 필요한 제목과 th·scope 또는 headers/id 관계를 제공하세요.');
    });
    check('frame-title','프레임 검사 범위', all(doc,'iframe'), el => {
      inventory.frames.push({selector:selector(el),title:el.title,status:'not-inspected'});
      add('frame-scope','review','markup','프레임 내부는 이번 검사에 포함되지 않습니다.','프레임 문서를 별도 탭에서 검사하세요. 교차 출처·내장 영상·보안 제한 프레임은 자동 접근하지 않습니다.',el,'8.2.1');
      if(!trim(el.title)) add('frame-title','error','markup','프레임 제목이 없습니다.','iframe의 목적을 나타내는 title을 제공하세요.',el,'6.4.2','<iframe title="제품 사용 안내 영상" src="…"></iframe>');
    });
    check('nested-interactive','조작 요소 중첩', all(doc,'button,a[href]'), el => {
      if (el.querySelector('button,a[href],input,select,textarea')) add('nested-interactive','review','markup','조작 요소가 다른 조작 요소 안에 중첩되었습니다.','원본 HTML과 접근성 트리를 확인하세요. 브라우저가 중첩 마크업을 복구했을 수 있습니다.',el,'8.1.1','링크와 버튼을 서로의 자식이 아닌 별도 요소로 구성하세요.');
    });
    inventory.focusables = focusables(doc).slice(0,1000).map((el,i)=>({domIndex:i+1,name:name(el),selector:selector(el),tag:el.tagName.toLowerCase(),tabindex:el.tabIndex,rect:live?rect(el):null}));
    const limitations = [
      '현재 문서와 열린 Shadow DOM을 검사합니다. iframe 내부·닫힌 Shadow DOM·캔버스 내부는 별도 검사 대상입니다.',
      'Tab 기록은 DOM 초점 이벤트이며 스크린리더 탐색 모드의 가상 커서·발화·접근성 트리를 직접 측정하지 않습니다.',
      '대체 콘텐츠의 의미, 자막 정확성, 논리적인 순서와 법적 준수는 사람의 검토가 필요합니다.',
      '원본 HTML 문법 전체를 검증하지 않습니다. 브라우저가 복구한 중첩·중복 속성은 원본 검사로 확인하세요.'
    ];
    let axeVersion = null;
    const axe = g.axe;
    if (live && axe?.run && options.axe !== false) {
      try {
        const result = await axe.run(doc.documentElement,{iframes:false,runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']},resultTypes:['violations','incomplete','passes','inapplicable']});
        axeVersion = result.testEngine.version;
        for (const [key,status] of [['violations','error'],['incomplete','review']]) for (const rule of result[key]) for (const node of rule.nodes) {
          if (findings.length>=cap) break;
          const target = node.target.flat(Infinity).join(' >>> ');
          findings.push({id:`axe:${rule.id}:${target}`,ruleId:rule.id,status,group: /image|video|audio|svg/.test(rule.id)?'media':/focus|tabindex|keyboard/.test(rule.id)?'focus':'markup',
            title:rule.help, detail:node.failureSummary || rule.description, selector:target,
            html: '(개인정보 보호를 위해 axe 원본 HTML은 저장하지 않음)', kwcag:[], wcag:rule.tags.filter(t=>/^wcag\d{3,}$/.test(t)),fix:'공식 규칙 설명과 실제 동작을 함께 확인하세요.',helpUrl:rule.helpUrl,source:'axe',impact:rule.impact});
        }
        checks.push({id:'axe-core',title:`axe-core ${axeVersion}`,tested:result.passes.length+result.violations.length+result.incomplete.length,status:'executed',passedRules:result.passes.map(r=>r.id),inapplicableRules:result.inapplicable.map(r=>r.id)});
      } catch(err) { limitations.push('axe-core 실행 실패: '+trim(err.message)); }
    } else {
      limitations.push('axe-core가 번들에 없거나 실행되지 않았습니다. 기본 DOM 규칙만 실행했으며 명도 대비·전체 ARIA 규칙 등은 미검사입니다.');
    }
    if(findings.length>=cap) limitations.push('결과가 2,500건 상한에 도달하여 일부 결과가 생략되었습니다.');
    const id = g.crypto?.randomUUID?.() || 'report-'+Date.now();
    return {schemaVersion:1,generator:'accessibility-studio',version,id,createdAt:new Date().toISOString(),
      page:{url:cleanURL(options.url||doc.URL),title:trim(options.title||doc.title),mode:options.mode||'live',state:trim(options.state||'현재 화면'),viewport:live?{width:doc.defaultView.innerWidth,height:doc.defaultView.innerHeight,dpr:doc.defaultView.devicePixelRatio}:null},
      engine:{builtin:version,axe:axeVersion},findings,checks,inventory,limitations,focus:{events:[],layoutShifts:[],note:'기록하지 않음'},manual:{}};
  }
  g.StudioAudit = Object.freeze({version,run,selector,find,name,snippet,rect,focusables,isHidden,cleanURL,trim});
})(globalThis);
