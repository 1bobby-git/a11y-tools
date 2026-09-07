/* Controls always address the live document, never exported evidence HTML. */
(function(){
'use strict';
const $=id=>document.getElementById(id),A=()=>window.StudioApp;
let refreshing=false,commandBusy=false,previous=null,poll=null,lastRevision=-1,sourceId=null;
function liveKind(){const r=A().getReport(),p=A().getPreview();if(!r)return null;if(window.chrome?.runtime?.id&&r.sourceTab)return 'tab';return p.channel&&p.reportId===r.id?'preview':null;}
function controls(){
  const kind=liveKind(),r=A().getReport();
  $('refresh-report').disabled=!kind||refreshing;
  $('refresh-report').textContent=refreshing?'현재 DOM 검사 중…':'결과 새로고침';
  $('view-results').setAttribute('aria-busy',String(refreshing));
  $('playback-card').hidden=!kind;
  for(const id of ['play','pause','stop','previous','next'])$('player-'+id).disabled=!kind||refreshing||commandBusy;
  $('player-source').textContent=kind==='tab'?'검사한 원본 탭에서 실제 초점을 옮깁니다. 재생하면 원본 탭을 표시합니다.':'아래 워크스페이스에서 실제 초점 변화를 볼 수 있습니다.';
  if(!kind)$('refresh-status').textContent=r?'현재 DOM과 연결되지 않은 보고서입니다. 원본 탭의 확장에서 재검사하세요. 저장 HTML로 대체 검사하지 않습니다.':'먼저 검사를 실행하세요.';
  else if(!refreshing)$('refresh-status').textContent='현재 DOM 기준으로 재검사합니다. 페이지를 다시 로드하지 않으므로 열린 메뉴·팝업 상태를 유지합니다.';
  if(sourceId!==r?.id){sourceId=r?.id;lastRevision=-1;clearInterval(poll);poll=null;$('player-status').textContent='재생 전';$('player-current').textContent='';$('player-progress').value=0;}
}
function display(status){
  if(!status)return;
  lastRevision=status.revision??lastRevision;
  if(liveKind()==='tab'&&!status.started&&!status.running){clearInterval(poll);poll=null;}
  const at=status.index>=0?status.index+1:0;
  $('player-status').textContent=`${status.reason||''} · ${at} / ${status.total||0} · ${status.current?.name||'이름 없음'}`;
  $('player-current').textContent=status.current?`${status.current.selector}\n${status.current.html}`:'';
  $('player-progress').max=Math.max(1,status.total||0);$('player-progress').value=at;
  if(status.focus)A().updateFocus(status.focus,A().getReport()?.id);
}
async function remote(action,options={}){
  const r=A().getReport();if(!r?.sourceTab)throw new Error('원본 탭 연결이 없습니다.');
  const result=await chrome.runtime.sendMessage({action:'player-control',command:action,options,sourceTab:r.sourceTab,reportId:r.id,revision:lastRevision});
  if(!result?.ok)throw new Error(result?.error||'원본 탭의 응답이 없습니다.');
  if(A().getReport()?.id===r.id)display(result.status);
}
async function command(action){
  if(commandBusy||refreshing)return;commandBusy=true;controls();
  try{
    const options={interval:Number($('player-speed').value),loop:$('player-loop').checked};
    if(liveKind()==='tab'){
      await remote(action,options);
      if(!poll)poll=setInterval(()=>{if(!commandBusy&&!refreshing&&liveKind()==='tab')remote('status').catch(e=>{clearInterval(poll);poll=null;$('player-status').textContent=e.message;});},850);
    }else if(liveKind()==='preview')A().sendPreview({type:'player',action,options});
  }catch(e){$('player-status').textContent=e.message;}finally{commandBusy=false;controls();}
}
for(const action of ['play','pause','stop','previous','next'])$('player-'+action).addEventListener('click',()=>command(action));
for(const id of ['player-speed','player-loop'])$(id).addEventListener('change',()=>command('configure'));
$('refresh-report').addEventListener('click',async()=>{
  if(refreshing)return;
  const old=structuredClone(A().getReport());refreshing=true;controls();$('refresh-status').textContent='현재 DOM을 새로 읽고 있습니다. 저장된 오류·마크업·캡처를 재사용하지 않습니다.';
  try{await A().refreshReport();previous=old;$('export-previous').hidden=false;$('refresh-status').textContent='현재 DOM 재검사 완료. 이전 초점·캡처·수동 판단은 새 결과에 합치지 않았습니다.';A().toast('현재 DOM으로 결과를 새로고침했습니다.');}
  catch(e){$('refresh-status').textContent='새로고침 실패: '+e.message;A().toast(e.message);}
  finally{const message=$('refresh-status').textContent;refreshing=false;controls();$('refresh-status').textContent=message;}
});
$('export-previous').addEventListener('click',()=>{
  if(!previous)return;const url=URL.createObjectURL(new Blob([JSON.stringify(previous,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='accessibility-before-refresh.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
});
window.addEventListener('keydown',e=>{if(e.isTrusted&&e.key==='Escape'&&liveKind())command('pause');});
window.addEventListener('studio:report',controls);
window.addEventListener('studio:playback',e=>display(e.detail));
window.addEventListener('studio:view',()=>{
  const kind=liveKind();if(kind==='preview'&&!['inspect','focus','results'].includes(location.hash.slice(1)))A().sendPreview({type:'player',action:'pause'});
});
window.addEventListener('pagehide',()=>{clearInterval(poll);if(liveKind()==='preview')A().sendPreview({type:'player',action:'stop'});});
controls();
})();
