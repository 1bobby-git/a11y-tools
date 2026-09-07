# 실제 NVDA / VoiceOver 실행

`runner/`는 Guidepup을 통해 실제 운영체제 스크린리더를 시작하고 탐색 명령별 발화를 기록합니다. DOM으로 발화를 추측하는 가상 스크린리더가 아닙니다. 이 실행부는 Windows/macOS 데스크톱에서 동작하도록 작성했으며 이번 Linux 개발 환경에서는 실제 엔진 전체 흐름을 검증하지 못했습니다.

## 준비

Node.js 20 이상과 데스크톱 로그인 세션이 필요합니다. 스크린리더가 필요 없는 별도 테스트 세션에서 진행하세요. 실행 시 스크린리더를 시작하고 종료 시 중지하므로 현재 사용 중인 보조기술 세션에 영향을 줄 수 있습니다.

저장소 루트에서 기본 검사 엔진을 설치·빌드합니다.

```sh
npm install --ignore-scripts
npm run build
cd runner
npm install
npx playwright install chromium
npx @guidepup/setup setup
npx @guidepup/setup install
```

Guidepup 설치 도구는 운영체제 접근성/자동화 권한을 설정합니다. 표시되는 권한 안내를 검토하세요. macOS 권한 우회를 위해 시스템 보호를 끄지 말고 공식 수동 권한 설정을 따르세요.

## 실행

Windows:

```sh
node audit.mjs --url https://example.com --reader nvda --steps 20 --output report.json
```

macOS:

```sh
node audit.mjs --url https://example.com --reader voiceover --steps 20 --output report.json
```

브라우저가 열리면 로그인·메뉴 등 검사할 상태를 준비합니다. NVDA 탐색 모드 또는 VoiceOver 웹 콘텐츠 상호작용과 시작 위치를 직접 확인한 후 터미널에서 Enter를 누릅니다. 브라우저가 다시 활성화되며 탐색이 시작됩니다. 자동화 중 다른 창을 조작하면 기록이 달라질 수 있습니다. 브라우저 도구 모음에 머무르는 발화가 나오면 시작 위치를 수정해 다시 실행하세요.

생성된 `report.json`을 온라인 도구에서 가져온 뒤 **초점 · 레이아웃 → 실제 스크린리더 검사**에서 봅니다. `recorded`는 발화 수집 상태이지 접근성 합격이 아닙니다. 무발화·실행 실패는 완료로 처리하지 않습니다.

## 시나리오와 기대 발화

`scenario.example.json`의 기대 문구를 실제 페이지 내용으로 바꿔 사용합니다.

```sh
node audit.mjs --url https://example.com --reader nvda --scenario scenario.example.json --output report.json
```

지원 명령은 next/previous, 제목·링크·랜드마크 앞뒤 탐색, interact/stopInteracting, Tab/Shift+Tab/Escape입니다. 임의 코드, 텍스트 입력, 클릭·제출·결제 명령은 지원하지 않습니다. 1~150단계의 유한한 시나리오이며 페이지 전체 탐색을 보장하지 않습니다.

`expected`는 해당 단계 발화에 문자열이 포함되는지만 검사합니다. 논리적 순서·정확한 의미·모든 접근성 기준의 자동 판정이 아닙니다. 실패가 있으면 종료 코드 1을 반환합니다.

## 레이아웃과 개인정보

각 탐색 후 550ms 시점에 최대 250개 주요 요소의 문서 기준 위치·크기와 가로 넘침을 비교합니다. 동시에 기록된 변화이지 그 변화의 원인이 스크린리더라는 확정은 아닙니다. 화면 스크롤과 DOM 초점은 가상 커서 위치와 구분됩니다. 기존 Tab 기록기는 120ms·500ms 표본도 유지합니다.

`--screenshots`를 명시한 경우에만 단계별 화면을 별도 PNG로 저장합니다. 입력 필드는 가리지만 화면 텍스트·실제 발화·접근성 트리 이름에는 개인정보가 남을 수 있습니다. 자동 외부 전송은 없으며 공유 전에 직접 확인하세요.

Chromium 내부 접근성 트리는 최상위 프레임 기준 최대 2,000개 노드만 저장합니다. 입력 value 속성은 저장하지 않습니다. 프레임·닫힌 Shadow DOM·다른 브라우저·JAWS·모바일 TalkBack/VoiceOver까지 검증한 것으로 해석하면 안 됩니다.

## 공식 문서

- https://www.guidepup.dev/docs/getting-started
- https://www.guidepup.dev/docs/api/class-nvda
- https://www.guidepup.dev/docs/api/class-voiceover
- https://github.com/guidepup/setup
- https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/
- https://playwright.dev/docs/accessibility-testing
