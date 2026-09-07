"""Local Chromium regression tests. Axe result fixtures are adapters, not a claim of live axe execution."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,re
ROOT=Path(__file__).resolve().parents[1]
P=ROOT/'public'
OUT=ROOT/'tests/artifacts'
OUT.mkdir(exist_ok=True)
passed=[]
def check(name,condition):
    assert condition,name
    passed.append(name)
    print('PASS',name)
def inject(page,files):
    for f in files:page.add_script_tag(content=(P/'assets'/f).read_text())
def app(browser):
    p=browser.new_page(viewport={'width':1440,'height':1000})
    html=(P/'index.html').read_text()
    html=re.sub(r'<script\b[^>]*src="[^"]+"[^>]*></script>','',html)
    html=re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>','',html)
    p.set_content(html)
    for f in ['style.css','evidence.css']:p.add_style_tag(content=(P/'assets'/f).read_text())
    inject(p,['config.js','standards.js','core.js','evidence.js','evidence-ui.js','focus.js','app.js'])
    return p
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    p=b.new_page()
    p.set_content('''<html lang="ko"><head><title>대상별 증거 테스트</title></head><body><h1>가입 정보</h1>
<section><label for="email">대표 이메일</label><input id="email" type="email" value="PRIVATE_VALUE"></section>
<section><label for="email">추가 이메일</label><input id="email" type="email"></section>
<section><span id="email" class="help">안내 문구</span><button aria-describedby="email">도움말</button></section>
<span id="email-1"></span><a href="#email">이메일로 이동</a><div id="host"></div></body></html>''')
    inject(p,['core.js','evidence.js'])
    report=p.evaluate('StudioAudit.run(document,{axe:false})')
    dup=next(f for f in report['findings'] if f['ruleId']=='duplicate-id')
    check('all 3 duplicate elements including the first are present',dup['totalNodes']==3 and len(dup['nodes'])==3)
    check('duplicate selectors are distinct',len({n['selector'] for n in dup['nodes']})==3)
    check('every selector resolves its exact DOM element',p.evaluate('(nodes)=>nodes.every((n,i)=>StudioAudit.find(n.selector)===document.querySelectorAll("[id=email]")[i])',dup['nodes']))
    check('all 4 references are listed',len(dup['references'])==4)
    check('proposed IDs do not collide with existing email-1',all(n['proposedId']!='email-1' for n in dup['nodes']))
    check('text content is preserved',any('안내 문구' in n['html'] for n in dup['nodes']))
    check('private input values do not enter markup or previews','PRIVATE_VALUE' not in json.dumps(report,ensure_ascii=False))
    check('fix includes all proposed IDs',all(n['proposedId'] in dup['fix'] for n in dup['nodes']))
    before=p.evaluate('document.documentElement.outerHTML')
    p.evaluate('StudioAudit.run(document,{axe:false})')
    check('evidence collection does not mutate the source DOM',before==p.evaluate('document.documentElement.outerHTML'))
    p.evaluate('document.getElementById("host").attachShadow({mode:"open"}).innerHTML=`<b id="email">독립 트리</b><i id="shadow-dupe"></i><i id="shadow-dupe"></i>`')
    r2=p.evaluate('StudioAudit.run(document,{axe:false})')
    check('different roots are not merged',len([f for f in r2['findings'] if f['ruleId']=='duplicate-id'])==2)
    sd=next(f for f in r2['findings'] if f.get('duplicateId')=='shadow-dupe')
    check('shadow-root duplicate locators are unique and resolvable',p.evaluate('(nodes)=>nodes.every(n=>!!StudioAudit.find(n.selector))',sd['nodes']) and len({n['selector'] for n in sd['nodes']})==2)
    check('actual screen reader is marked not-run by DOM audit',r2['screenReader']['status']=='not-run')
    p.evaluate('document.querySelector("[id=email]").remove()')
    check('stale evidence refuses locating a changed element',p.evaluate('(path)=>{try{StudioEvidence.originalNode(path);return false}catch{return true}}',dup['nodes'][0]['selector']))
    # Nested duplicate ancestors and CSS escaping.
    p.set_content('<main><section id="wrap"><button id="strange:id">첫째</button></section><section id="wrap"><button id="strange:id">둘째</button></section></main>')
    r3=p.evaluate('StudioAudit.run(document,{axe:false})')
    nd=next(f for f in r3['findings'] if f.get('duplicateId')=='strange:id')
    check('nested duplicate ancestors and special IDs resolve correctly',p.evaluate('(nodes)=>nodes.every((n,i)=>StudioAudit.find(n.selector)===document.querySelectorAll("button")[i])',nd['nodes']))
    # 130 duplicates: no first-N target omission.
    p.set_content('<html lang="ko"><title>다수 대상</title><main>'+''.join('<span id="many">대상 '+str(i)+'</span>' for i in range(130))+'</main></html>')
    many=p.evaluate('StudioAudit.run(document,{axe:false})')
    check('130 duplicates are all retained',next(f for f in many['findings'] if f.get('duplicateId')=='many')['totalNodes']==130)
    # A deterministic axe API-result fixture validates the bridge, not the real engine.
    p.set_content('<html lang="ko"><title>axe 어댑터</title><button id="icon" data-token="PRIVATE_TOKEN" onclick="alert(1)"><span class="icon"></span></button></html>')
    p.evaluate('''window.axe={run:async()=>({testEngine:{version:'adapter-fixture'},violations:[{id:'button-name',help:'Buttons must have discernible text',description:'Name is missing',tags:['wcag412'],helpUrl:'https://dequeuniversity.com/rules/axe/4.13/button-name',nodes:[{target:['#icon'],html:'<button id="icon" data-token="PRIVATE_TOKEN"></button>',failureSummary:'Fix any of the following: Element has no name'}]}],incomplete:[],passes:[],inapplicable:[]})}''')
    ar=p.evaluate('StudioAudit.run(document)')
    af=next(f for f in ar['findings'] if f['source']=='axe')
    check('axe HTML evidence replaces blanket omission','<button' in af['html'] and '저장하지 않음' not in af['html'])
    check('axe HTML includes descendant markup','class="icon"' in af['html'])
    check('axe remediation is a concrete Korean example','aria-label="검색"' in af['guidance']['example'])
    check('axe semantic title is explained in Korean','스크린리더' in af['title'])
    check('secret data attributes and handlers are excluded','PRIVATE_TOKEN' not in json.dumps(ar) and 'onclick=' not in af['html'])
    a=app(b)
    a.evaluate('(r)=>StudioApp.loadReport(r)',report)
    a.locator('#findings > details').first.evaluate('(d)=>d.open=true')
    check('UI presents all duplicate markup cards',a.locator('#findings > details').first.locator('.evidence-node').count()==3)
    check('UI lists linked references and correction labels','함께 수정할 연결 속성' in a.locator('#findings').inner_text())
    a.locator('#findings > details').first.locator('.evidence-visual button').first.click()
    check('preview is sandboxed with no script privileges',a.locator('.evidence-visual iframe').first.get_attribute('sandbox')=='')
    check('preview blocks external connections',"default-src 'none'" in a.locator('.evidence-visual iframe').first.get_attribute('srcdoc'))
    check('HTML export retains all duplicate nodes and references',all(n['selector'].replace('>','&gt;') in a.evaluate('StudioApp.reportHTML()') for n in dup['nodes']) and '연결 속성 for' in a.evaluate('StudioApp.reportHTML()'))
    check('new evidence UI has no desktop overflow',a.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    a.screenshot(path=str(OUT/'evidence-desktop.png'),full_page=True)
    a.set_viewport_size({'width':390,'height':844})
    check('new evidence UI has no 390px mobile overflow',a.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    a.screenshot(path=str(OUT/'evidence-mobile.png'),full_page=True)
    check('malformed node evidence is rejected',a.evaluate('''()=>{const r=structuredClone(StudioApp.getReport());r.findings[0].nodes=[null];try{StudioApp.validateReport(r);return false}catch{return true}}'''))
    check('malicious preview scripts and external resource attributes are removed',a.evaluate('''()=>{const s=StudioEvidenceUI.safePreview('<script>parent.PWNED=true</script><img src="https://example.com/private" onerror="alert(1)"><iframe srcdoc="bad"></iframe>');return !s.includes('<script')&&!s.includes('onerror=')&&!s.includes('<iframe')&&!s.includes('src="https:')}'''))
    b.close()
(ROOT/'tests/evidence-verification.json').write_text(json.dumps({'environment':'Local Chromium fixtures; axe adapter fixture only; real screen-reader not run','passed':len(passed),'tests':passed},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':len(passed)}))
