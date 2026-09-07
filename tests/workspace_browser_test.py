"""Chromium fixtures for current-DOM refresh and visible focus playback (not NVDA/VoiceOver)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,re,time
ROOT=Path(__file__).resolve().parents[1]; P=ROOT/'public'; OUT=ROOT/'tests/artifacts'; OUT.mkdir(exist_ok=True)
passed=[]
def check(name,value):
    assert value,name
    passed.append(name);print('PASS',name,flush=True)
def wait_frame(frame,expression,arg=None):
    for _ in range(120):
        if frame.evaluate(expression,arg):return
        time.sleep(0.05)
    raise AssertionError('Frame predicate timed out: '+expression)
def app(browser):
    page=browser.new_page(viewport={'width':1440,'height':1000})
    html=(P/'index.html').read_text();scripts=re.findall(r'<script[^>]*src="([^"]+)"',html)
    page.set_content(re.sub(r'<script\b[^>]*src="[^"]+"[^>]*></script>|<link\b[^>]*rel="stylesheet"[^>]*>','',html))
    for name in ['style.css','evidence.css','workspace.css']:page.add_style_tag(content=(P/'assets'/name).read_text())
    resources={f'assets/{f.name}':f.read_text() for f in (P/'assets').glob('*.js')};resources['demo.html']=(P/'demo.html').read_text()
    page.evaluate('r=>{window.fetch=async p=>{if(!(p in r))throw Error("unapproved resource");return new Response(r[p])}}',resources)
    for name in scripts:page.add_script_tag(content=(P/name).read_text())
    return page
SOURCE='''<html lang="ko"><head><title>현재 DOM 검증</title><style>body{margin:0}main{padding:20px}button{height:38px}.shifter:focus{width:1500px;height:130px;outline:none}footer{height:60px}</style></head><body>
<main><h1>검사 화면</h1><button id="first">첫째</button><button id="second" class="shifter">레이아웃 변경</button><button id="last">마지막</button><span id="dupe">중복 첫째</span><span id="dupe">중복 둘째</span><img id="image"><details open id="panel"><summary>열린 메뉴</summary><p>내용</p></details><p contenteditable="true" id="edit">편집 가능</p></main><footer>푸터</footer></body></html>'''
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=app(browser);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    check('refresh is unavailable without a live source',page.locator('#refresh-report').is_disabled())
    page.evaluate('(s)=>StudioApp.runSource(s)',SOURCE);page.wait_for_function('StudioApp.getReport()!==null')
    frame=next(f for f in page.frames if f!=page.main_frame)
    before=page.evaluate('StudioApp.getReport()');check('initial live workspace has a real nonzero viewport',before['page']['viewport']['width']>0 and before['page']['viewport']['height']>0)
    check('initial live workspace finds duplicate IDs',any(f['ruleId']=='duplicate-id' for f in before['findings']))
    check('workspace remains rendered on the results page',page.locator('#preview').is_visible() and frame.evaluate('document.querySelector("#first").getBoundingClientRect().width>0'))
    # Change only current DOM. No editor content or saved finding is updated.
    frame.evaluate('''()=>{window.keepMe=73;document.querySelectorAll('#dupe')[1].id='unique';document.querySelector('#image').alt='현재 대체텍스트';document.querySelector('#last').setAttribute('aria-controls','missing-now');document.querySelector('h1').textContent='새 화면 제목';}''')
    page.evaluate("StudioApp.getReport().focus={events:[{sequence:1,selector:'#stale',samples:[]}],layoutShifts:[]};StudioApp.getReport().manual={'5.1.1':{status:'pass',evidence:'old decision'}};StudioApp.getReport().screenReader={status:'completed',steps:[]}")
    page.locator('#refresh-report').click();page.wait_for_function('(id)=>StudioApp.getReport().id!==id',arg=before['id'])
    fresh=page.evaluate('StudioApp.getReport()')
    check('refresh uses changed live DOM rather than old markup',not any(f['ruleId']=='duplicate-id' for f in fresh['findings']))
    check('refresh adds newly introduced errors',any(f['ruleId']=='aria-refs' and 'missing-now' in f['detail'] for f in fresh['findings']))
    check('new alternative text is collected',any(i.get('alt')=='현재 대체텍스트' for i in fresh['inventory']['images']))
    check('refresh never reloads/rebuilds the iframe',frame.evaluate('window.keepMe===73'))
    check('open menu state is preserved',frame.evaluate('document.querySelector("#panel").open'))
    check('report ID and timestamp are renewed',fresh['id']!=before['id'] and fresh['createdAt']!=before['createdAt'])
    check('old focus and screen reader evidence is not relabelled fresh',fresh['focus']['events']==[] and fresh['screenReader']['status']=='not-run')
    check('old manual decisions are not relabelled fresh',not fresh['manual'])
    check('previous report can be explicitly saved',page.locator('#export-previous').is_visible())
    check('source basis is live DOM without reload',fresh['refresh']['basis']=='live-dom' and fresh['refresh']['reloaded'] is False)
    # Genuine focus() executes inside the rendered target document.
    page.locator('#player-speed').select_option('700');page.locator('#player-play').click()
    wait_frame(frame,'document.activeElement.id==="first"')
    check('play puts actual focus on first target',frame.evaluate('document.activeElement.id')=='first')
    wait_frame(frame,'document.activeElement.id==="second"')
    page.wait_for_timeout(560)
    focus=frame.evaluate('StudioPlayer.state().focus')
    entry=next(e for e in focus['events'] if '#second' in e['selector'])
    check('automatic focus is not reported as a Tab keystroke',entry['via']=='자동 재생 (.focus())')
    check('automatic playback catches focus-triggered horizontal overflow',any(s['overflowIncreasePx']>0 for s in entry['samples']))
    check('automatic playback catches surrounding layout movement',any(s['changes'] for s in entry['samples']))
    check('current focus markup is visible in workspace controls',len(page.locator('#player-current').inner_text())>0)
    page.locator('#player-pause').click();state=frame.evaluate('StudioPlayer.state(false)');page.wait_for_timeout(950)
    check('pause stops automatic progression',not frame.evaluate('StudioPlayer.state(false).running') and frame.evaluate('StudioPlayer.state(false).steps')==state['steps'])
    page.locator('#player-next').click();wait_frame(frame,'(n)=>StudioPlayer.state(false).steps>n',arg=state['steps'])
    check('next advances a real DOM focus while paused',not frame.evaluate('StudioPlayer.state(false).running'))
    page.locator('#player-previous').click();page.wait_for_timeout(100)
    check('previous moves in the opposite direction',frame.evaluate('StudioPlayer.state(false).index')==state['index'])
    page.locator('#player-play').click();page.wait_for_timeout(100)
    check('play resumes from paused position',frame.evaluate('StudioPlayer.state(false).running'))
    # Esc inside target cancels immediately and never blocks user input.
    frame.locator('body').press('Escape');page.wait_for_timeout(100)
    check('Esc pauses playback',not frame.evaluate('StudioPlayer.state(false).running') and 'Esc' in frame.evaluate('StudioPlayer.state(false).reason'))
    page.locator('#player-stop').click();page.wait_for_timeout(100)
    check('stop removes the active recorder',not frame.evaluate('StudioFocus.report().active'))
    frame.evaluate('''()=>{for(const el of document.querySelectorAll('button,summary,[contenteditable]'))el.remove();document.querySelector('main').insertAdjacentHTML('beforeend','<button id="inserted">새 버튼</button>')}''')
    page.locator('#player-play').click();wait_frame(frame,'document.activeElement.id==="inserted"')
    check('play recomputes candidates from the current DOM',frame.evaluate('StudioPlayer.state(false).total')==1)
    page.wait_for_timeout(850)
    check('non-loop playback ends instead of starting a second timer',not frame.evaluate('StudioPlayer.state(false).running'))
    page.locator('#player-loop').check();page.locator('#player-play').click();page.wait_for_timeout(850)
    check('repeat mode continues when explicitly selected',frame.evaluate('StudioPlayer.state(false).running') and frame.evaluate('StudioPlayer.state(false).steps')>=2)
    page.locator('#player-stop').click();page.wait_for_timeout(100)
    # Refresh failure leaves original findings/id intact.
    saved=page.evaluate('StudioApp.getReport().id');frame.evaluate('StudioAudit=Object.freeze({...StudioAudit,run:async()=>{throw Error("intentional test failure")}})')
    page.locator('#refresh-report').click();page.wait_for_function('document.querySelector("#refresh-status").textContent.includes("새로고침 실패")')
    check('failed refresh preserves existing report',page.evaluate('StudioApp.getReport().id')==saved)
    check('failed refresh releases the busy state',not page.locator('#refresh-report').is_disabled())
    # Imported evidence has no live connection and must never be refreshed from its stored HTML.
    page.evaluate('StudioApp.loadReport({...StudioApp.getReport(),id:"imported-only"})')
    check('imported-only report has refresh disabled',page.locator('#refresh-report').is_disabled())
    check('imported-only report explains missing current DOM','저장 HTML로 대체 검사하지 않습니다' in page.locator('#refresh-status').inner_text())
    try:page.evaluate('StudioApp.refreshReport()');no_fallback=False
    except Exception:no_fallback=True
    check('API also refuses snapshot fallback',no_fallback)
    # Visual regression with real controls and workspace, at desktop and narrow mobile.
    page.evaluate('(s)=>StudioApp.runSource(s)',SOURCE);page.wait_for_function('StudioApp.getReport().id!=="imported-only"')
    page.wait_for_timeout(500);page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(OUT/'workspace-desktop.png'),full_page=True)
    check('desktop workspace has no page-level horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'workspace-mobile.png'),full_page=True)
    check('mobile workspace has no page-level horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    check('no uncaught runtime errors',not errors)
    # Candidate filtering: include aria-hidden focus bugs; exclude disabled and non-tab stops.
    page.close();page=browser.new_page()
    page.set_content('''<fieldset disabled><legend><button id="legend">legend</button></legend><button id="disabled">disabled</button></fieldset><button id="hidden" hidden>hidden</button><button id="aria-hidden" aria-hidden="true">aria-hidden focus bug</button><div inert><button id="inert">inert</button></div><button id="negative" tabindex="-1">negative</button><button id="positive" tabindex="2">positive</button><input type="radio" name="r" id="radio1"><input type="radio" name="r" id="radio2" checked><div id="shadow"></div>''')
    for f in ['core.js','evidence.js','focus.js','player.js']:page.add_script_tag(content=(P/'assets'/f).read_text())
    page.evaluate('document.querySelector("#shadow").attachShadow({mode:"open"}).innerHTML="<button id=shadow-child>shadow</button>"')
    ids=page.evaluate('StudioPlayer.candidates().map(n=>n.id)')
    check('candidate list filters disabled, hidden, inert, negative and unchecked grouped radios',not any(n in ids for n in ['disabled','hidden','inert','negative','radio1']))
    check('disabled-fieldset legend and checked radio remain candidates','legend' in ids and 'radio2' in ids)
    check('aria-hidden focusable bug is not skipped','aria-hidden' in ids)
    check('open shadow DOM candidates are included','shadow-child' in ids)
    check('positive tabindex is rehearsed before normal candidates',ids[0]=='positive')
    page.evaluate('StudioPlayer.play({interval:700})');page.wait_for_timeout(1500);page.evaluate('StudioPlayer.pause()')
    check('all rehearsal events remain explicitly distinct from physical Tab',all(e['via']!='Tab' for e in page.evaluate('StudioPlayer.state().focus.events')))
    browser.close()
(ROOT/'tests/workspace-verification.json').write_text(json.dumps({'passed':len(passed),'tests':passed},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':len(passed)}))
