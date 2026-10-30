"""Chromium regressions for built-in rule accuracy (v0.3.3).
Small offline fixtures compare each built-in rule with the WCAG/ARIA behaviour it
cites. Results go to tests/artifacts/ (git-ignored); no external site is contacted.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, re

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(parents=True, exist_ok=True)
RESULTS = []
GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    RESULTS.append(name)
    print('PASS', name, flush=True)


def read(path):
    return path.read_text(encoding='utf-8')


def fixture(browser, html):
    page = browser.new_page(viewport={'width': 1000, 'height': 800})
    page.set_content(html)
    for file in ['core.js', 'evidence.js', 'focus.js']:
        page.add_script_tag(content=read(PUBLIC / 'assets' / file))
    return page


def audit(page):
    return page.evaluate('StudioAudit.run(document, {axe: false})')


def rule(report, rule_id):
    return [f for f in report['findings'] if f['ruleId'] == rule_id]


def flagged(report, rule_id, element_id):
    return any(f'#{element_id}' in f['selector'] for f in rule(report, rule_id))


def deep(inner):
    return '<section>' + '<div>' * 6 + inner + '</div>' * 6 + '</section>'


def launch(p):
    # Same lookup as browser_test.py: CHROMIUM_PATH, a system Chromium, else Playwright's own build.
    executable = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    return p.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])


with sync_playwright() as p:
    browser = launch(p)

    # 1. A finding must point at the element that failed, not at a look-alike.
    page = fixture(browser, '<html lang="ko"><head><title>대상 식별</title></head><body><main>'
                   + deep(f'<img alt="정상 이미지" src="{GIF}">') + deep(f'<img src="{GIF}" data-bad="deep">')
                   + f'<div id="dup"><img alt="정상 중복 조상" src="{GIF}"></div><div id="dup"><img src="{GIF}" data-bad="dup"></div>'
                   + '</main></body></html>')
    report = audit(page)
    missing = rule(report, 'image-alt')
    check('both missing-alt images are reported', len(missing) == 2)
    check('each missing-alt finding has exactly one target', all(f['totalNodes'] == 1 for f in missing))
    check('the reported target is the failing image, not a look-alike', all('data-bad' in f['nodes'][0]['html'] for f in missing))
    check('the finding selector resolves to the failing image',
          page.evaluate('(sels) => sels.every(s => StudioAudit.find(s)?.hasAttribute("data-bad"))', [f['selector'] for f in missing]))
    check('every inventory selector identifies exactly one element',
          page.evaluate('(sels) => sels.every(s => StudioEvidence.matches(s, document).length === 1)',
                        [i['selector'] for i in report['inventory']['images']]))
    page.close()

    # 2. Mouse-only custom controls (KWCAG 6.1.1 / WCAG 2.1.1).
    page = fixture(browser, '''<html lang="ko"><head><title>키보드</title></head><body><main>
<span id="span-onclick" onclick="void 0">가짜 버튼</span>
<span id="span-role" role="button">역할만 있는 span</span>
<a id="anchor-no-href" onclick="void 0">href 없는 링크</a>
<div id="div-onclick" onclick="void 0">div 버튼</div>
<button id="native" onclick="void 0">기본 버튼</button>
<a id="anchor-href" href="#top" onclick="void 0">href 있는 링크</a>
<span id="span-focusable" role="button" tabindex="0">초점 가능한 span</span>
<div role="tablist"><span id="tab-roving" role="tab" tabindex="-1">탭</span></div>
<svg width="10" height="10"><a id="svg-link" xlink:href="#top" onclick="void 0"><rect width="10" height="10"/></a></svg>
</main></body></html>''')
    report = audit(page)
    for element_id in ['span-onclick', 'span-role', 'anchor-no-href', 'div-onclick']:
        check(f'non-focusable custom control #{element_id} is reported', flagged(report, 'custom-keyboard', element_id))
    for element_id in ['native', 'anchor-href', 'span-focusable', 'tab-roving', 'svg-link']:
        check(f'keyboard-reachable control #{element_id} is not reported', not flagged(report, 'custom-keyboard', element_id))
    page.close()

    # 3. Frame titles (KWCAG 6.4.2 / WCAG 4.1.2).
    page = fixture(browser, '''<html lang="ko"><head><title>프레임</title></head><body><main>
<iframe id="titled" title="제품 영상"></iframe>
<iframe id="untitled"></iframe>
<iframe id="aria-named" aria-label="매장 지도"></iframe>
<iframe id="display-none" style="display:none"></iframe>
<iframe id="hidden-attr" hidden></iframe>
<iframe id="aria-hidden" aria-hidden="true" tabindex="-1"></iframe>
<iframe id="fallback-text">이 브라우저는 iframe을 지원하지 않습니다.</iframe>
</main></body></html>''')
    report = audit(page)
    errors = [f for f in rule(report, 'frame-title') if f['status'] == 'error']
    check('a visible untitled iframe is an error', any('#untitled' in f['selector'] for f in errors))
    check('fallback text inside an iframe is not a frame title', any('#fallback-text' in f['selector'] for f in errors))
    check('a titled iframe is not reported', not flagged(report, 'frame-title', 'titled'))
    for element_id in ['display-none', 'hidden-attr', 'aria-hidden']:
        check(f'hidden iframe #{element_id} is not a frame-title error', not flagged(report, 'frame-title', element_id))
    check('an aria-label-only iframe is review, not an automatic error',
          [f['status'] for f in rule(report, 'frame-title') if '#aria-named' in f['selector']] == ['review'])
    check('hidden iframes stay in the frame inventory', len(report['inventory']['frames']) == 7)
    page.close()

    # 4. aria-hidden regions: only real Tab stops are a problem (axe aria-hidden-focus semantics).
    page = fixture(browser, '''<html lang="ko"><head><title>숨김 초점</title></head><body><main>
<div id="closed-modal" class="modal" aria-hidden="true" style="display:none"><button>닫기</button></div>
<div id="non-rendered" aria-hidden="true"><button style="display:none">a</button><button style="visibility:hidden">b</button><input type="hidden" name="token" value="x"><button disabled>c</button></div>
<div id="inert-inside" aria-hidden="true"><div inert><a href="#x">d</a></div></div>
<div id="live-bug" aria-hidden="true"><a href="#x">숨겨진 링크</a></div>
<button id="self-bug" aria-hidden="true">자기 자신</button>
<div id="hidden-summary" aria-hidden="true"><details><summary>더 보기</summary>내용</details></div>
<div id="hidden-editor" aria-hidden="true"><div contenteditable="true">편집</div></div>
<div id="hidden-video" aria-hidden="true"><video controls width="40" height="20"></video></div>
<div id="hidden-frame-removed" aria-hidden="true"><iframe tabindex="-1"></iframe></div>
</main></body></html>''')
    report = audit(page)
    for element_id in ['closed-modal', 'non-rendered', 'inert-inside', 'hidden-frame-removed']:
        check(f'non-focusable aria-hidden region #{element_id} is not reported', not flagged(report, 'hidden-focus', element_id))
    for element_id in ['live-bug', 'self-bug', 'hidden-summary', 'hidden-editor', 'hidden-video']:
        check(f'focusable content in aria-hidden #{element_id} is still reported', flagged(report, 'hidden-focus', element_id))
    page.close()

    # 4b. A carousel slide hidden with aria-hidden still lets Tab into its untitled video frame.
    # frame-title exempts hidden frames, so hidden-focus must report the Tab stop.
    page = fixture(browser, '''<html lang="ko"><head><title>슬라이드</title></head><body><main>
<div id="slide" class="slide" aria-hidden="true"><iframe id="slide-frame"></iframe></div>
</main></body></html>''')
    page.keyboard.press('Tab')
    check('the first Tab stops at the untitled iframe inside aria-hidden', page.evaluate('document.activeElement?.id') == 'slide-frame')
    report = audit(page)
    check('a Tab-reachable iframe inside aria-hidden is reported by hidden-focus', flagged(report, 'hidden-focus', 'slide'))
    page.close()

    # 5. Accessible names: only roles that allow it take their name from content.
    page = fixture(browser, '''<html lang="ko"><head><title>이름</title></head><body><main>
<select id="select-unlabelled"><option>서울</option><option>부산</option></select>
<label for="select-labelled">지역</label><select id="select-labelled"><option>서울</option></select>
<textarea id="textarea-unlabelled">DEFAULT_PRIVATE_TEXT</textarea>
<label>소개 <textarea id="textarea-wrapped">WRAPPED_PRIVATE_TEXT</textarea></label>
<div id="editor" contenteditable="true" tabindex="0">TYPED_PRIVATE_DRAFT</div>
<div id="div-img-text" role="img">별 다섯 개</div>
<svg id="svg-title" role="img" width="10" height="10"><title>매출 차트</title><rect width="10" height="10"/></svg>
<svg id="svg-text-only" role="img" width="40" height="10"><text y="9">차트</text></svg>
<button id="icon-svg-label"><svg aria-label="검색" width="10" height="10"></svg></button>
<button id="icon-span-label"><span class="icon" aria-label="닫기"></span></button>
<button id="icon-hidden"><span aria-hidden="true">x</span></button>
<nav id="nav-unnamed"><a href="#home">홈 링크 텍스트</a></nav>
<nav id="nav-named" aria-label="주 메뉴"><a href="#a">메뉴</a></nav>
</main></body></html>''')
    report = audit(page)
    check('an unlabelled select is not named by its options', flagged(report, 'control-name', 'select-unlabelled'))
    check('a labelled select is not reported', not flagged(report, 'control-name', 'select-labelled'))
    check('an unlabelled textarea is not named by its default text', flagged(report, 'control-name', 'textarea-unlabelled'))
    check('a role=img element is not named by its text content',
          any('#div-img-text' in f['selector'] and f['status'] == 'error' for f in rule(report, 'image-alt')))
    check('an SVG title still names role=img', not flagged(report, 'image-alt', 'svg-title'))
    check('an SVG with only <text> has no image name', flagged(report, 'image-alt', 'svg-text-only'))
    check('a labelled SVG icon names its button', not flagged(report, 'control-name', 'icon-svg-label'))
    check('a labelled icon span names its button', not flagged(report, 'control-name', 'icon-span-label'))
    check('an aria-hidden icon still leaves its button unnamed', flagged(report, 'control-name', 'icon-hidden'))
    landmarks = {l['selector']: l['name'] for l in report['inventory']['landmarks']}
    check('an unnamed nav is not named by its links', landmarks.get('nav#nav-unnamed') == '')
    check('a named nav keeps its aria-label', landmarks.get('nav#nav-named') == '주 메뉴')
    check('the main landmark is not named by the whole page text', all(n == '' for s, n in landmarks.items() if s.endswith('main')))
    focusable = {f['selector']: f['name'] for f in report['inventory']['focusables']}
    check('a wrapping label is named without the textarea content', focusable.get('textarea#textarea-wrapped') == '소개')
    serialized = json.dumps(report, ensure_ascii=False)
    for secret in ['DEFAULT_PRIVATE_TEXT', 'WRAPPED_PRIVATE_TEXT', 'TYPED_PRIVATE_DRAFT']:
        check(f'{secret} does not enter the report', secret not in serialized)
    page.evaluate('StudioFocus.start()')
    page.locator('#editor').focus()
    page.wait_for_timeout(150)
    events = page.evaluate('StudioFocus.stop().events')
    check('focusing an editor records the event', any('#editor' in e['selector'] for e in events))
    check('the focus timeline does not record typed editor text', 'TYPED_PRIVATE_DRAFT' not in json.dumps(events, ensure_ascii=False))
    page.close()

    # 6. Heading levels (ARIA: role=heading defaults to aria-level 2).
    page = fixture(browser, '''<html lang="ko"><head><title>제목</title></head><body><main>
<h1>문서 제목</h1><div id="role-heading" role="heading">역할 제목</div><h4 id="after-role">h4로 건너뜀</h4>
<h2 id="aria-override" aria-level="5">aria-level 재정의</h2>
</main></body></html>''')
    report = audit(page)
    levels = {h['selector']: h['level'] for h in report['inventory']['headings']}
    check('role=heading without aria-level is level 2', levels.get('div#role-heading') == 2)
    check('a jump from the role heading to h4 is reported', flagged(report, 'heading-order', 'after-role'))
    check('aria-level overrides the tag level', levels.get('h2#aria-override') == 5)
    page.close()

    # 6b. Editors hold what the user typed: headings that are (or sit inside) editors and
    # aria-labelledby references to editors or form fields must not copy that text.
    page = fixture(browser, '''<html lang="ko"><head><title>편집 제목</title></head><body><main>
<h1 id="editable-title" contenteditable="true" role="textbox" aria-label="Add title">HEADING_PRIVATE_DRAFT</h1>
<div contenteditable="true"><h2 id="heading-in-editor">EDITOR_PRIVATE_HEADING</h2></div>
<h2 id="plain-heading">일반 제목</h2>
<h3 id="empty-editable-heading" contenteditable="true"></h3>
<div contenteditable="true"><h5 id="jump-in-editor">EVIDENCE_PRIVATE_HEADING</h5></div>
<span id="memo-label">메모</span>
<div id="draft" contenteditable="true">LABELLEDBY_PRIVATE_DRAFT</div>
<textarea id="notes">LABELLEDBY_PRIVATE_DEFAULT</textarea>
<div id="summary-box">요약 <textarea>LABELLEDBY_WRAPPED_DEFAULT</textarea></div>
<button id="by-editor" aria-labelledby="draft"></button>
<button id="by-mixed" aria-labelledby="memo-label notes"></button>
<button id="by-wrapper" aria-labelledby="summary-box"></button>
<button id="by-hidden-label" aria-labelledby="hidden-label"></button><div id="hidden-label" hidden><span>숨은 레이블</span></div>
</main></body></html>''')
    page.locator('#editable-title').click()
    page.keyboard.press('End')
    page.keyboard.type('TYPED_HEADING_SECRET')
    report = audit(page)
    headings = {h['selector']: h['name'] for h in report['inventory']['headings']}
    check('an editable heading is named by its aria-label, not its content', headings.get('h1#editable-title') == 'Add title')
    check('a heading inside an editor has no name from its content', headings.get('h2#heading-in-editor') == '')
    check('a plain heading keeps its text', headings.get('h2#plain-heading') == '일반 제목')
    for element_id in ['editable-title', 'heading-in-editor', 'empty-editable-heading']:
        check(f'editable heading #{element_id} is not reported as an empty heading', not flagged(report, 'heading-empty', element_id))
    check('a level jump inside an editor is still reported', flagged(report, 'heading-order', 'jump-in-editor'))
    focusable = {f['selector']: f['name'] for f in report['inventory']['focusables']}
    check('aria-labelledby does not read a referenced editor', focusable.get('button#by-editor') == '')
    check('a button labelled only by an editor is reported as unnamed', flagged(report, 'control-name', 'by-editor'))
    check('aria-labelledby skips a referenced textarea but keeps other references', focusable.get('button#by-mixed') == '메모')
    check('aria-labelledby skips a textarea inside the referenced element', focusable.get('button#by-wrapper') == '요약')
    check('aria-labelledby still reads a hidden referenced label', focusable.get('button#by-hidden-label') == '숨은 레이블')
    serialized = json.dumps(report, ensure_ascii=False)
    for secret in ['HEADING_PRIVATE_DRAFT', 'TYPED_HEADING_SECRET', 'EDITOR_PRIVATE_HEADING', 'LABELLEDBY_PRIVATE_DRAFT',
                   'LABELLEDBY_PRIVATE_DEFAULT', 'LABELLEDBY_WRAPPED_DEFAULT', 'EVIDENCE_PRIVATE_HEADING']:
        check(f'{secret} does not enter the report', secret not in serialized)
    page.close()

    # 7. The HTML workspace must finish even when the preview is scrolled out of view.
    app = browser.new_page(viewport={'width': 1440, 'height': 1000})
    html = read(PUBLIC / 'index.html')
    scripts = re.findall(r'<script[^>]*src="([^"]+)"', html)
    app.set_content(re.sub(r'<script\b[^>]*src="[^"]+"[^>]*></script>|<link\b[^>]*rel="stylesheet"[^>]*>', '', html))
    for name in ['style.css', 'evidence.css', 'workspace.css']:
        app.add_style_tag(content=read(PUBLIC / 'assets' / name))
    resources = {f'assets/{f.name}': read(f) for f in (PUBLIC / 'assets').glob('*.js')}
    app.evaluate('r => { window.fetch = async p => { if (!(p in r)) throw Error("unapproved resource"); return new Response(r[p]); }; }', resources)
    for name in scripts:
        app.add_script_tag(content=read(PUBLIC / name))
    app.locator('#html-source').fill('<!doctype html><html lang="ko"><head><title>화면 밖 미리보기</title></head><body><main><h1>검사</h1><img src="x"></main></body></html>')
    app.locator('#run-source').scroll_into_view_if_needed()
    app.evaluate("document.getElementById('run-source').click()")
    app.wait_for_function('StudioApp.getReport()?.page.title === "화면 밖 미리보기"', timeout=10000)
    check('an off-screen HTML workspace still completes its audit', app.evaluate('StudioApp.getReport().findings.length') > 0)
    check('the off-screen workspace audit reports a real viewport', app.evaluate('StudioApp.getReport().page.viewport.width') > 0)

    # 8. Report comparison: a different built-in rule engine is not "the same conditions".
    def compare_with(engine_builtin):
        previous = app.evaluate('StudioApp.getReport()')
        previous['engine']['builtin'] = engine_builtin
        app.evaluate('() => { const s = document.getElementById("compare-summary"); s.hidden = true; s.textContent = ""; }')
        app.locator('#compare-file').set_input_files(files=[{'name': 'previous.json', 'mimeType': 'application/json',
                                                             'buffer': json.dumps(previous, ensure_ascii=False).encode('utf-8')}])
        app.wait_for_function('() => { const s = document.getElementById("compare-summary"); return !s.hidden && s.textContent !== ""; }')
        return app.locator('#compare-summary').inner_text()
    current_engine = app.evaluate('StudioApp.getReport().engine.builtin')
    check('a report from the same rule engine compares under the same conditions', '같은 URL' in compare_with(current_engine))
    check('a report from another rule engine is not the same conditions', '조건이 달라' in compare_with('0.3.2'))
    app.close()
    browser.close()

(ARTIFACTS / 'rules-verification.json').write_text(json.dumps({'environment': 'Chromium offline fixtures; axe not run in rule fixtures', 'passed': len(RESULTS), 'tests': RESULTS}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'passed': len(RESULTS)}, ensure_ascii=False))
