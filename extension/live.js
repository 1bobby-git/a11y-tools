/* Bound live-source operations. Imported snapshots cannot authorize arbitrary tabs. */
'use strict';
async function registerLiveSource(report,tab,documentId){
  const source={...report.sourceTab,documentId,reportId:report.id,origin:new URL(tab.url).origin};
  report.sourceTab={tabId:source.tabId,windowId:source.windowId,scanId:source.scanId,documentId};
  const {liveSources={}}=await chrome.storage.session.get('liveSources');
  liveSources[source.scanId]=source;
  for(const key of Object.keys(liveSources).slice(0,-30))delete liveSources[key];
  await chrome.storage.session.set({liveSources});
}
async function resolveLiveSource(message){
  const source=message.sourceTab;
  if(!source||!Number.isInteger(source.tabId)||typeof source.scanId!=='string')throw new Error('원본 탭 연결이 없습니다. 대상 페이지의 확장에서 다시 검사하세요.');
  const {liveSources={}}=await chrome.storage.session.get('liveSources');
  const bound=liveSources[source.scanId];
  if(!bound||bound.tabId!==source.tabId||bound.reportId!==message.reportId)throw new Error('이 보고서의 유효한 원본 연결이 없습니다. 확장에서 페이지를 다시 검사하세요.');
  let tab;try{tab=await tabOrThrow(bound.tabId);}catch{throw new Error('원본 탭이 닫혔거나 접근할 수 없습니다. 저장된 HTML로 대신 검사하지 않습니다.');}
  if(new URL(tab.url).origin!==bound.origin)throw new Error('원본 탭이 다른 사이트로 이동했습니다. 해당 탭에서 확장을 다시 실행하세요.');
  return {bound,tab};
}
async function refreshLiveReport(message){
  const {bound}=await resolveLiveSource(message);
  try{
    await chrome.scripting.executeScript({target:{tabId:bound.tabId},func:()=>{globalThis.StudioPlayer?.stop('결과 새로고침');globalThis.StudioFocus?.stop();}});
    const {focusSession}=await chrome.storage.session.get('focusSession');
    if(focusSession?.tabId===bound.tabId)await chrome.storage.session.remove('focusSession');
    const fresh=await audit(bound.tabId,message.state);
    if(new URL(fresh.page.url).origin!==bound.origin)throw new Error('검사 중 다른 사이트로 이동했습니다. 다시 검사하세요.');
    fresh.refresh={basis:'live-dom',reloaded:false,previousReportId:bound.reportId,refreshedAt:fresh.createdAt};
    await saveReport(fresh);return {ok:true,report:fresh};
  }catch(e){throw new Error('현재 DOM 재검사를 완료하지 못했습니다. 원본 페이지에서 확장 권한을 확인하세요. '+e.message);}
}
async function controlLivePlayer(message){
  const {bound,tab}=await resolveLiveSource(message),command=message.command;
  if(!['play','pause','stop','next','previous','configure','status'].includes(command))throw new Error('지원하지 않는 재생 명령입니다.');
  const {focusSession}=await chrome.storage.session.get('focusSession');
  if(focusSession?.tabId===tab.id&&['play','next','previous'].includes(command))throw new Error('수동 초점 기록을 먼저 중지하고 보고서를 여세요.');
  if(['play','next','previous'].includes(command)){
    await chrome.windows.update(tab.windowId,{focused:true});await chrome.tabs.update(tab.id,{active:true});
  }
  const result=await chrome.scripting.executeScript({target:{tabId:tab.id,documentIds:[bound.documentId]},func:(scanId,cmd,options,revision)=>{
    if(globalThis.__studioScanId!==scanId||!globalThis.StudioPlayer)throw new Error('원본 페이지가 다시 로드되었거나 새 검사가 실행됐습니다. 결과 새로고침을 실행하세요.');
    if(cmd==='status')return StudioPlayer.state(StudioPlayer.state(false).revision!==revision);
    return StudioPlayer.command(cmd,options);
  },args:[bound.scanId,command,message.options||{},Number.isInteger(message.revision)?message.revision:-1]});
  const status=result[0]?.result;if(!status)throw new Error('원본 탭에서 초점 상태를 읽지 못했습니다. 결과 새로고침을 실행하세요.');
  if(status.focus){const {latestReport}=await chrome.storage.local.get('latestReport');if(latestReport?.id===bound.reportId){latestReport.focus=status.focus;await saveReport(latestReport);}}
  return {ok:true,status};
}
