export const COMMANDS=new Set(['next','previous','nextHeading','previousHeading','nextLink','previousLink','nextLandmark','previousLandmark','interact','stopInteracting','Tab','Shift+Tab','Escape']);
export function validateScenario(value){
 if(!Array.isArray(value)||!value.length||value.length>150)throw new Error('시나리오는 1~150개 단계의 JSON 배열이어야 합니다.');
 return value.map((step,i)=>{if(!step||!COMMANDS.has(step.command))throw new Error(`${i+1}번째 단계: 지원하지 않는 탐색 명령입니다.`);
  if(step.expected!==undefined&&(typeof step.expected!=='string'||!step.expected.trim()||step.expected.length>2000))throw new Error('expected는 비어 있지 않은 2,000자 이하 문자열이어야 합니다.');
  return {command:step.command,...(step.expected?{expected:step.expected}:{})};
 });
}
export function assertion(expected,speech){
 if(!expected)return {status:'not-asserted',expected:''};
 return {status:speech.join('\n').includes(expected)?'pass':'fail',expected,note:'문자열 포함 여부만 확인합니다. 순서의 적절성·전체 접근성 준수를 판정하지 않습니다.'};
}
export function compareLayout(before,after){
 const old=new Map(before.elements.map(e=>[e.selector,e]));
 return after.elements.flatMap(e=>{const b=old.get(e.selector);if(!b)return [];const d={selector:e.selector,dx:Math.round(e.x-b.x),dy:Math.round(e.y-b.y),dw:Math.round(e.width-b.width),dh:Math.round(e.height-b.height)};
  return Math.max(...['dx','dy','dw','dh'].map(k=>Math.abs(d[k])))>=3?[d]:[];
 });
}
export async function captureStep(reader,step){
 await reader.clearSpokenPhraseLog();
 if(['Tab','Shift+Tab','Escape'].includes(step.command))await reader.press(step.command,{capture:true});else await reader[step.command]({capture:true});
 const speech=await reader.spokenPhraseLog();
 if(!Array.isArray(speech))throw new Error('실제 스크린리더의 발화 기록을 읽지 못했습니다.');
 return {command:step.command,speech,assertion:assertion(step.expected,speech)};
}
