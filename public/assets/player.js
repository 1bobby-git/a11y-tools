/* Live DOM focus rehearsal, not synthetic Tab or a screen-reader emulator. */
(function(g){
'use strict';
if(g.StudioPlayer?.version==='0.3.0')return;
g.StudioPlayer?.stop();
const A=()=>g.StudioAudit,F=()=>g.StudioFocus;
let timer=null,running=false,started=false,current=null,index=-1,interval=1200,loop=false,steps=0,revision=0;
let notify=()=>{},reason='재생 전',generation=0;
const deep=()=>{let n=document.activeElement;while(n?.shadowRoot?.activeElement)n=n.shadowRoot.activeElement;return n;};
function candidates(){
  const ordered=[],seen=new Set();
  function visit(n){
    if(!n||seen.has(n))return;seen.add(n);
    if(n.nodeType===1){
      if(n.matches('[hidden],[inert]'))return;
      const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse')return;
      const editable=n.isContentEditable&&!n.parentElement?.isContentEditable;
      if(n.matches('a[href],area[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex],audio[controls],video[controls],iframe')||editable){
        const t=editable&&!n.hasAttribute('tabindex')?0:n.tabIndex;
        const summary=n.tagName!=='SUMMARY'||n.parentElement?.tagName!=='DETAILS'||n.parentElement.querySelector('summary')===n;
        if(!n.matches(':disabled')&&t>=0&&summary&&n.getClientRects().length&&typeof n.focus==='function')ordered.push({node:n,tab:t,order:ordered.length});
      }
      if(n.shadowRoot){for(const child of n.shadowRoot.children)visit(child);return;}
      if(n.tagName==='SLOT'){const assigned=n.assignedElements({flatten:true});if(assigned.length){assigned.forEach(visit);return;}}
    }
    for(const child of n.children||[])visit(child);
  }
  visit(document.body||document.documentElement);
  const radios=ordered.filter(x=>x.node.matches('input[type="radio"][name]')&&x.node.name);
  return ordered.filter(x=>{
    const n=x.node;if(!radios.includes(x))return true;
    const group=radios.filter(y=>y.node.name===n.name&&y.node.form===n.form&&y.node.getRootNode()===n.getRootNode());
    return (group.find(y=>y.node.checked)||group[0])===x;
  }).sort((a,b)=>(a.tab>0?a.tab:Infinity)-(b.tab>0?b.tab:Infinity)||a.order-b.order).map(x=>x.node);
}
function state(includeFocus=true){
  const list=candidates();
  return {running,started,index:current?list.indexOf(current):-1,total:list.length,steps,interval,loop,reason,revision,
    current:current?.isConnected?{selector:A().selector(current),name:A().name(current),html:A().snippet(current),rect:A().rect(current)}:null,
    ...(includeFocus?{focus:{...F().report(),origin:'dom-focus-rehearsal',note:'자동 재생은 현재 DOM 후보에 .focus()를 호출합니다. 실제 Tab·스크린리더 가상 커서와 다릅니다. 원본 초점 스타일과 120/500ms 레이아웃을 관찰합니다. 양수 tabindex·Shadow DOM·iframe·복합 위젯의 실제 순서는 수동 확인하세요.'}}:{})};
}
function emit(withFocus=false){revision++;try{notify(state(withFocus));}catch{}}
function clear(){clearTimeout(timer);timer=null;generation++;}
function configure(options={}){
  if(options.interval!==undefined){const n=Number(options.interval);if(!Number.isFinite(n)||n<700||n>5000)throw new Error('재생 간격은 700~5000ms로 지정하세요.');interval=n;}
  if(options.loop!==undefined)loop=options.loop===true;
  if(running){clear();schedule();}return state(false);
}
function begin(){
  if(started)return;
  started=true;steps=0;index=-1;current=null;
  F().start(()=>emit(true));
}
function schedule(){const ticket=generation;timer=setTimeout(()=>{if(running&&ticket===generation)advance(1,true);},interval);}
function advance(direction=1,automatic=false){
  clear();begin();const list=candidates();
  if(!list.length){stop('이동할 초점 후보가 없습니다.');return state();}
  const at=current?list.indexOf(current):-1;
  let next=at>=0?at+direction:(current?Math.max(0,index):direction>0?0:list.length-1);
  if(next<0||next>=list.length){
    if(loop)next=direction>0?0:list.length-1;
    else {stop('끝까지 이동했습니다. 다시 재생하면 처음부터 시작합니다.');return state();}
  }
  if(steps>=500){stop('500회 이동 한도에 도달했습니다.');return state();}
  const target=list[next];F().prepareProgrammaticFocus();
  try{target.focus({preventScroll:false,focusVisible:true});}catch{F().cancelPreparedFocus();pause('이 요소로 초점을 옮기지 못했습니다.');return state();}
  current=deep();index=list.indexOf(current);steps++;
  if(!current||current===document.body||current===document.documentElement){F().cancelPreparedFocus();pause('초점 이동이 거부되었습니다. 실제 키보드로 확인하세요.');return state();}
  reason=current!==target?'페이지의 초점 처리로 다른 요소에 이동했습니다.':automatic?'자동 재생 중':'한 단계 이동';
  emit();if(running)schedule();return state();
}
function play(options={}){
  configure(options);if(running)return state();begin();running=true;reason='자동 재생 중';
  if(current?.isConnected){F().prepareProgrammaticFocus();current.focus({preventScroll:false,focusVisible:true});schedule();emit();return state();}return advance(1,true);
}
function pause(message='일시정지 (초점 기록은 유지)'){clear();running=false;reason=message;emit();return state();}
function stop(message='재생 중지'){clear();running=false;if(started)F().stop();started=false;reason=message;emit(true);return state();}
function command(action,options={}){
  configure(options);
  if(action==='play')return play();if(action==='pause')return pause();if(action==='stop')return stop();
  if(action==='next'||action==='previous'){pause();return advance(action==='next'?1:-1);}
  if(action==='configure'||action==='status')return state();throw new Error('지원하지 않는 재생 명령입니다.');
}
document.addEventListener('keydown',e=>{if(e.isTrusted&&running)pause(e.key==='Escape'?'Esc로 일시정지':'직접 키보드 조작으로 일시정지');},true);
document.addEventListener('pointerdown',e=>{if(e.isTrusted&&running)pause('직접 조작으로 일시정지');},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pause('대상 화면이 보이지 않아 일시정지');});
g.addEventListener('pagehide',()=>stop('페이지를 떠나 재생 중지'));
g.StudioPlayer=Object.freeze({version:'0.3.0',candidates,state,play,pause,stop,command,configure,subscribe:fn=>{notify=typeof fn==='function'?fn:()=>{};}});
})(globalThis);
