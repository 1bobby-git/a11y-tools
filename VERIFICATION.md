# 검증 범위

## 확인된 원격 실행 — 2026-09-07

- 실행: https://github.com/1bobby-git/a11y-tools/actions/runs/34088912084
- 대상 커밋: `af5946e82cdb9e03a04549ed8228884b41c55919`
- GitHub Ubuntu 러너에서 axe-core 4.13.0 설치 및 사이트·확장 ZIP 빌드 성공.
- Node.js 정적 테스트 7개 통과.
- 실제 axe-core를 포함한 Chromium 회귀 테스트 45개 통과.
- `accessibility-test-evidence` 및 `github-pages` 아티팩트 생성 성공.
- 최초 게시 시도는 `Check Pages configuration`에서 `Not Found`로 중단됐습니다. 이 시점에는 Pages가 활성화되지 않아 공개 URL 검증도 실행되지 않았습니다.

위 내용은 해당 실행의 기록입니다. 이후 최신 배포 상태는 저장소 Actions에서 확인하세요. 빌드 성공과 공개 사이트 게시 성공은 별개입니다.

## 브라우저 검사 범위

- 데스크톱·390px 모바일 가로 넘침, 실제 Tab 기록, 초점으로 인한 가로 넘침 및 주변 구역 변화, 기록기의 DOM 비변경을 확인합니다.
- HTML 샌드박스의 스크립트·이벤트 차단, 보고서 문자열 비실행 렌더링, 입력 비밀번호 값 미수집을 확인합니다.
- 브라우저 검사는 외부 사이트 대신 메모리로 제공한 테스트 자산을 사용합니다. 로컬 기본 엔진 검사 45개 통과도 별도로 확인했습니다.

## 배포 검증

`.github/workflows/pages.yml`은 axe-core 설치 → 빌드 → 정적 검사 → Chromium 회귀 검사 → Pages 아티팩트 업로드 → 배포 → 공개 URL 확인 순서로 구성합니다. 한 단계가 실패하면 다음 배포를 진행하지 않습니다.

실제 실행 결과와 스크린샷은 **Actions → Deploy accessibility studio**의 로그 및 `accessibility-test-evidence` 아티팩트를 확인하세요.

## 검증하지 않은 범위

- 설치된 Chrome / Edge 확장 프로그램의 전체 실사이트 흐름과 브라우저별 권한 동작.
- NVDA / VoiceOver 발화·가상 커서, 모바일 보조기술.
- iframe 내부·닫힌 Shadow DOM·모든 페이지와 동적 상태.
- 모든 KWCAG / WCAG 항목, 원본 HTML 문법 전체, 법적 적합성 또는 인증.

테스트 결과와 스크린샷은 의도적으로 만든 예제 화면의 데이터이며 실제 고객 사이트의 검사 결과가 아닙니다.
