# Mozilla 서명과 Android 배포

현재 패키지는 **미서명 개발본**입니다. GitHub 저장소·AMO 등록 페이지·Mozilla 서명은 아직 생성하지 않았습니다. 일반 사용자에게 미서명 ZIP을 설치할 수 있다고 안내하지 않습니다.

## 제출 전

1. 확장 ID `rabbyt-login-helper@ive.codes`를 실제 배포자 계정에서 사용할지 확정합니다. 최초 서명 후 ID를 바꾸면 별도 확장이 됩니다. 현재 ID의 AMO 등록 가능 여부는 확인하지 않았습니다.
2. `npm ci --ignore-scripts && npm run check`와 `npm audit`을 확인합니다.
3. 실제 Firefox 검사와 RabbYT 가져오기 계약 검사를 실행합니다. Android Firefox에서 private 권한 → 로그인 → 자동 주소 전환 → 다운로드 → 탭 종료 → 앱 가져오기를 확인합니다. 이때 실제 파일은 기기에서만 다루고 결과에 쿠키 값을 첨부하지 않습니다.
4. 개인정보 안내를 AMO에 제공하고 필요한 경우 공식 사이트에 같은 내용을 게시합니다. 공개 페이지 URL을 임의로 만들어 앱에 연결하지 않습니다.

## Mozilla 개발자 계정에서 제출

1. [AMO Developer Hub](https://addons.mozilla.org/developers/)에 본인 계정으로 로그인하고 강한 추가 인증을 설정합니다. 계정과 API 토큰은 채팅에 보내지 않습니다.
2. 휴대폰에서 쉽게 설치하도록 **AMO 공개 등록**과 Android 지원을 선택하는 경로를 우선 검토합니다. 비공개/self-distribution 방식도 Mozilla 서명이 필요하며 설치 동선은 별도 확인해야 합니다.
3. `dist/rabbyt-login-helper-0.1.0-unsigned.zip`을 제출합니다. 실행 코드에는 빌드 단계가 없고, ZIP은 저장소의 `extension/` 파일과 라이선스만 포함합니다. 난독화·원격 코드·외부 런타임 의존성이 없음을 설명합니다.
4. 요구 권한은 YouTube 호스트·cookies·downloads입니다. 로그인 정보의 **기기 파일 내보내기**를 숨기지 않도록 `authenticationInfo`를 선언했습니다. 운영자 서버 전송은 없으며 사용자 버튼과 동의가 필요합니다. Mozilla가 다른 분류나 추가 안내를 요구하면 실제 동작에 맞춰 조정합니다. 승인·서명을 보장할 수는 없습니다.
5. 검토·서명이 끝난 실제 등록 페이지에서 Android 설치를 확인합니다. 이후 RabbYT 앱의 기존 `cookies.txt` 안내와 버튼을 이 도우미의 실제 URL·이름·절차로 바꿉니다. 그때까지 동작 중인 기존 링크를 미등록 주소로 바꾸지 않습니다.

Mozilla 계정이나 배포 권한이 없는 현재 상태에서는 업로드·서명·게시를 실행하지 않았습니다. 사용자 승인과 실제 계정 접근이 필요한 단계는 여기부터이며, 소스·검사·제출 파일은 이 프로젝트에서 준비합니다.

## 검토자 재현

`npm test`는 합성 API로 접근 경계·경합·실패를 검사합니다. `npm run browser-test -- /path/to/firefox`는 임시 브라우저 프로필과 합성 로그인 값만 사용하며 실제 사용자 계정을 요구하지 않습니다. `npm run android-contract`는 RabbYT의 실제 Java 파서에 합성 출력 파일을 넣습니다. 개인 계정이나 쿠키 값을 검토자에게 전달할 필요는 없습니다.

참고: [Mozilla 서명·배포 안내](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/), [Android 확장 개발](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/), [Firefox 데이터 동의](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).
