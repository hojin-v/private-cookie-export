# Private Cookie Export

Firefox의 사생활 보호 탭에서, 사용자가 승인한 사이트의 쿠키를 Netscape `cookies.txt` 파일로 내보내는 GNU GPL v3 오픈소스 확장입니다. 호환 도구가 **이미 로그인한 세션을 사용해야 할 때** 이 파일이 필요합니다. 로그인 없이 가능한 작업에는 파일이 필요 없습니다.

확장 화면과 내장 도움말은 Firefox 언어에 맞춰 한국어 또는 영어로 표시됩니다. 다른 언어에서는 영어가 기본값입니다.

| 한눈에 보기 | 확인할 내용 |
| --- | --- |
| **무엇을 내보내나요?** | 일반 사이트는 현재 HTTPS 페이지에 적용되는 쿠키, YouTube는 `www.youtube.com/robots.txt`에 적용되는 사생활 보호 쿠키를 담습니다. |
| **개발자 서버로 보내나요?** | 쿠키 값을 개발자 서버로 보내는 코드 경로가 없습니다. Firefox는 확장 내부에서 만든 파일을 기기에 저장합니다. 소스와 함께 연결 차단 정책 및 Firefox 검사가 공개되어 있습니다. |
| **필요한 쿠키만 담나요?** | 사이트·경로·사생활 보호 저장소를 기준으로 제한합니다. 그 범위 안의 사이트 설정 쿠키도 포함될 수 있습니다. 로그인에 필요한 최소 개별 쿠키를 선별하는 기능은 제공하지 않습니다. |

## 무엇이 파일에 들어가는가

| 모드 | 실제 조회 범위 | 동작과 목적 |
| --- | --- | --- |
| 일반 HTTPS 사이트 | 활성 페이지 URL로 조회합니다. 현재 호스트의 쿠키와 현재 경로에 적용되는 상위 도메인 공유 쿠키가 포함될 수 있습니다. | 페이지 이동 없이 사이트가 브라우저에 저장한 상태를 옮깁니다. 환경설정이나 세션 쿠키가 같이 들어갈 수 있습니다. |
| YouTube | `https://www.youtube.com/robots.txt`에 적용되는 쿠키로 조회합니다. 다른 YouTube 호스트 전용 쿠키와 다른 경로 쿠키는 제외합니다. `LOGIN_INFO`와 API 세션 관련 쿠키가 존재하는지 형태를 확인합니다. | 같은 탭을 `www.youtube.com/robots.txt`로 이동해 쿠키 갱신을 줄입니다. 계정 세션이 실제로 유효한지는 가져온 도구와 사이트가 확인합니다. |

두 모드 모두 **승인된 사생활 보호 탭 한 개**에서 준비 버튼을 눌러야 읽습니다. 일반 탭, 관련 없는 호스트·경로, 만료된 쿠키, 분리된 파티션의 쿠키는 제외합니다. YouTube도 기존 `cookies.txt`의 **현재 컨테이너와 사이트** 옵션과 같은 저장용 URL 기준을 쓰며, 사생활 보호 저장소를 명시해 범위를 제한합니다. [YouTube의 세션 전환 절차](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)

파일은 탭으로 구분한 일곱 열을 갖습니다. 쿠키마다 **도메인 · 하위 도메인 포함 여부 · 경로 · HTTPS 전용 여부 · 만료 시각 · 이름 · 값**이 들어갑니다. 만료 칸의 `0`은 세션 쿠키를 뜻합니다. `#HttpOnly_`와 HTTPS 전용 속성은 브라우저 또는 호환 도구가 쿠키를 사용할 때의 제한이며, **파일 자체는 평문**입니다. 팝업은 파일 저장 전에 전체·세션·HttpOnly 건수를 보여줍니다. 실제 쿠키 값은 계정 접근에 쓰일 수 있으니 사용한 뒤 파일을 삭제하세요. [합성 예시와 열별 설명](docs/COOKIE-FILE.md) · [Netscape 형식 명세](https://curl.se/docs/http-cookies.html#cookies-saved-to-disk)

## 개발자 서버 전송 여부를 검증하는 방법

1. **코드에서 값의 경로를 추적합니다.** `cookies.getAll()` → 필터와 Netscape 변환 → `Blob` → 준비를 요청한 확장의 팝업 → Firefox의 로컬 다운로드입니다. 값을 인수로 받는 외부 요청이나 업로드 주소가 이 경로에 없습니다. YouTube 저장용 탭 이동은 고정 주소를 여는 동작이고, 문서 링크는 사용자가 직접 엽니다. 두 동작 모두 내보낸 쿠키 값을 URL에 넣지 않습니다. [쿠키 읽기와 Blob 생성](extension/exporter.js) · [확장 내부 메시지만 허용](extension/messages.js) · [파일 링크 생성](extension/popup.js)
2. **브라우저의 차단을 재현합니다.** 매니페스트의 `connect-src 'none'`은 확장 페이지의 fetch, XHR, WebSocket 연결을 차단합니다. Firefox 테스트는 요청 실패만 보는 대신 브라우저가 `connect-src`를 강제했다는 보안 정책 위반 이벤트를 확인합니다. 이는 확장 페이지 연결에 대한 근거입니다. Firefox 자체의 네트워크 활동과, 파일을 가져간 다른 도구의 동작은 각 프로그램에 따릅니다. [차단 정책](extension/manifest.json) · [Firefox 검증 코드](test/browser-harness.js)
3. **실제 배포 파일을 공개 소스와 비교합니다.** `python3 scripts/build.py`로 제출용 ZIP을 다시 만들고 문서의 SHA-256과 비교할 수 있습니다. 서명 XPI는 `python3 scripts/build.py --verify-signed <파일.xpi>`로 허용한 파일 목록과 소스 바이트를 대조합니다. 서명의 유효성은 Firefox가 확인합니다. [배포 해시와 대조 절차](docs/RELEASE.md)

## 추출 범위를 검증하는 방법

- **권한을 봅니다.** 설치 권한은 `activeTab`과 `cookies`입니다. `optional_host_permissions`의 `https://*/*`는 요청할 수 있는 범위입니다. 일반 사이트를 준비할 때는 현재 호스트 하나, YouTube에서는 `www.youtube.com`만 실제로 요청합니다. Firefox가 승인 여부를 관리하고 팝업에서 해당 사이트 권한을 해제할 수 있습니다. [권한 선언](extension/manifest.json) · [요청할 호스트 계산](extension/core.js)
- **조회와 출력 양쪽을 봅니다.** 확장은 읽기 전후에 탭·주소·저장소·권한을 확인합니다. `cookies.getAll()`에 일반 사이트는 현재 페이지 URL, YouTube는 저장용 URL을 전달합니다. 반환된 쿠키에도 같은 호스트와 경로 필터를 적용합니다. [조회와 재확인](extension/exporter.js) · [출력 필터](extension/core.js)
- **검사 결과를 재현합니다.** 규칙 테스트는 정상 쿠키와 함께 다른 사이트·경로·저장소·파티션의 합성 쿠키를 넣어 결과를 대조합니다. 실제 Firefox에도 같은 사이트의 일반 저장소 쿠키와 다른 경로 쿠키를 두 모드에 넣습니다. 다운로드한 파일에 해당 값이 빠졌는지 비교해 **범위 밖 쿠키의 제외**를 검증합니다. [범위 테스트](test/core.test.js) · [Firefox 파일 대조](scripts/browser-test.js) · [검증 기록](docs/VALIDATION.md)

기존 `cookies.txt`도 소스가 공개되어 있습니다. 이 프로젝트가 사용자가 대조할 수 있도록 더한 근거는 사이트별 승인 범위, 해당 파일의 필터 검사, 배포 파일을 다시 만들고 비교하는 절차입니다. [기존 확장 소스](https://github.com/hrdl-github/cookies-txt) · [보안 설계](SECURITY.md) · [개인정보 안내](PRIVACY.md)

## 검증 실행

Node 20 이상과 Python 3이 필요합니다. 브라우저 검사는 별도 임시 프로필과 합성 쿠키를 사용합니다.

```sh
npm ci --ignore-scripts
npm run check
npm run browser-test -- /path/to/firefox youtube
npm run browser-test -- /path/to/firefox generic
```

**0.3.7을 Mozilla Add-ons에 제출했습니다.** Firefox Android 155 이상, 데스크톱 Firefox 140 이상을 대상으로 합니다. 사용자 사용법은 확장 팝업에서 확인할 수 있습니다. [배포 상태와 검증 절차](docs/RELEASE.md) · [GNU GPL v3](LICENSE) · [이전 버전의 라이선스 고지](NOTICE)
