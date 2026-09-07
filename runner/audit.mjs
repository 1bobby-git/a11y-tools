/* Interactive desktop runner: controls an installed real screen reader, never a DOM speech simulator. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {parseArgs} from 'node:util';
import {validateScenario,captureStep,compareLayout} from './model.mjs';
const {values:args}=parseArgs({options:{url:{type:'string'},reader:{type:'string'},scenario:{type:'string'},steps:{type:'string',default:'20'},output:{type:'string',default:'screen-reader-report.json'},screenshots:{type:'boolean',default:false},help:{type:'boolean',default:false}}});
if(args.help){console.log('node audit.mjs --url https://example.com --reader nvda|voiceover [--scenario scenario.json] [--steps 20] [--output report.json] [--screenshots]');process.exit(0);}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let reader,browser,page,started=false,report=null,code=0;
const output=path.resolve(args.output);
const supported=process.platform==='win32'?'nvda':process.platform==='darwin'?'voiceover':null;
async function snapshot(){return page.evaluate(()=>{
 const r=e=>{const b=e.getBoundingClientRect();return {selector:StudioAudit.selector(e),x:b.x+scrollX,y:b.y+scrollY,width:b.width,height:b.height};};
 let focused=document.activeElement;while(focused?.shadowRoot?.activeElement)focused=focused.shadowRoot.activeElement;
 return {scrollX,scrollY,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),domFocus:focused?{selector:StudioAudit.selector(focused),tag:focused.localName}:null,elements:StudioEvidence.roots(document).flatMap(root=>Array.from(root.querySelectorAll('header,nav,main,section,footer,[role="dialog"],h1,h2,button,input'))).slice(0,250).map(r)};
});}
try{
 if(!supported)throw new Error('실제 NVDA/VoiceOver 실행은 Windows/macOS 데스크톱에서만 지원합니다. Linux에서 대체 발화를 만들어 통과 처리하지 않습니다.');
 const engine=args.reader||supported;if(engine!==supported)throw new Error('NVDA는 Windows, VoiceOver는 macOS에서 실행하세요.');
 if(!args.url)throw new Error('--url을 지정하세요.');const url=new URL(args.url);if(!/^https?:$/.test(url.protocol)||url.username||url.password)throw new Error('인증정보가 없는 http/https URL만 허용합니다.');
 const count=Number(args.steps);if(!Number.isInteger(count)||count<1||count>150)throw new Error('--steps는 1~150 정수여야 합니다.');
 const scenario=args.scenario?validateScenario(JSON.parse(await fs.readFile(path.resolve(args.scenario),'utf8'))):Array.from({length:count},()=>({command:'next'}));
 const {chromium}=await import('playwright');const gp=await import('@guidepup/guidepup');reader=engine==='nvda'?gp.nvda:gp.voiceOver;
 if(!reader.detect())throw new Error('스크린리더가 감지되지 않았습니다. SCREEN-READER.md의 공식 설치·권한 설정을 완료하세요.');
 await reader.start({capture:true});started=true;
 browser=await chromium.launch({headless:false});page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(15000);
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{await rl.question('브라우저에서 필요한 로그인·메뉴 상태를 준비하세요. NVDA 탐색 모드 또는 VoiceOver 웹 콘텐츠 상호작용과 시작 위치를 확인한 뒤 이 터미널에서 Enter를 누르세요. 발화에 개인정보가 포함될 수 있습니다.\n');}finally{rl.close();}
 await page.bringToFront();
 for(const file of ['core.js','evidence.js','focus.js'])await page.addScriptTag({path:path.join(root,'public/assets',file)});
 const axe=path.join(root,'node_modules/axe-core/axe.min.js');try{await fs.access(axe);await page.addScriptTag({path:axe});}catch{}
 report=await page.evaluate(()=>StudioAudit.run(document,{mode:'real-screen-reader',state:'사용자가 준비한 화면'}));
 report.screenReader={status:'partial',engine:reader.name,engineVersion:reader.version,steps:[],environment:{os:process.platform,release:os.release(),browser:browser.version(),scope:'준비된 현재 페이지, 최상위 문서 중심',startPosition:'사용자 설정'},note:'실제 엔진의 발화 기록입니다. 유한한 시나리오의 관찰 결과이며 전체 접근성 합격·인증이 아닙니다. DOM 초점은 스크린리더 가상 커서 위치가 아닙니다.'};
 try{const cdp=await page.context().newCDPSession(page);await cdp.send('Accessibility.enable');const {nodes}=await cdp.send('Accessibility.getFullAXTree');report.accessibilityTree={note:`Chromium 내부 접근성 트리. 실제 발화 아님. 최상위 프레임 기준. ${nodes.length}개 중 최대 2,000개 저장. 입력 value 속성 미저장.`,nodes:nodes.slice(0,2000).map(n=>({nodeId:n.nodeId,ignored:n.ignored,role:n.role?.value,name:n.name?.value,childIds:n.childIds}))};await cdp.detach();}catch(e){report.limitations.push('접근성 트리 미수집: '+e.message);}
 await page.evaluate(()=>StudioFocus.start());let previous=await snapshot();
 for(let i=0;i<scenario.length;i++){
  await page.bringToFront();const step=await captureStep(reader,scenario[i]);
  // Correlated measurements, not a claim that the virtual cursor caused every layout change.
  await page.waitForTimeout(550);const current=await snapshot();
  const record={sequence:i+1,time:new Date().toISOString(),...step,domFocus:current.domFocus,layoutChanges:compareLayout(previous,current),overflowBefore:previous.overflow,overflowAfter:current.overflow,scroll:{x:current.scrollX,y:current.scrollY}};
  if(args.screenshots){const dir=output.replace(/\.json$/i,'')+'-screenshots';await fs.mkdir(dir,{recursive:true});const file=path.join(dir,`step-${String(i+1).padStart(3,'0')}.png`);await page.screenshot({path:file,mask:[page.locator('input,textarea,select,[contenteditable]')]});record.screenshotFile=path.basename(file);}
  report.screenReader.steps.push(record);previous=current;
  console.log(`${i+1}/${scenario.length}: ${step.command} / ${step.speech.length}개 발화 / ${step.assertion.status}`);
 }
 report.focus=await page.evaluate(()=>StudioFocus.stop());
 report.screenReader.status=report.screenReader.steps.some(s=>s.speech.length)?'recorded':'failed';
 if(report.screenReader.status==='failed')report.screenReader.error='발화가 한 건도 수집되지 않았습니다. 시작 위치·탐색 모드·권한을 확인하세요.';
 if(report.screenReader.status==='failed'||report.screenReader.steps.some(s=>s.assertion.status==='fail'))code=1;
}catch(e){code=1;console.error(e.message);if(report){report.screenReader.status=report.screenReader.steps.length?'partial':'failed';report.screenReader.error=e.message;}}
finally{
 if(report){await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log('보고서 저장: '+output);}
 try{await browser?.close();}catch{}if(started){try{await reader.stop();}catch{}}
}
process.exitCode=code;
