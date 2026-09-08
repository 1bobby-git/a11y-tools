/* Trusted code inside the opaque-origin source workspace. Never rebuild on refresh. */
(function(g){
'use strict';
g.StudioPreview=Object.freeze({connect({channel,mode,limitation}){
  let busy=false;
  const send=(type,payload,requestId)=>parent.postMessage({channel,type,payload,requestId},'*');
  const audit=async requestId=>{
    if(busy){send('error','이미 검사 중입니다.',requestId);return;}
    busy=true;
    try{
      StudioPlayer.stop('현재 DOM 재검사');StudioFocus.stop();
      if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(!innerWidth||!innerHeight)throw new Error('워크스페이스가 보이지 않아 검사하지 않았습니다. 화면을 표시하고 다시 실행하세요.');
      const result=await StudioAudit.run(document,{mode,state:'격리된 HTML 워크스페이스의 현재 DOM'});
      result.version='0.3.0';result.limitations.push(limitation);
      result.refresh={basis:'live-dom',refreshedAt:result.createdAt,reloaded:false};
      send('report',result,requestId);
    }catch(e){send('error',e.message||String(e),requestId);}finally{busy=false;}
  };
  StudioPlayer.subscribe(status=>{send('playback',status);if(status.focus)send('focus',status.focus);});
  document.addEventListener('submit',e=>e.preventDefault(),true);
  document.addEventListener('click',e=>{const a=e.target.closest?.('a');if(a&&!String(a.getAttribute('href')).startsWith('#'))e.preventDefault();},true);
  g.addEventListener('message',e=>{
    if(e.source!==parent||e.data?.channel!==channel)return;
    const d=e.data;
    if(d.type==='refresh'){audit(d.requestId);return;}
    if(busy){send('error','검사가 끝난 뒤 실행하세요.',d.requestId);return;}
    try{
      if(d.type==='player'){const status=StudioPlayer.command(d.action,d.options);send('playback',status,d.requestId);if(status.focus)send('focus',status.focus);}
      if(d.type==='start'){StudioPlayer.stop();StudioFocus.start(()=>send('focus',StudioFocus.report()));send('started',null);}
      if(d.type==='stop'){StudioPlayer.stop();send('focus',StudioFocus.stop());send('stopped',null);}
      if(d.type==='locate'){
        StudioPlayer.pause('위치 확인으로 일시정지');const n=StudioEvidence.originalNode(d.selector);
        if(n){n.scrollIntoView({block:'center'});n.animate?.([{outline:'3px solid #bd2727'},{outline:'3px solid #bd2727'}],{duration:1800});send('located',d.selector);}
      }
    }catch(error){send('error',error.message,d.requestId);}
  });
  audit();
}});
})(globalThis);
