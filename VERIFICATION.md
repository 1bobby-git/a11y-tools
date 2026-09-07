# v0.2.0 검증 기록

2026-09-07, Linux 컨테이너의 Node.js 22 및 실제 Chromium에서 실행했습니다.

## 실행 결과

- Node 정적·단위 테스트: 22개 통과 (`npm test`).
- 기존 Chromium 회귀 테스트: 45개 통과 (`python tests/browser_test.py`).
- 증거 표시 Chromium 추가 테스트: 29개 통과 (`python tests/evidence_browser_test.py`).
- 합계 96개. 별도로 Linux에서 실제 스크린리더 실행을 성공으로 위장하지 않고 종료 코드 1을 반환함을 확인했습니다.

추가 검사: 첫 번째를 포함한 중복 요소 전체, 중복 대상 130개 미생략, 중복 조상·특수문자 ID의 정확한 선택자, Shadow DOM 트리 분리, 연결 참조 4개 수집, 새 ID 충돌 회피, 민감 입력값 제거, 자식 마크업 유지, axe 결과 어댑터, 구체적 수정 예시, 변경된 원본 위치 거부, 마크업·연결 참조 HTML 내보내기, 스크립트·외부 네트워크 차단, 데스크톱·390px 모바일 넘침 없음.

`tests/evidence-verification.json`은 추가 29개 테스트의 실제 결과입니다. `tests/artifacts/evidence-desktop.png`, `evidence-mobile.png`는 테스트용 페이지의 화면입니다. 사용자 실사이트 검사 결과가 아닙니다.

## 검증하지 않은 부분

- 설치된 Chrome/Edge 확장에서 activeTab 권한, 탭 활성화, 실제 스크린샷 캡처까지 이어지는 전체 흐름.
- Windows NVDA / macOS VoiceOver의 설치·권한·실제 발화 전체 흐름. 단위 테스트의 드라이버는 가짜 테스트 객체이며 실제 스크린리더 검사로 계산하지 않았습니다.
- 로컬 axe-core 패키지 다운로드·실행. 추가 브라우저 테스트의 axe 응답은 결정적 API 결과 fixture입니다. 실제 axe 실행이라고 주장하지 않습니다. 배포 워크플로는 실제 패키지 설치를 요구합니다.
- 모든 브라우저·보조기술·교차 출처 프레임·닫힌 Shadow DOM·법적 적합성 및 인증.

원격 배포 상태는 실제 GitHub Actions 결과로 별도 확인해야 합니다. 이 파일은 배포 성공을 미리 보증하지 않습니다.
