# Private Cookie Export

Firefox 사생활 보호 탭에서 사용자가 승인한 HTTPS 사이트의 쿠키를 Netscape `cookies.txt` 파일로 저장하는 MIT 오픈소스 확장입니다. 표준 형식이므로 이를 읽는 도구에서 사용할 수 있습니다.

파일은 호환 도구가 이미 로그인한 세션을 사용해야 할 때 필요합니다. 사이트 설정과 세션 식별자 등 서로 다른 목적의 쿠키가 담길 수 있습니다. [포함 범위와 일곱 열의 뜻](docs/COOKIE-FILE.md)

**0.3.2 미서명 배포 후보.** 일반 Firefox 설치에는 Mozilla 서명이 필요합니다. Firefox Android 155 이상, 데스크톱 Firefox 140 이상을 대상으로 합니다. [배포 절차](docs/RELEASE.md) · [검증 기록](docs/VALIDATION.md)

## 사용법

1. Firefox의 확장 설정에서 **사생활 보호 모드에서 실행**을 허용합니다.
2. 사생활 보호 탭 한 개에서 원하는 HTTPS 페이지를 엽니다. 계정 세션이 필요하면 그 사이트에 로그인합니다.
3. **Private Cookie Export → 쿠키 파일 준비**를 누릅니다. 새 사이트에서는 Firefox의 권한 요청을 확인합니다.
4. 팝업에서 전체·세션·HttpOnly 쿠키의 건수를 확인합니다. **파일 저장**을 눌러 `cookies-….txt`를 다운로드하고 사용한 뒤 원본을 지웁니다.

일반 사이트는 현재 페이지에 적용되는 쿠키를 저장합니다. YouTube는 도우미가 같은 탭을 `youtube.com/robots.txt`로 이동한 뒤 YouTube 세션을 확인합니다. 다운로드 완료를 확인한 뒤 팝업의 **다운로드 확인 후 탭 닫기**를 누릅니다. `robots.txt` 이동은 YouTube의 세션 쿠키 갱신을 줄이는 데 쓰입니다. [yt-dlp의 YouTube 안내](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)

## 소스와 권한 확인

- 설치 시 전체 사이트 접근을 부여받지 않습니다. 매니페스트의 `https://*/*`는 사용자가 승인할 수 있는 HTTPS 범위를 선언합니다. `activeTab`으로 현재 탭 주소를 확인하고, 준비할 때 일반 사이트는 현재 호스트 하나, YouTube는 `youtube.com`과 하위 도메인만 Firefox에 요청합니다. 팝업의 **이 사이트 권한 해제**에서 승인을 취소할 수 있습니다. [실행 권한 선언](extension/manifest.json) · [팝업의 권한 요청](extension/popup.js)
- 파일은 확장 팝업의 메모리에서 준비되고 Firefox 다운로드로 저장됩니다. 확장은 `content_scripts`, 다운로드 목록, 클립보드, 확장 저장소 접근 권한을 사용하지 않습니다. `extension/manifest.json`의 CSP `connect-src 'none'`은 확장 페이지의 네트워크 연결을 차단합니다.
- 파일에는 계정 접근 정보가 담길 수 있고 암호화되지 않습니다. 자세한 범위와 위험은 [개인정보 안내](PRIVACY.md)와 [보안 설계](SECURITY.md)에 있습니다.

이전 `cookies.txt` 확장도 소스를 공개하고 있습니다. 해당 확장은 여러 사이트를 한 번에 내보낼 수 있고 넓은 설치 권한을 요청합니다. 이 프로젝트는 사용자가 승인한 사이트와 현재 사생활 보호 탭으로 실행 범위를 좁히고 실제 배포 파일을 소스와 대조할 수 있게 구성했습니다. [기존 확장 소스](https://github.com/hrdl-github/cookies-txt) · [배포 파일 검증](docs/RELEASE.md)

## 빌드와 대조

Node 20 이상, Python 3에서 실행합니다. 실행 패키지에는 외부 라이브러리가 없으며 Mozilla `addons-linter`는 개발 검사에만 사용합니다.

```sh
npm ci --ignore-scripts
npm run check
npm audit
npm run verify-release
```

`dist/`에 Mozilla 제출용 미서명 ZIP, 공개용 소스 ZIP과 각 SHA-256이 생깁니다. 같은 환경에서 소스 ZIP을 풀어 다시 빌드하면 같은 파일을 얻습니다. Mozilla가 서명한 XPI는 `python3 scripts/build.py --verify-signed <파일.xpi>`로 실행 파일을 소스와 대조합니다.

```sh
npm run browser-test -- /absolute/path/to/firefox youtube
npm run browser-test -- /absolute/path/to/firefox generic
npm run android-contract -- --android /path/to/RabbYT
```

브라우저 검사는 임시 프로필의 합성 쿠키로 실행합니다. Android 계약 검사는 호환 도구의 예로 RabbYT의 기존 Java 파서를 사용하며 JDK 17 이상과 JSON-java 20240303이 필요합니다. [MIT 라이선스](LICENSE)
