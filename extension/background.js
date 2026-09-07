'use strict';
let queue=Promise.resolve();
function serial(task){const result=queue.then(task,task);queue=result.catch(()=>{});return result;}
async function tabOrThrow(tabId){
  if(!Number.isInteger(tabId))throw new Error('검사할 탭을 찾지 못했습니다.');
  const tab=await chrome.tabs.get(tabId);
  if(!/^https?:\/\//i.test(tab.url||''))throw new Error('http/https 웹 페이지에서 실행하세요. 브라우저 설정·확장 페이지는 검사할 수 없습니다.');
  return tab;
}
async function inject(tabId){
  await chrome.scripting.executeScript({target:{tabId},files:['assets/vendor-axe.js','assets/core.js','assets/focus.js']});
}
async function audit(tabId,state){
  await tabOrThrow(tabId);await inject(tabId);
  const results=await chrome.scripting.executeScript({target:{tabId},func:async label=>{
    return globalThis.StudioAudit.run(document,{mode:'live',state:label||'현재 화면'});
  },args:[String(state||'').slice(0,120)]});
  const report=results[0]?.result;if(!report)throw new Error('검사 결과가 없습니다. 새로고침 후 다시 실행하세요.');
  return report;
}
async function saveReport(report){await chrome.storage.local.set({latestReport:report});}
async function openReport(){await chrome.tabs.create({url:chrome.runtime.getURL('report.html#results')});}
async function handle(message,sender){
  if(message.action==='focus-event'){
    if(!sender.tab)return {ok:false};
    const {focusSession}=await chrome.storage.session.get('focusSession');
    if(!focusSession||focusSession.tabId!==sender.tab.id||focusSession.id!==message.sessionId)return {ok:false};
    if(!message.event||typeof message.event.sequence!=='number')return {ok:false};
    const index=focusSession.events.findIndex(v=>v.sequence===message.event.sequence);
    if(index>=0)focusSession.events[index]=message.event;else focusSession.events.push(message.event);
    focusSession.events=focusSession.events.slice(-500);
    await chrome.storage.session.set({focusSession});return {ok:true};
  }
  // Only extension pages initiate control operations. Page content can only report focus.
  if(sender.tab || !sender.url?.startsWith(chrome.runtime.getURL('')))throw new Error('지원하지 않는 요청 출처입니다.');
  const {action,tabId,state}=message;
  if(action==='audit'){
    const report=await audit(tabId,state);await saveReport(report);await openReport();return {ok:true,message:`검사 완료: ${report.findings.length}건. 보고서 탭을 확인하세요.`};
  }
  if(action==='start-focus'){
    const {focusSession:previous}=await chrome.storage.session.get('focusSession');
    if(previous){try{await chrome.scripting.executeScript({target:{tabId:previous.tabId},func:()=>globalThis.StudioFocus?.stop()});}catch{}}
    const initialReport=await audit(tabId,state||'초점 기록 시작 화면');
    const id=crypto.randomUUID();
    await chrome.storage.session.set({focusSession:{id,tabId,initialReport,events:[],startedAt:new Date().toISOString()}});
    await chrome.scripting.executeScript({target:{tabId},func:sessionId=>{
      globalThis.StudioFocus.start(event=>{
        chrome.runtime.sendMessage({action:'focus-event',sessionId,event}).catch(()=>{});
      });
    },args:[id]});
    return {ok:true,message:'기록을 시작했습니다. 팝업을 닫고 페이지에서 Tab / Shift+Tab으로 이동하세요.'};
  }
  if(action==='stop-focus'){
    const {focusSession}=await chrome.storage.session.get('focusSession');
    if(!focusSession)throw new Error('먼저 초점 기록을 시작하세요.');
    let focus=null,report=focusSession.initialReport;
    try{
      const results=await chrome.scripting.executeScript({target:{tabId:focusSession.tabId},func:()=>globalThis.StudioFocus?.stop()||null});
      focus=results[0]?.result;
      if(focus){report=await audit(focusSession.tabId,state||'초점 기록 종료 화면');}
    }catch{}
    if(!focus){focus={events:focusSession.events,layoutShifts:[],interrupted:true,note:'페이지 전환·탭 종료·권한 변경으로 중단되었습니다. 보존된 DOM 초점 기록만 표시하며 새 문서는 검사하지 않았습니다.'};report.limitations.push('초점 기록이 중단되어 자동 검사 결과는 기록 시작 화면 기준입니다.');}
    report.focus=focus;await saveReport(report);await chrome.storage.session.remove('focusSession');await openReport();
    return {ok:true,message:`초점 ${focus.events.length}건을 보고서에 저장했습니다.`};
  }
  if(action==='latest'){const {latestReport}=await chrome.storage.local.get('latestReport');if(!latestReport)throw new Error('저장된 보고서가 없습니다.');await openReport();return {ok:true};}
  if(action==='delete'){
    const {focusSession}=await chrome.storage.session.get('focusSession');
    if(focusSession){try{await chrome.scripting.executeScript({target:{tabId:focusSession.tabId},func:()=>globalThis.StudioFocus?.stop()});}catch{}}
    await chrome.storage.local.remove('latestReport');await chrome.storage.session.remove('focusSession');return {ok:true,message:'확장 프로그램의 저장 보고서와 초점 기록을 삭제했습니다.'};
  }
  throw new Error('알 수 없는 동작입니다.');
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  serial(()=>handle(message,sender)).then(sendResponse,e=>sendResponse({ok:false,error:e.message||String(e)}));return true;
});
