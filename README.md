# 접근성 스튜디오 (Accessibility Studio)

마크업·대체 콘텐츠·실제 DOM 초점 이동과 레이아웃 변화를 점검하는 한국어 웹 도구입니다.

> **상태: v0.1.0 배포 준비본. `1bobby-git/a11y-tools` 공개 저장소는 확인했지만, 이 대화의 도구에서는 원격 업로드·Pages 설정을 실행하지 못했습니다. 실제 게시 완료본이 아닙니다.**
>
> 대상 저장소: `1bobby-git/a11y-tools`
>
> 배포 후 예정 주소: `https://1bobby-git.github.io/a11y-tools/`

## 먼저 실행

Windows에서는 압축을 푼 뒤 `START-LOCAL.cmd`를 실행하고 `http://127.0.0.1:4173/`를 여세요. **Node.js 20 이상**이 필요합니다.

```bash
npm start
```

`public/index.html`을 파일로 직접 열면 브라우저의 로컬 파일 제한으로 데모·엔진 로딩이 실패할 수 있습니다. 위 로컬 서버 또는 GitHub Pages를 사용하세요.

이 첨부본은 외부 패키지를 가져올 수 없는 환경에서 만들었으므로 **기본 DOM 검사 엔진만 포함**합니다. `vendor-axe.js`는 실행 여부를 속이지 않는 명시적 자리표시자입니다. 아래 빌드 단계가 axe-core를 설치·번들합니다. 외부 네트워크 없이도 기본 검사·데모·초점 기록·보고서 작성은 실행할 수 있습니다.

## 실제 페이지를 검사하는 방법

GitHub Pages 웹 화면 자체는 외부 사이트를 URL만으로 가져와 검사하지 않습니다. 실제 대상 문서는 Chrome/Edge 확장 프로그램을 이용합니다.

1. `public/downloads/accessibility-studio-extension.zip`을 풀거나 프로젝트의 `extension/` 폴더를 사용합니다.
2. `chrome://extensions` 또는 `edge://extensions`에서 개발자 모드를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**에서 `manifest.json`이 있는 폴더를 선택합니다.
4. 검사 대상 탭에서 확장 아이콘 → **이 페이지 검사**를 실행합니다. 결과는 확장 프로그램의 로컬 보고서 탭으로 열립니다.
5. **초점 기록 시작** 후 팝업을 닫고 대상 페이지에서 Tab·Shift+Tab·위젯 방향키를 직접 사용합니다. **중지하고 보고서**에서 확인합니다.
6. JSON으로 내보낸 보고서는 온라인 웹의 **검사 보고서 가져오기**로 열 수 있습니다. 보고서 데이터는 서버에 업로드되지 않습니다.

메뉴·팝업·탭이 열리는 상태별로 따로 검사하고 상태 이름을 남기세요. 새로운 문서로 이동하면 새로 검사해야 합니다. 확장 프로그램은 웹 스토어에 등록되지 않았으며, 현재 제공 환경에서는 **실제 설치 후의 전체 확장 프로그램 동작을 검증하지 못했습니다.**

## 구현한 범위

| 기능 | 현재 구현 |
|---|---|
| 마크업 | 문서 제목·언어, 중복 id, ARIA 참조, 제목 계층, 레이블 후보, 표 구조, 조작 요소 중첩 검토 |
| 이미지 | 대체 이름 누락 탐지, 빈 alt와 의미 있는 alt의 문맥 검토, 이미지 목록 |
| 영상·오디오 | 자막 트랙 인벤토리, 대체 콘텐츠 수동 검토, 자동 재생 설정 확인 |
| 초점 | 실제 focusin과 Tab / Shift+Tab 연결 기록, DOM 기준 초점 후보 별도 목록 |
| 레이아웃 | 가로 넘침 증가, 구역 위치·크기 변화, 화면 밖 초점, 가림 표본, layout-shift 이벤트 |
| 수동 점검 | KWCAG 2.2의 33개 항목, 미검토·수동 통과·수동 실패·해당 없음 및 근거 |
| 보고서 | JSON 내보내기/가져오기, 독립 HTML 보고서, 이전 보고서 대비 새 발견·미발견 비교 |
| HTML 검사 | 사용자 스크립트·외부 요청을 차단한 격리 미리보기, 320/390/768/1280px 폭 선택 |
| 추가 엔진 | 설치·빌드 후 axe-core 4.13.0 추가 실행. 미설치·실패를 명시 |

## 중요한 판정 원칙

- 자동 오류가 없다는 것이 전체 접근성 준수, 품질인증 합격 또는 장차법 적합 판정은 아닙니다.
- 빈 `alt`는 장식 이미지라면 적절할 수 있으므로 자동 오류로 처리하지 않습니다.
- 자막 트랙이 없어도 화면 밖 대본 등 대체 콘텐츠가 있을 수 있고, 트랙이 있어도 자막 정확성은 검토해야 합니다.
- 제목 수준 건너뜀·양수 `tabindex`·레이아웃 변화는 검토 단서이며 무조건적인 기준 위반으로 확정하지 않습니다.
- **DOM 키보드 초점과 스크린리더 탐색 모드의 가상 커서는 다릅니다.** 실제 발화·가상 커서·운영체제 접근성 트리를 자동으로 수집하지 않습니다. NVDA/VoiceOver로 의미 있는 읽기 순서를 별도 확인하세요.
- `focus()`를 순서대로 호출해서 실제 Tab 이동을 검사한 것처럼 표시하지 않습니다. 기록 중 CSS·DOM·초점·스크롤을 변경하지 않습니다. 사용자가 명시적으로 누르는 “미리보기에서 위치 보기”는 스크롤만 수행합니다.
- HTML 문법 검사기를 완전히 대체하지 않습니다. 브라우저가 이미 복구한 원본 중첩·중복 속성은 별도 원본 검사 대상입니다.
- 전체 접근 가능한 이름 계산은 기본 엔진이 아닌 axe-core 및 실제 보조기술 결과로 확인해야 합니다.

### 레이아웃 기록의 정확한 범위

초점 이벤트 직후 120ms, 500ms에 최대 80개 구역과 초점 대상의 크기·좌표를 표본 측정합니다. 일반 문서 좌표에는 문서 스크롤량을 보정하며 고정/스티키 구역의 단순 위치 차이는 제외합니다. 내부 스크롤 컨테이너·CSS 애니메이션·의도된 메뉴 확장은 오탐을 만들 수 있습니다. 가림 탐지는 최대 5개 화면 좌표의 `elementFromPoint` 표본입니다. 픽셀 단위의 완전한 가시성 판정이나 모든 변화 포착을 보장하지 않습니다.

`layout-shift`는 사용자 입력 직후의 기록도 보관합니다. 이 값을 성능 지표 CLS 점수로 표기하지 않습니다. 스크린샷 자동 캡처 기능은 이 버전에 포함하지 않습니다.

현재 문서와 열린 Shadow DOM을 검사합니다. iframe 내부, 닫힌 Shadow DOM, Canvas 내부, 새 문서, 숨겨진 미개방 상태는 별도 검사 대상입니다.

## axe-core 포함 빌드

```bash
npm install --ignore-scripts
npm run build
npm test
npm start
```

`npm run build`는 설치된 axe-core 배포 파일과 라이선스를 로컬로 복사하고, 확장 프로그램 ZIP 및 Pages용 `docs/`를 만듭니다. 런타임에 CDN 코드를 불러오지 않습니다. 아직 설치되지 않았으면 기본 엔진으로 빌드되며 콘솔과 결과 화면에 명시됩니다.

배포 단계에서는 의존성이 없는 상태를 허용하지 않습니다.

```bash
node scripts/build.mjs --require-axe
```

## 기존 `a11y-tools` 저장소에 게시

**Git 및 GitHub CLI(`gh`)가 설치된 Windows**에서 압축을 푼 뒤 `DEPLOY-WINDOWS.cmd`를 실행하세요. 필요한 경우 브라우저로 `1bobby-git` 계정에 로그인하고 `PUBLISH`를 입력합니다. 비밀번호나 토큰을 코드·채팅에 붙여넣지 않습니다. 배포 자체는 Node.js를 로컬에 설치하지 않아도 됩니다.

스크립트는 이미 존재하는 `1bobby-git/a11y-tools`를 별도 임시 폴더에 복제하고, 소스를 커밋·푸시합니다. 저장소를 새로 만들거나 강제 푸시하지 않습니다. 기존 프로젝트가 다른 앱이면 중단합니다. GitHub Pages 게시 방식을 GitHub Actions로 설정하고 `.github/workflows/pages.yml`을 실행합니다.

Actions에서는 Node.js 22로 고정된 axe-core 버전을 설치하고, 엔진 포함 빌드 및 정적 테스트가 성공한 경우에만 `docs/`를 게시합니다. 이후 스크립트가 **워크플로 성공·실제 사이트 HTTP 200·`build-info.json`의 정확한 커밋 일치·axe 번들 포함**을 모두 확인해야 배포 성공으로 표시합니다.

Windows에서의 스크립트 실행과 GitHub 원격 배포는 아직 검증하지 못했습니다. 실패 시 이미 완료된 원격 단계는 남을 수 있습니다. 토큰을 저장소에 추가하지 말고 Actions 로그를 확인하세요. 워크플로 파일 권한 오류가 발생한 경우 `gh auth refresh --hostname github.com --scopes workflow`로 필요한 권한을 브라우저에서 승인할 수 있습니다.

**GitHub Desktop을 사용할 때:** 압축 안의 `a11y-tools` 폴더 내용 전체(숨김 `.github` 포함)를 복제한 저장소 루트에 복사해 커밋·푸시합니다. Settings → Pages → Source를 **GitHub Actions**로 선택하고, Actions → Deploy a11y-tools to Pages → Run workflow를 실행합니다. 이후 `main`으로 푸시하면 빌드·배포가 다시 실행됩니다.

현재 ZIP의 `docs/`는 기본 엔진으로 로컬 검증한 출력입니다. Actions가 axe-core를 설치하고 다시 빌드하기 전에는 axe 검사가 포함됐다고 표시하지 않습니다.

## 배포 참고

- 공식 Pages 설정: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- 공식 Pages 워크플로: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- 공식 GitHub CLI: https://cli.github.com/

## 테스트와 검증 상태

`tests/verification.json`과 `VERIFICATION.md`를 확인하세요. 결과를 만들 때 **실사이트·설치 확장·axe-core·GitHub 원격 배포를 테스트한 것으로 주장하지 않습니다.**

```bash
npm run build
npm test
python -m pip install playwright
python -m playwright install chromium
npm run test:browser
```

브라우저 테스트는 외부 통신 없이 메모리에서 테스트 자산을 제공하고 Chromium에서 실제 DOM·샌드박스·키보드 입력을 실행합니다. 필요하면 `CHROMIUM_PATH` 환경변수로 Chromium 실행 파일을 지정하세요. 출력 스크린샷은 `tests/artifacts/`에 생성됩니다.

## 개인정보

외부 AI API·분석 서버·추적기를 사용하지 않습니다. 폼 입력값·쿠키·세션 토큰·네트워크 요청 본문을 수집하지 않고 URL의 쿼리·해시·사용자 인증 부분을 제거합니다. 다만 **URL 경로·레이블·제목·대체텍스트·id·class·ARIA 내용**에도 개인정보가 포함될 수 있으므로 결과 공유 전에 확인하세요. “외부 전송 없음”은 이 앱이 검사 보고서를 분석 서버로 전송하지 않는다는 뜻이며, 사용자가 연 대상 사이트 자체의 통신을 차단한다는 뜻은 아닙니다.

확장 프로그램은 최신 보고서 1건을 `chrome.storage.local`, 진행 중인 기록을 `chrome.storage.session`에 보관합니다. 웹/로컬 보고서 탭은 해당 탭의 `sessionStorage`에 보관합니다. 각각 제공된 삭제 기능으로 제거해야 하며, 이미 다운로드한 파일은 별도로 삭제해야 합니다.

공개 GitHub Pages에 개인 검사 JSON을 커밋하지 마세요. 일반적인 보고서 파일명과 `reports/`는 `.gitignore`로 제외했습니다.

## 구조

```text
public/                  웹 앱 원본
  assets/core.js         기본 DOM 검사·보고서 모델
  assets/focus.js        실제 DOM 초점·레이아웃 관찰
  assets/app.js          대시보드·격리 HTML 검사·보고서
  assets/standards.js    KWCAG 33개 수동 검토 항목
  downloads/            설치용 확장 프로그램 ZIP
extension/               MV3 확장 프로그램 원본 및 공용 자산
scripts/build.mjs        엔진 복사·ZIP 생성·Pages 출력
scripts/deploy.ps1       기존 저장소 업로드·Actions 배포·커밋 검증
scripts/serve.mjs        로컬 HTTP 서버
tests/                  자동 검증 및 실제 초점 측정 근거
docs/                   생성된 GitHub Pages 게시물
```

## 기준 및 기술 참고

- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- W3C Focus Order: https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html
- W3C Focus Not Obscured: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- 국내 인증 심사 기준: https://www.kwacc.or.kr/Accessibility/Certification
- KWCAG 2.2 비공식 HTML 열람본: https://a11ykr.github.io/kwcag22/ (공식 원문 링크 포함)
- NVDA 사용자 안내: https://download.nvaccess.org/documentation/en/userGuide.html
- axe-core 원본·라이선스: https://github.com/dequelabs/axe-core
- Chrome scripting API: https://developer.chrome.com/docs/extensions/reference/api/scripting
- GitHub Pages API: https://docs.github.com/en/rest/pages/pages

KWCAG 번호는 표준 본문의 5~8절을 사용합니다. axe의 WCAG 규칙과 KWCAG 항목을 전부 동일하다고 가정하지 않습니다. 기본 검사별 연결은 관련 항목 안내이며, 해당 항목 전체를 자동 검사한다는 뜻이 아닙니다.

## 라이선스

직접 작성한 코드: MIT. 설치 후 포함하는 axe-core: upstream MPL-2.0 라이선스와 고지를 그대로 보존합니다. 이 저장소는 법률 자문·공식 인증 서비스가 아닙니다.
