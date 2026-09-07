# 변경 기록

## 0.1.0 — 초기 베타 / a11y-tools 이전

- 기존 web-accessibility-studio의 검사 화면·기본 DOM 엔진·초점 기록 코드를 유지합니다.
- 지정 저장소 `1bobby-git/a11y-tools` 및 `/a11y-tools/` Pages 경로를 적용합니다.
- 마크업·대체 콘텐츠 점검, 실제 Tab / Shift+Tab 기록, 초점 이동 후 레이아웃 변화 근거, KWCAG 33개 수동 검토표를 제공합니다.
- 현재 탭 검사 확장 프로그램과 온라인 도구를 같은 소스에서 빌드합니다.
- GitHub Actions에서 axe-core 4.13.0을 필수로 설치·번들하고 테스트 통과 후 Pages에 게시하도록 구성합니다.
- 배포 후 홈페이지·axe-core 파일·확장 ZIP의 HTTP 응답과 ZIP 무결성을 확인합니다.
- GitHub Pages 최초 활성화는 저장소 Settings → Pages → GitHub Actions에서 설정합니다.
- 기존 새 저장소 생성용 Windows 배포 스크립트는 사용하지 않습니다. 배포는 이 저장소의 Actions로 통일합니다.

자동 결과는 접근성 인증 또는 법적 적합 판정이 아닙니다. 실제 스크린리더의 읽기·발화와 콘텐츠 의미는 별도 검토해야 합니다.
