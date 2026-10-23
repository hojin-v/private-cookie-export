# RabbYT 로그인 도우미

YouTube 로그인 정보만 기기에 저장해 RabbYT로 가져오는 Firefox 확장 프로젝트입니다. 외부 서버·분석 도구·원격 스크립트·실행용 외부 라이브러리를 사용하지 않습니다. RabbYT Android 저장소와 독립적으로 관리합니다.

**현재 0.1.0 개발본입니다. Mozilla 서명과 AMO 등록은 아직 하지 않았습니다.** `dist/…-unsigned.zip`은 검사·제출용이며 일반 Firefox에 바로 설치하는 파일이 아닙니다. 일반 사용자가 휴대폰에서 설치하려면 Mozilla에서 서명·배포해야 합니다. [배포 절차](docs/RELEASE.md)를 준비했습니다.

## 사용하는 순서

Firefox Android 142 이상 또는 데스크톱 Firefox 140 이상을 대상으로 합니다. 사용자가 로그인과 추가 인증을 직접 마칩니다.

1. 설치한 도우미의 Firefox 설정에서 **사생활 보호 모드에서 실행**과 YouTube 접근을 허용합니다.
2. 사생활 보호 탭 **한 개**에서 YouTube에 로그인합니다. 다른 사생활 보호 탭은 닫습니다.
3. Firefox의 확장 기능 메뉴에서 **RabbYT 로그인 도우미**를 열고 안내에 동의한 뒤 **저장하고 로그인 탭 닫기**를 누릅니다.
4. RabbYT의 열쇠 → YouTube → 로그인 정보 가져오기에서 `RabbYT-youtube-login-…txt`를 선택합니다.
5. RabbYT에서 가져오기가 성공하면 다운로드한 원본을 삭제합니다. 도우미를 꺼두거나 제거해도 이미 RabbYT에 저장된 정보는 사용할 수 있습니다.

저장 버튼 이후의 `robots.txt` 주소 전환과 저장 완료 후 로그인 탭 닫기는 도우미가 처리합니다. 사이트·컨테이너·전체 쿠키 중 하나를 고르는 화면은 없습니다. 일반 탭, 다른 사이트, 여러 사생활 보호 탭이 열려 있거나 도중에 탭이 바뀌면 진행 범위를 자동으로 넓히지 않습니다. Firefox 다운로드가 실패하면 탭을 닫지 않습니다.

자동화를 위해 비밀번호 입력·2차 인증·기기의 보안 설정을 우회하지 않습니다. 파일 선택은 현재 RabbYT의 검증·암호화 저장 절차를 그대로 사용합니다.

## 앱 안에서 모두 처리하지 않는 이유

Google은 개발자가 쿠키에 접근할 수 있는 임베디드 로그인 환경을 OAuth에 사용하지 않도록 요구합니다. Custom Tabs도 브라우저 상태와 앱 사이에 보안 경계를 둡니다. Google OAuth로 공식 API에 로그인하는 것과 yt-dlp에서 사용할 웹 세션을 얻는 것은 다르며, yt-dlp는 현재 YouTube OAuth 로그인을 지원하지 않습니다.

따라서 현재 RabbYT의 yt-dlp 인증을 외부 브라우저에서 앱으로 완전히 자동 전달할 수 있는 공식 경로는 확인하지 못했습니다. 브라우저 프로필을 읽거나 웹 로그인 화면을 위장하는 방식은 넣지 않았습니다. 별도 Firefox 설치 의존성은 남지만, 로그인 정보를 내보내는 확장 자체는 직접 관리하고 권한·코드를 좁힙니다.

근거: [Google의 안전한 브라우저 정책](https://developers.google.com/identity/protocols/oauth2/policies#use-secure-browsers), [Custom Tabs 보안 경계](https://chromium.googlesource.com/chromium/src/+/main/docs/security/custom-tabs-faq.md), [yt-dlp YouTube 인증·내보내기 안내](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies).

## 접근 범위

| 항목 | 동작 |
| --- | --- |
| 사이트 | HTTPS `youtube.com`과 그 하위 도메인만 접근 권한 요청 |
| 로그인 정보 | 사용자가 저장을 누를 때만 현재 `firefox-private` 저장소에서 읽음 |
| 다른 사이트·일반 탭 | 내보내지 않음. Google 계정 도메인 접근 권한도 없음 |
| 페이지 내용·입력란 | 읽지 않음. content script 없음 |
| 네트워크 | 도우미의 외부 전송 없음. 기존 탭을 고정 YouTube 주소로 이동시키는 동작만 있음 |
| 파일 | 브라우저가 만든 로컬 Blob을 명시적인 다운로드로 저장 |
| 기록·보관 | 쿠키 값을 로그·클립보드·확장 저장소에 보관하지 않음 |
| 저장 실패·탭 변경 | 기존 로그인 탭 유지. 사용자용 안내 표시 |

Firefox 권한은 `cookies`, `downloads`, YouTube 호스트 접근입니다. 전체 사이트·광범위한 `tabs`·`storage`·`webRequest`·`nativeMessaging` 권한을 요청하지 않습니다. 다른 탭의 URL·제목을 읽지 않고, 사생활 보호 탭 개수와 저장소만 확인합니다. 쿠키 API와 다운로드 권한 자체는 브라우저가 제공하는 거친 권한이므로 배포 코드 검토와 배포 계정 보호도 필요합니다.

Firefox의 새 데이터 안내에는 `authenticationInfo`를 선언합니다. 로그인 정보를 기기 파일로 내보내 RabbYT에서 사용한다는 사실을 숨기지 않기 위한 것으로, 운영자 서버 전송 기능은 없습니다. [개인정보 안내](PRIVACY.md), [보안 설계](SECURITY.md)를 확인하세요.

다운로드 파일은 **암호화되지 않은 계정 접근 정보**입니다. 파일이 유출되면 계정 접근에 악용될 수 있습니다. 도우미가 자체 제작이라는 이유로 계정 제재나 모든 보안 위험이 사라지는 것은 아닙니다. 평소에는 비로그인을 사용하고 필요한 경우에만 등록하세요. [yt-dlp 계정 사용 주의](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)

## 개발·검사

실행 코드에는 외부 패키지가 없습니다. Node 20 이상과 Python 3로 다음을 실행합니다. 개발 검사 도구만 Mozilla `addons-linter`를 버전 고정해 사용합니다.

```sh
npm ci --ignore-scripts
npm run check
npm audit
```

`dist/rabbyt-login-helper-0.1.0-unsigned.zip`과 SHA-256을 생성합니다. 허용한 실행 파일과 라이선스만 패키지에 넣고, 소스맵·테스트·개발 의존성·프로필·로그를 넣지 않습니다. 같은 입력과 빌드 환경에서 동일한 ZIP을 만듭니다.

실제 Firefox의 쿠키·다운로드·탭 닫기·CSP 동작은 새 임시 프로필과 합성 쿠키로 검사합니다. 실제 사용자 프로필이나 계정은 사용하지 않습니다. 이 검사는 데스크톱 Firefox용이며 Android 기기 확인을 대신하지 않습니다.

```sh
npm run browser-test -- /absolute/path/to/firefox
```

RabbYT의 실제 Java 가져오기 코드와 형식 호환성도 별도로 검사합니다. Android 저장소를 수정하지 않습니다. JDK 17 이상과 Android 프로젝트의 Gradle 의존성에 있는 JSON-java 20240303 JAR이 필요합니다. 다른 위치라면 `--android`와 `--json-jar`를 지정합니다.

```sh
npm run android-contract -- --android ../YTET-Android
```

검증 결과와 남은 실제 계정·Android 확인 항목은 [검증 기록](docs/VALIDATION.md)에 구분합니다. 배포용 Mozilla 계정·서명키·API 토큰·실제 쿠키는 저장소와 채팅에 넣지 않습니다.
