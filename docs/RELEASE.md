# Mozilla 서명과 Android 배포

현재 버전은 **0.3.3 미서명 배포 후보**입니다. 공개 AMO 항목과 일반 Firefox용 설치 파일은 Mozilla 제출 후 확인합니다.

## 제출물

| 파일 | 용도 |
| --- | --- |
| `dist/private-cookie-export-0.3.3-unsigned.zip` | Mozilla 서명·심사 제출 |
| `dist/private-cookie-export-0.3.3-source.zip` | MIT 라이선스의 공개용 소스, 검증 코드와 문서 |
| 두 ZIP의 `.sha256` | 내려받은 파일의 무결성 확인 |
| [개인정보 안내](../PRIVACY.md) | 공개 저장소에서 읽을 수 있는 원문 |

```sh
npm ci --ignore-scripts
npm run check
npm audit
```

`npm run verify-release`는 제출용 ZIP과 소스 ZIP, 각 SHA-256을 현재 소스에서 다시 계산한 결과와 비교합니다. 같은 Python·zlib 빌드 환경에서는 ZIP까지 바이트 단위로 일치합니다. Firefox에 넣는 HTML·CSS·JavaScript·SVG는 원본 그대로입니다. `node_modules`와 테스트는 제출용 ZIP에 포함하지 않습니다.

0.3.3 미서명 제출 ZIP의 SHA-256입니다. Mozilla가 서명한 XPI와는 해시가 다릅니다.

```text
fa23b5566ff900e05c8707a6a6291d3631ee4b0dfe2ef59ccbbf84119655dae5
```

## 등록 정보 초안

**이름** Private Cookie Export

**요약** Firefox 사생활 보호 탭에서 승인한 HTTPS 사이트의 쿠키를 Netscape 파일로 저장합니다.

**설명** 사생활 보호 탭 한 개에서 확장을 열고 쿠키 파일 준비를 선택합니다. 처음 쓰는 사이트는 Firefox에서 권한을 승인합니다. 일반 사이트는 현재 페이지에 적용되는 쿠키를 읽습니다. YouTube는 같은 탭에서 저장용 주소로 이동한 뒤 준비합니다. 파일 저장을 누르고 다운로드를 확인합니다. YouTube에서는 확인 후 팝업에서 해당 탭을 닫을 수 있습니다. 파일은 암호화되지 않으므로 사용한 뒤 삭제하세요.

**심사 메모** The add-on uses `activeTab` to identify the current private HTTPS page, and `cookies` together with the explicitly granted optional host permission to read its cookies. It requests the current host only, or the YouTube domain and its subdomains for the dedicated YouTube flow. After a user requests preparation, the file is held in the extension popup and saved through a user-clicked link. The CSP blocks connections from extension pages. We declare `authenticationInfo` because the local file may contain session credentials. The runtime files are the original source. The bundled browser test uses a disposable profile with synthetic cookies.

## 검사와 공개 순서

1. [공개 소스 저장소](https://github.com/hojin-v/private-cookie-export)와 [공개 개인정보 안내](https://github.com/hojin-v/private-cookie-export/blob/main/PRIVACY.md)를 등록 정보에 연결합니다. Mozilla에 제출할 확장 ID는 `private-cookie-export@ive.codes`입니다. 최초 서명 후 ID가 바뀌면 별도 확장으로 설치됩니다.
2. Android Firefox 테스트 환경에서 사생활 보호 권한 허용, 단일 탭, 일반 HTTPS 사이트와 YouTube에서 개별 사이트 권한 승인, 팝업 준비·저장, 호환 도구에서의 가져오기를 점검합니다. 합성 검사 결과는 [검증 기록](VALIDATION.md)에 있습니다.
3. [AMO Developer Hub](https://addons.mozilla.org/developers/)에 배포자 계정으로 로그인합니다. **AMO 공개 등록**과 Android 지원을 선택하고 제출용 ZIP, 개인정보 안내 URL, 설명과 심사 메모를 등록합니다. 공개 URL은 실제 등록 결과에서 확인합니다.
4. Mozilla가 서명한 XPI를 내려받아 `python3 scripts/build.py --verify-signed 받은파일.xpi`로 페이로드를 대조합니다. 이 명령은 서명 메타데이터를 제외한 원본과 추가 파일 여부를 확인하며, 서명 유효성 자체는 실제 Firefox 설치에서 확인합니다. 배포된 버전이 일반 Android Firefox에서 설치되고 실제로 동작하는지 확인합니다.
5. 호환 도구에서 확장을 안내할 때 실제 공개 AMO 주소를 사용합니다.

서명 전에 Android에서 시험하려면 테스트 기기의 Firefox에서 **USB 원격 디버깅**을 켜고, 개발 PC의 `adb`와 `web-ext`로 아래처럼 임시 설치합니다. 두 도구는 개발 시에만 사용합니다.

```sh
web-ext run --source-dir extension --target firefox-android --firefox-apk org.mozilla.firefox
```

Mozilla 계정 토큰과 실제 쿠키 파일은 공개 저장소나 제출용 ZIP에 넣지 않습니다. [Mozilla 서명·배포](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/) · [Firefox Android 개발·테스트](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/) · [인증 정보 선언](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
