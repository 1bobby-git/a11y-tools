# v0.3.3 검증 기록

2026-10-31, Windows 11 Pro / Node.js 24.22.1 / Python 3.12.10 / Playwright 1.63.0 (Chromium 153)에서 실행했습니다.

## 실제 실행

- `npm ci --ignore-scripts` 후 `node scripts/build.mjs --require-axe`: axe-core 4.13.0 번들, 확장 ZIP 25개 파일(manifest 0.3.3) 확인.
- `npm test`: 정적·단위 테스트 41개 통과.
- `python tests/browser_test.py`: 45개 통과.
- `python tests/evidence_browser_test.py`: 29개 통과.
- `python tests/workspace_browser_test.py`: 42개 통과.
- `python tests/rules_browser_test.py`: 기본 규칙 회귀 77개 통과. 같은 파일을 수정 전 main(04aea42)에 실행하면 47개가 실패하고 화면 밖 워크스페이스 검사에서 멈춥니다(실패 대상 오지정, span·href 없는 링크 누락, 숨김·ARIA 이름 iframe 오류, 닫힌 모달의 초점 후보, 내용 기반 이름과 입력 내용 수집, `role="heading"` 수준, 화면 밖 워크스페이스 검사 멈춤). 리뷰 반영 전 PR 커밋(9f26b29)에 실행하면 19개가 실패합니다(aria-hidden 영역 속 Tab 가능한 iframe·summary·편집 영역·영상 누락, 편집 제목과 `aria-labelledby`의 입력 내용 수집, 편집 영역 안 결과의 마크업 증거, 기본 규칙 엔진이 다른 보고서를 같은 조건으로 비교).
- 합계 234개.

수정 전 main에서 이미 실패하던 항목도 있었습니다. `browser_test.py`의 axe 미실행 표시 검사는 axe-core가 실제로 번들된 뒤 갱신되지 않았습니다. `workspace_browser_test.py`의 두 번째 HTML 검사는 미리보기가 화면 밖에 있어 끝나지 않았습니다. `evidence_browser_test.py`·`workspace_browser_test.py`는 `/usr/bin/chromium` 고정 경로 때문에 Windows에서 실행되지 않았습니다. 이번 변경에서 모두 수정했습니다.

같은 고정 예제를 axe-core 4.13.0으로도 검사했습니다. 수정한 기본 규칙은 axe의 `frame-title`·`select-name`·`label`·`role-img-alt`·`svg-img-alt`·`heading-order`가 보고한 요소를 같은 대상으로 보고합니다. `custom-keyboard`에 해당하는 axe 규칙은 없습니다.

## 미검증 범위

PR CI(GitHub Actions, Linux)의 결과는 PR 화면에서 확인합니다. 설치형 확장의 실제 탭 검사·캡처, Edge, NVDA·VoiceOver 실행은 이번에도 검증하지 않았습니다. 기본 규칙은 전체 접근 가능한 이름 계산이 아니며 axe-core와 실제 보조기술 확인을 대체하지 않습니다.

# v0.3.0 검증 기록

2026-09-07, Linux / Node.js 22 / Chromium에서 실행했습니다.

## 실제 실행

- `npm test`: 정적·단위 테스트 36개 통과.
- `python tests/browser_test.py`: 기존 브라우저 회귀 45개 통과.
- `python tests/evidence_browser_test.py`: 중복 ID·마크업 증거 회귀 29개 통과.
- `python tests/workspace_browser_test.py`: 현재 DOM 재검사·재생 42개 통과.
- 합계 152개. 결과 파일: `tests/workspace-verification.json`.

현재 DOM에서만 중복 ID를 수정하고 새 ARIA 오류·대체텍스트를 추가해 결과가 갱신되는지 확인했습니다. iframe의 JS 상태와 열린 메뉴는 유지되고, 보고서 ID·시간은 갱신됩니다. 이전 초점·수동 판단·스크린리더 결과가 새 결과에 섞이지 않습니다. 실패 시 기존 결과가 보존되고 JSON 단독 보고서는 현재 DOM 연결 없이 재검사하지 않습니다.

자동 .focus() 이동, 현재 마크업 표시, 전후 이동, 일시정지·재개·중지, 반복, Esc, 동적 후보 추가/삭제, 양수 tabindex, 라디오 그룹, 열린 Shadow DOM, 숨김·disabled·inert 제외를 실제 Chromium에서 검사했습니다. 자동 초점으로 발생한 가로 넘침과 주변 영역 크기 변화가 120ms/500ms 표본에 기록됩니다. 1440px·390px 화면의 페이지 가로 넘침 없음과 초기 비영(非零) 뷰포트도 확인했습니다.

확장 서비스 워커의 탭 바인딩·종료·권한 거부·출처 변경·동일 출처 새 문서 재연결·실패 보존·명령 제한은 Chrome API 모의 객체로 검사했습니다. 이는 실제 activeTab 권한 E2E 검사가 아닙니다.

## 미검증 범위

이 환경에서 확장을 로드한 Chromium 서비스 워커를 시작하려고 했으나 서비스 워커 대기 시간 초과로 설치형 전체 흐름은 검증하지 못했습니다. Windows/Edge 실사이트의 권한 부여부터 실제 원본 탭 제어·캡처까지는 사용자 환경에서 추가 확인이 필요합니다.

로컬 axe-core 패키지 설치·실행은 네트워크 제한으로 수행하지 못했습니다. 기본 엔진과 기존 axe 응답 어댑터 fixture를 시험했습니다. Pages 워크플로는 실제 axe-core 설치와 필수 번들을 수행합니다. NVDA·VoiceOver의 실제 발화, 모든 iframe·닫힌 Shadow DOM·법적 준수 판정은 이번 변경의 검증 범위가 아닙니다.

스크린샷과 브라우저 fixture는 테스트 페이지이며 사용자 실사이트 검사 결과가 아닙니다. 원격 배포 상태는 실제 Actions 결과로 별도 확인합니다.
