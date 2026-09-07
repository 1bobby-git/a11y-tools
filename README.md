# 접근성 스튜디오 · a11y-tools

한국어 웹접근성 점검 작업 공간입니다. 기존 `web-accessibility-studio` v0.1.0의 핵심 소스를 유지하고 이 저장소에 배포합니다.

## 온라인 도구

GitHub Pages 주소: **https://1bobby-git.github.io/a11y-tools/**

> 이 주소는 Pages 최초 활성화 및 배포 성공 후 사용할 수 있습니다. 현재 성공 여부는 저장소 Actions의 최신 실행 결과를 확인하세요.

## 주요 기능

- 마크업 구조, 문서 언어·제목, 레이블, ARIA 연결, 중복 ID, 표 및 조작 요소 점검
- 이미지 대체 이름과 영상·오디오 대체 정보 목록 및 수동 검토
- 실제 Tab / Shift+Tab 입력에 따른 초점 이동 기록
- 초점 이동 후 가로 넘침, 주변 요소 이동·크기 변화, 가려짐과 화면 밖 초점 관찰
- KWCAG 33개 수동 검토표와 JSON / HTML 보고서
- Chrome / Edge 확장 프로그램으로 현재 로그인된 페이지 검사
- axe-core 4.13.0을 배포 빌드에서 함께 번들

자동 검사 결과는 법적 적합성이나 접근성 인증을 보증하지 않습니다. 실제 스크린리더의 발화·가상 커서·논리적 읽기 순서 및 콘텐츠 의미의 적절성은 사람이 검토해야 합니다. 레이아웃 변화도 의도된 변화일 수 있으므로 자동 실패가 아닌 검토 근거로 표시합니다.

## 로컬 실행

Node.js 22 이상을 권장합니다. Windows에서는 `START-LOCAL.cmd`를 실행하거나 다음 명령을 사용하세요.

```sh
npm install --ignore-scripts
npm run build -- --require-axe
npm test
npm start
```

브라우저에서 `http://127.0.0.1:4173/`을 엽니다. 브라우저 회귀 검사까지 실행하려면 Python과 Playwright가 필요합니다.

```sh
python -m pip install playwright==1.57.0
python -m playwright install chromium
python tests/browser_test.py
```

## GitHub Pages 최초 활성화

1. 이 저장소의 **Settings → Pages**를 엽니다.
2. **Build and deployment → Source → GitHub Actions**를 선택합니다.
3. **Actions → Deploy accessibility studio → Run workflow**를 실행합니다.

이후 `main`에 변경이 올라오면 테스트 및 빌드 후 자동 배포됩니다. Pages 최초 활성화에는 저장소 관리 권한이 필요합니다. 기본 `GITHUB_TOKEN`으로 최초 활성화까지 수행하도록 구성하지 않습니다.

빌드는 `docs/`와 `public/downloads/accessibility-studio-extension.zip`을 생성합니다. 생성 파일은 중복 소스로 커밋하지 않으며 배포마다 같은 원본에서 다시 만듭니다. 테스트가 실패하면 배포하지 않습니다.

## 실사이트 검사

온라인 도구에서 **확장 프로그램 ZIP**을 다운로드하여 압축을 풉니다. Chrome의 `chrome://extensions` 또는 Edge의 `edge://extensions`에서 개발자 모드를 켠 뒤 **압축해제된 확장 프로그램을 로드합니다**로 설치하세요.

검사 대상 탭에서 확장 프로그램을 실행해 **이 페이지 검사**를 선택합니다. **초점 기록 시작** 후 페이지에서 직접 Tab / Shift+Tab을 누르고 **중지하고 보고서**로 기록을 확인합니다. 확장 프로그램이 생성한 JSON을 온라인 도구에 가져와 수동 검토·보고서 내보내기를 할 수 있습니다.

URL 입력은 대상 사이트를 열기만 합니다. 온라인 도구가 임의의 외부 URL을 서버에서 대신 열거나 자동으로 크롤링하지 않습니다. 설치 없이 **데모 페이지 검사**와 **HTML 소스 점검**을 먼저 사용할 수 있습니다.

## 개인정보와 한계

보고서에는 대상 페이지의 텍스트·마크업이 포함될 수 있습니다. 민감한 페이지 보고서를 외부에 공유하기 전에 내용을 확인하세요. 비밀번호 입력값은 수집하지 않으며 사이트 URL의 쿼리와 해시는 제거합니다. 보고서를 이 공개 저장소에 커밋하지 마세요.

상세 범위는 `SECURITY.md`와 `VERIFICATION.md`를 확인하세요. 핵심 검사는 AI 또는 외부 분석 API 없이 브라우저 내부에서 동작합니다.

## 소스 구조

- `public/`: 온라인 도구의 원본 화면 및 검사 엔진
- `extension/`: 현재 탭 검사 확장 프로그램 원본
- `scripts/`: 빌드 및 로컬 실행 도구
- `tests/`: 정적 검사 및 브라우저 검증
- `.github/workflows/pages.yml`: 테스트 및 Pages 배포
- `docs/`: 빌드로 생성되는 Pages 배포 파일 (커밋 제외)

MIT 라이선스. axe-core는 별도 MPL-2.0 라이선스이며 빌드에 해당 고지가 함께 포함됩니다.
