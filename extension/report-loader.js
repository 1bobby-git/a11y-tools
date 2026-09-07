'use strict';
(async()=>{
  try{
    const {latestReport}=await chrome.storage.local.get('latestReport');
    if(latestReport)window.StudioApp.loadReport(latestReport,false);
    const status=document.getElementById('breadcrumb');if(status)status.textContent='확장 프로그램 / 로컬 보고서';
  }catch(e){document.getElementById('toast').textContent='확장 보고서를 열지 못했습니다: '+e.message;}
})();
