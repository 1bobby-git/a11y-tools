'use strict';
const statusEl=document.getElementById('status');
for(const button of document.querySelectorAll('button'))button.addEventListener('click',async()=>{
  const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);statusEl.textContent='처리 중입니다. 이 창을 닫아도 검사는 유지됩니다.';
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const result=await chrome.runtime.sendMessage({action:button.id,tabId:tab?.id,state:document.getElementById('state-label').value});
    if(!result?.ok)throw new Error(result?.error||'응답이 없습니다.');
    statusEl.textContent=result.message||'완료되었습니다.';
  }catch(e){statusEl.textContent='실행 실패: '+e.message;}
  finally{buttons.forEach(b=>b.disabled=false);}
});
