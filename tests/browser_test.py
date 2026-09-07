"""Offline Chromium fixtures. No external website or deployment is contacted.
The sandbox blocks URL navigation, so assets are supplied in memory; application
logic, DOM auditing, sandbox scripts and actual keyboard events remain native.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, re, os

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(parents=True, exist_ok=True)
RESULTS = []

def check(name, condition):
    if not condition:
        raise AssertionError(name)
    RESULTS.append({'test': name, 'status': 'passed'})
    print('PASS', name)

def inject(page, files):
    for file in files:
        page.add_script_tag(content=(PUBLIC / 'assets' / file).read_text(encoding='utf-8'))

def fixture(browser, html):
    page = browser.new_page(viewport={'width': 1000, 'height': 800})
    page.set_content(html)
    inject(page, ['core.js', 'evidence.js', 'focus.js'])
    return page

def run(page):
    return page.evaluate('StudioAudit.run(document, {axe: false})')

def findings(report, rule):
    return [f for f in report['findings'] if f['ruleId'] == rule]

def load_app(browser):
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    html = (PUBLIC / 'index.html').read_text(encoding='utf-8')
    html = re.sub(r'<script\b[^>]*src="[^"]+"[^>]*></script>', '', html)
    html = re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>', '', html)
    page.set_content(html)
    page.add_style_tag(content=(PUBLIC / 'assets/style.css').read_text(encoding='utf-8')+(PUBLIC / 'assets/evidence.css').read_text(encoding='utf-8'))
    resources = {f'assets/{f}': (PUBLIC / 'assets' / f).read_text(encoding='utf-8') for f in ['core.js', 'evidence.js', 'focus.js', 'vendor-axe.js', 'player.js', 'preview-runtime.js']}
    resources['demo.html'] = (PUBLIC / 'demo.html').read_text(encoding='utf-8')
    page.evaluate('''resources => { window.fetch = async path => {
      if (!(path in resources)) throw new Error('Unexpected external request: ' + path);
      return new Response(resources[path], {status: 200});
    }; }''', resources)
    inject(page, ['config.js', 'standards.js', 'core.js', 'evidence.js', 'evidence-ui.js', 'focus.js', 'app.js'])
    return page

with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    browser = p.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])
    page = fixture(browser, '<html><body><img id="missing"><img id="decorative" alt=""><img id="meaningful" alt="회사 로고"><img id="presentational" role="presentation"><div id="same"></div><div id="same"></div><button id="named" aria-label="검색"><span aria-hidden="true">x</span></button><button id="unnamed"><span aria-hidden="true">x</span></button><label for="email">이메일</label><input id="email"><input id="private" value="TOP_SECRET_123" type="password"><button aria-labelledby="nonexistent">대상</button><button aria-controls="lazy-panel">동적</button><h1>제목</h1><h3>하위</h3><video controls></video><button tabindex="2">순서</button><iframe></iframe></body></html>')
    result = run(page)
    check('missing document title is detected', bool(findings(result, 'document-title')))
    check('missing document language is detected', bool(findings(result, 'html-lang')))
    check('duplicate ID is detected', len(findings(result, 'duplicate-id')) == 1)
    check('missing image alternative is detected', any('missing' in f['selector'] for f in findings(result, 'image-alt')))
    check('decorative empty alt is REVIEW not ERROR', all(f['status'] == 'review' for f in result['findings'] if 'decorative' in f['selector']))
    check('presentational image is not missing-alt error', not any('presentational' in f['selector'] for f in findings(result, 'image-alt')))
    check('meaningful image alternative is not missing-alt error', not any('meaningful' in f['selector'] for f in findings(result, 'image-alt')))
    check('aria-label button is recognized', not any('#named' in f['selector'] for f in findings(result, 'control-name')))
    check('hidden icon does not label a button', any('#unnamed' in f['selector'] for f in findings(result, 'control-name')))
    check('explicit form label is recognized', not any('#email' in f['selector'] for f in findings(result, 'control-name')))
    check('password value is not collected', 'TOP_SECRET_123' not in json.dumps(result))
    check('broken ARIA label reference is detected', any(f['status'] == 'error' for f in findings(result, 'aria-refs')))
    check('lazy aria-controls target remains REVIEW', any(f['status'] == 'review' for f in findings(result, 'aria-refs')))
    check('missing video track remains REVIEW', findings(result, 'media-alternative')[0]['status'] == 'review')
    check('heading jump remains REVIEW', findings(result, 'heading-order')[0]['status'] == 'review')
    check('positive tabindex remains REVIEW', findings(result, 'tabindex-positive')[0]['status'] == 'review')
    check('iframe content explicitly uninspected', result['inventory']['frames'][0]['status'] == 'not-inspected')
    check('missing axe engine explicitly reported', result['engine']['axe'] is None and any('axe-core' in x and '미검사' in x for x in result['limitations']))
    check('URL query and fragment are removed', page.evaluate('StudioAudit.cleanURL("https://example.com/account?token=secret#sensitive")') == 'https://example.com/account')
    page.close()

    page = fixture(browser, '<html lang="ko"><head><title>성공 케이스</title></head><body><fieldset disabled><input id="disabled"></fieldset><button hidden id="hidden">숨김</button><button id="live">실행</button><div id="host"></div><span id="reused"></span></body></html>')
    page.evaluate("html => document.querySelector('#host').attachShadow({mode: 'open'}).innerHTML = html", '<span id="reused">별도 트리</span><button id="shadow-button">그림자 버튼</button>')
    result = run(page)
    check('disabled fieldset child is excluded from candidates', not any('#disabled' in f['selector'] for f in result['inventory']['focusables']))
    check('hidden button is excluded from candidates', not any('#hidden' in f['selector'] for f in result['inventory']['focusables']))
    check('IDs in separate shadow trees are not duplicates', not findings(result, 'duplicate-id'))
    check('open shadow DOM is inspected', any('>>>' in f['selector'] for f in result['inventory']['focusables']))
    page.close()

    page = fixture(browser, '<html lang="ko"><head><title>Focus</title><style>body{margin:0}main{padding:20px}.bad:focus{width:1300px;height:90px;outline:none}button{height:35px}footer{height:70px}</style></head><body><main><button id="first">첫째</button><button class="bad" id="bad">레이아웃 변경</button><button id="last">마지막</button></main><footer>푸터</footer></body></html>')
    before = page.evaluate('document.documentElement.outerHTML')
    page.evaluate('StudioFocus.start()')
    page.locator('#first').focus()
    page.wait_for_timeout(550)
    page.keyboard.press('Tab')
    page.wait_for_timeout(650)
    focus = page.evaluate('StudioFocus.report()')
    bad = next(e for e in focus['events'] if '#bad' in e['selector'])
    check('real Tab event is recorded', bad['via'] == 'Tab')
    check('focus-triggered horizontal overflow is detected', any(s['overflowIncreasePx'] > 0 for s in bad['samples']))
    check('focus-triggered surrounding layout change is detected', any(s['changes'] for s in bad['samples']))
    check('recorder does not mutate DOM/styles', before == page.evaluate('document.documentElement.outerHTML'))
    page.evaluate('StudioFocus.stop()')
    count = len(page.evaluate('StudioFocus.report().events'))
    page.keyboard.press('Tab')
    page.wait_for_timeout(200)
    check('stop removes focus recording listeners', len(page.evaluate('StudioFocus.report().events')) == count)
    (ROOT / 'tests/focus-evidence.json').write_text(json.dumps(focus, ensure_ascii=False, indent=2), encoding='utf-8')
    page.close()

    app = load_app(browser)
    errors = []
    app.on('pageerror', lambda e: errors.append(str(e)))
    check('33 manual checklist controls are rendered', app.locator('#manual-list select').count() == 33)
    check('desktop layout has no page overflow', app.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    app.screenshot(path=str(ARTIFACTS / 'accessibility-studio-preview.png'), full_page=True)
    app.set_viewport_size({'width':390,'height':844})
    check('390px mobile layout has no page overflow', app.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    app.screenshot(path=str(ARTIFACTS / 'accessibility-studio-mobile.png'), full_page=True)
    app.set_viewport_size({'width':1440,'height':1000})
    app.click('#run-demo')
    app.wait_for_function('StudioApp.getReport() !== null')
    check('demo actually executes and finds issues', app.evaluate('StudioApp.getReport().findings.length') > 0)
    check('demo explicitly identified as demo', app.evaluate('StudioApp.getReport().page.mode') == 'demo')
    check('axe placeholder does not claim axe execution', 'axe 미실행' in app.locator('#report-scope').inner_text())
    app.screenshot(path=str(ARTIFACTS / 'accessibility-studio-results.png'), full_page=True)
    app.evaluate('StudioApp.showView("manual")')
    app.locator('[id="manual-5.1.1"]').select_option('fail')
    app.locator('textarea[aria-label="적절한 대체 텍스트 제공 판단 근거"]').fill('샘플 이미지 정보 불일치 확인')
    check('manual decision and evidence are included in report', app.evaluate('StudioApp.getReport().manual["5.1.1"].evidence') == '샘플 이미지 정보 불일치 확인')
    html_report = app.evaluate('StudioApp.reportHTML()')
    check('HTML report contains actual review evidence', '샘플 이미지 정보 불일치 확인' in html_report)
    check('invalid report schema is rejected', app.evaluate('(()=>{try{StudioApp.validateReport({schemaVersion:9});return false;}catch{return true;}})()'))
    check('review counts are not a legal score', app.locator('#stat-manual').inner_text() == '1 / 33')
    app.evaluate('''(()=>{const r=structuredClone(StudioApp.getReport());r.findings[0].title='<img src=x onerror="window.XSS=1">';StudioApp.loadReport(r,false);})()''')
    check('imported HTML is rendered as text', app.evaluate('window.XSS === undefined') and app.locator('#findings img').count() == 0)
    source='<!doctype html><html lang="ko"><head><title>Sandbox</title></head><body><h1>검사</h1><script>window.EXECUTED=true;parent.EXECUTED=true;</script><button onclick="window.EXECUTED=true">버튼</button><img src="https://example.com/private.png" alt="테스트"></body></html>'
    app.evaluate('(source)=>StudioApp.runSource(source)', source)
    app.wait_for_function('StudioApp.getReport().page.title === "Sandbox"')
    frame=next(f for f in app.frames if f.parent_frame)
    check('untrusted source scripts are not executed', frame.evaluate('window.EXECUTED===undefined'))
    check('inline event handlers are removed', frame.locator('button').get_attribute('onclick') is None)
    check('external image source is removed', frame.locator('img').get_attribute('src') is None)
    check('sandbox does not grant same-origin access', app.locator('#preview').get_attribute('sandbox') == 'allow-scripts')
    check('source resource sanitization is reported', app.evaluate('StudioApp.getReport().limitations.some(x=>x.includes("제거한 실행"))'))
    check('no uncaught application runtime errors', not errors)
    browser.close()

summary={'environment':'Chromium / offline in-memory assets; URL navigation is blocked by execution-environment policy', 'axeCore':'NOT bundled or executed in this environment', 'extensionLiveBrowser':'not executed as installed extension', 'passed':len(RESULTS), 'tests':RESULTS}
(ROOT / 'tests/verification.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passed':len(RESULTS)}, ensure_ascii=False))
