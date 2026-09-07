/* Observe real focus events. Never synthesize Tab, click buttons, submit forms,
 * scroll, restyle, or insert an overlay while recording. Layout measurements
 * are heuristics; even input-related layout-shift entries are retained.
 */
(function(g){
  'use strict';
  if(g.StudioFocus?.version === '0.1.0') return;
  let active=false, events=[], shifts=[], onEvent=null, observer=null, lastKey=null, pending=null;
  let sequence=0, timers=new Set(), startTime=0;
  const A=()=>g.StudioAudit;
  const round=n=>Math.round(n*10)/10;
  function deepest(el){while(el?.shadowRoot?.activeElement) el=el.shadowRoot.activeElement;return el;}
  function snapshot(target){
    const d=document.documentElement;
    const nodes=[...document.querySelectorAll('header,main,footer,nav,section,article,form,dialog,[role="dialog"],body > *')].slice(0,80);
    if(target) nodes.push(target);
    const positions=nodes.filter(el=>el.nodeType===1 && !A().isHidden(el)).map(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return {el,selector:A().selector(el),x:round(r.x+scrollX),y:round(r.y+scrollY),width:round(r.width),height:round(r.height),fixed:/fixed|sticky/.test(s.position)};
    });
    return {time:performance.now(),x:scrollX,y:scrollY,width:d.scrollWidth,viewport:d.clientWidth,positions};
  }
  function keydown(e){
    if(!active||e.key!=='Tab')return;
    lastKey={key:e.shiftKey?'Shift+Tab':'Tab',time:performance.now()};
    pending=snapshot(deepest(document.activeElement));
  }
  function obscured(el,r){
    const left=Math.max(0,r.left),top=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
    if(right<=left||bottom<=top) return {outside:true,covered:0,total:0};
    let covered=0;
    const coords=[[.5,.5],[.2,.2],[.8,.2],[.2,.8],[.8,.8]];
    for(const [fx,fy] of coords){
      const hit=document.elementFromPoint(left+(right-left)*fx,top+(bottom-top)*fy);
      const host=el.getRootNode()?.host;
      if(hit && hit!==el&&!el.contains(hit)&&!hit.contains(el)&&hit!==host) covered++;
    }
    return {outside:false,covered,total:coords.length};
  }
  function focusin(e){
    if(!active)return;
    const target=e.composedPath().find(n=>n?.nodeType===1)||deepest(document.activeElement);
    if(!target)return;
    const before=pending||snapshot(target);pending=null;
    const seq=++sequence, when=performance.now();
    const record={sequence:seq,at:new Date().toISOString(),elapsedMs:Math.round(when-startTime),
      via:lastKey&&when-lastKey.time<1000?lastKey.key:'DOM focus (원인 미확정)',
      selector:A().selector(target),name:A().name(target),tag:target.tagName.toLowerCase(),
      html:A().snippet(target),url:A().cleanURL(location.href),before:{scrollX:before.x,scrollY:before.y,documentWidth:before.width,viewportWidth:before.viewport},
      samples:[],flags:[]};
    events.push(record);
    if(events.length>500) {events.shift();record.flags.push('기록 500건 한도로 이전 항목 생략');}
    function sample(delay){
      const t=setTimeout(()=>{
        timers.delete(t);if(!active)return;
        if(!target.isConnected){record.flags.push('초점 대상이 DOM에서 제거됨');onEvent?.(structuredClone(record));return;}
        const current=deepest(document.activeElement);
        // Retain an explicit note rather than confusing a later element's state.
        if(current!==target){if(delay===500)record.flags.push('다음 초점으로 이동해 500ms 측정을 생략함');onEvent?.(structuredClone(record));return;}
        const after=snapshot(target),r=target.getBoundingClientRect(),style=getComputedStyle(target),cover=obscured(target,r);
        const changes=[];
        for(const p of before.positions){
          if(!p.el.isConnected||p.fixed)continue;
          const q=after.positions.find(v=>v.el===p.el);if(!q)continue;
          const delta={dx:round(q.x-p.x),dy:round(q.y-p.y),dw:round(q.width-p.width),dh:round(q.height-p.height)};
          if(Math.max(...Object.values(delta).map(Math.abs))>2) changes.push({selector:p.selector,...delta});
        }
        const overflow=Math.max(0,after.width-after.viewport),beforeOverflow=Math.max(0,before.width-before.viewport);
        const data={delayMs:delay,rect:A().rect(target),scrollX:after.x,scrollY:after.y,documentWidth:after.width,
          overflowPx:overflow,overflowIncreasePx:Math.max(0,overflow-beforeOverflow),changes:changes.slice(0,20),cover,
          indicator:{outline:style.outlineStyle,outlineWidth:style.outlineWidth,boxShadow:style.boxShadow},
          layoutShifts:shifts.filter(s=>s.time>=before.time && s.time<=performance.now()).slice(0,20)};
        record.samples.push(data);
        if(data.overflowIncreasePx>2)record.flags.push(`가로 넘침 ${data.overflowIncreasePx}px 증가`);
        if(changes.length)record.flags.push(`주변 요소 위치·크기 변화 ${changes.length}개 (의도된 변화인지 검토)`);
        if(cover.outside)record.flags.push('초점 요소가 화면 밖에 있음');
        if(cover.covered===cover.total&&cover.total)record.flags.push('표본 지점에서 초점 요소가 모두 가려짐 (검토 필요)');
        else if(cover.covered)record.flags.push('일부 표본 지점에서 초점 요소가 가려짐');
        if(!r.width||!r.height)record.flags.push('초점 요소의 크기가 0임');
        if(style.outlineStyle==='none'&&style.boxShadow==='none')record.flags.push('outline·box-shadow 없음: 배경·테두리 등 다른 초점 표시를 수동 확인');
        record.flags=[...new Set(record.flags)];
        onEvent?.(structuredClone(record));
      },delay);
      timers.add(t);
    }
    sample(120);sample(500);
    onEvent?.(structuredClone(record));
  }
  function start(callback){
    stop();events=[];shifts=[];sequence=0;startTime=performance.now();lastKey=null;pending=null;onEvent=callback||null;active=true;
    document.addEventListener('keydown',keydown,true);document.addEventListener('focusin',focusin,true);
    try{
      observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){
        shifts.push({time:entry.startTime,value:entry.value,hadRecentInput:entry.hadRecentInput,
          sources:(entry.sources||[]).slice(0,6).map(s=>({selector:s.node?A().selector(s.node):'(removed)',previousRect:s.previousRect?{x:s.previousRect.x,y:s.previousRect.y,width:s.previousRect.width,height:s.previousRect.height}:null,currentRect:s.currentRect?{x:s.currentRect.x,y:s.currentRect.y,width:s.currentRect.width,height:s.currentRect.height}:null}))});
        if(shifts.length>500)shifts.shift();
      }});
      observer.observe({type:'layout-shift',buffered:false});
    }catch{observer=null;}
    return {active:true,note:'페이지에서 Tab / Shift+Tab으로 이동하세요. 도구는 초점을 강제로 이동하지 않습니다.'};
  }
  function report(){return {active,events:structuredClone(events),layoutShifts:structuredClone(shifts),
    supported:{layoutShift:typeof PerformanceObserver!=='undefined'&&(PerformanceObserver.supportedEntryTypes||[]).includes('layout-shift')},
    note:'실제 DOM 초점만 관찰합니다. 스크린리더 가상 커서는 직접 관찰하지 않습니다. 좌표·가림·레이아웃 변화는 검토 단서이며 자동 실패 판정이 아닙니다. 포커스 이벤트 직후 120ms/500ms에 최대 80개 구역을 표본 측정합니다. CSS 내부 스크롤·애니메이션은 오탐 원인일 수 있습니다.'};}
  function stop(){
    const result=report();active=false;for(const t of timers)clearTimeout(t);timers.clear();
    document.removeEventListener('keydown',keydown,true);document.removeEventListener('focusin',focusin,true);
    observer?.disconnect();observer=null;onEvent=null;result.active=false;return result;
  }
  g.StudioFocus=Object.freeze({version:'0.1.0',start,stop,report});
})(globalThis);
