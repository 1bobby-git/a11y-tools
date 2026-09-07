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
  await chrome.scripting.executeScript({target:{tabId},files:['assets/vendor-axe.js','assets/core.js','assets/evidence.js','assets/focus.js']});
}
async function audit(tabId,state){
  await tabOrThrow(tabId);await inject(tabId);
  const results=await chrome.scripting.executeScript({target:{tabId},func:async label=>{
    return globalThis.StudioAudit.run(document,{mode:'live',state:label||'현재 화면'});
  },args:[String(state||'').slice(0,120)]});
  const report=results[0]?.result;if(!report)throw new Error('검사 결과가 없습니다. 새로고침 후 다시 실행하세요.');
  const scanId=crypto.randomUUID();
  await chrome.scripting.executeScript({target:{tabId},func:id=>{globalThis.__studioScanId=id;},args:[scanId]});
  const tab=await tabOrThrow(tabId);report.sourceTab={tabId,windowId:tab.windowId,scanId};
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
  if(action==='locate-evidence'||action==='capture-evidence')return evidenceAction(message);
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

async function evidenceAction(message){
  const source=message.sourceTab;
  if(!source||!Number.isInteger(source.tabId)||typeof source.scanId!=='string')throw new Error('원본 탭 정보가 없습니다. 다시 검사하세요.');
  await tabOrThrow(source.tabId);
  const tab=await chrome.tabs.get(source.tabId);
  await chrome.windows.update(tab.windowId,{focused:true});await chrome.tabs.update(tab.id,{active:true});
  const prepare=await chrome.scripting.executeScript({target:{tabId:tab.id},func:async(id,path,capture)=>{
    if(globalThis.__studioScanId!==id)throw new Error('페이지가 변경되었거나 새 검사가 실행되었습니다. 다시 검사하세요.');
    const el=StudioEvidence.originalNode(path);if(!el||!el.isConnected)throw new Error('대상 요소가 사라졌습니다. 다시 검사하세요.');
    if(!el.getClientRects().length)throw new Error('숨겨진 요소는 원본 화면에서 캡처할 수 없습니다. 마크업을 확인하세요.');
    el.scrollIntoView({block:'center',inline:'nearest'});
    await new Promise(resolve=>setTimeout(resolve,180));
    const r=StudioAudit.rect(el),w=innerWidth,h=innerHeight;
    if(!capture)el.animate?.([{outline:'3px solid #bd2727',outlineOffset:'4px'},{outline:'3px solid #bd2727',outlineOffset:'4px'}],{duration:1800});
    const masks=StudioEvidence.roots(document).flatMap(root=>Array.from(root.querySelectorAll('input,textarea,select,[contenteditable]'))).map(n=>StudioAudit.rect(n));
    return {rect:r,width:w,height:h,masks};
  },args:[source.scanId,String(message.selector),message.action==='capture-evidence']});
  const data=prepare[0]?.result;if(!data)throw new Error('대상 위치를 읽지 못했습니다.');
  if(message.action==='locate-evidence')return {ok:true};
  const [active]=await chrome.tabs.query({windowId:tab.windowId,active:true});
  if(active?.id!==tab.id)throw new Error('활성 탭이 변경되어 캡처를 취소했습니다.');
  const url=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});
  // Crop before returning: the complete viewport is never saved in the report.
  const [afterCapture]=await chrome.tabs.query({windowId:tab.windowId,active:true});
  if(afterCapture?.id!==tab.id)throw new Error('캡처 도중 탭이 변경되어 결과를 버렸습니다.');
  const bitmap=await createImageBitmap(await (await fetch(url)).blob());
  const sx=bitmap.width/data.width,sy=bitmap.height/data.height,pad=12,r=data.rect;
  const x=Math.max(0,r.x-pad),y=Math.max(0,r.y-pad),right=Math.min(data.width,r.right+pad),bottom=Math.min(data.height,r.bottom+pad);
  if(right<=x||bottom<=y){bitmap.close();throw new Error('대상이 현재 화면 밖에 있습니다.');}
  const canvas=new OffscreenCanvas(Math.max(1,Math.round((right-x)*sx)),Math.max(1,Math.round((bottom-y)*sy))),ctx=canvas.getContext('2d');
  ctx.drawImage(bitmap,x*sx,y*sy,(right-x)*sx,(bottom-y)*sy,0,0,canvas.width,canvas.height);bitmap.close();
  ctx.fillStyle='#59636a';for(const m of data.masks){ctx.fillRect((m.x-x)*sx,(m.y-y)*sy,m.width*sx,m.height*sy);}
  ctx.strokeStyle='#bd2727';ctx.lineWidth=Math.max(2,2*sx);ctx.strokeRect((r.x-x)*sx,(r.y-y)*sy,r.width*sx,r.height*sy);
  const bytes=new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer());
  if(bytes.length>3500000)throw new Error('캡처가 너무 큽니다. 대상 영역을 줄여 다시 시도하세요.');
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {ok:true,screenshot:{dataUrl:'data:image/png;base64,'+btoa(binary),capturedAt:new Date().toISOString(),kind:'live-cropped',note:'화면에 보이는 부분만 캡처. 입력 필드 가림. 화면 텍스트는 별도 검토 필요.'}};
}
