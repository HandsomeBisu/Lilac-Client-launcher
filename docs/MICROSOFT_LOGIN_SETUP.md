# Microsoft 로그인 설정 — 사용자가 준비할 것

## 현재 구현 상태

기본 브라우저 로그인 → Microsoft 인증 → Xbox/XSTS → Minecraft 이용 권한·프로필 확인까지 연결했다.
로그인 취소, 3분 시간 초과, 재실행 시 저장 계정 복구와 토큰 갱신, 로그아웃을 구현했다.
성공한 Minecraft 프로필은 이름과 스킨 얼굴을 상단 계정 영역에 표시한다.

실제 계정의 종단 간 로그인과 Minecraft API 접근 승인 여부는 아직 검증하지 못했다.
자동 테스트는 로컬 인증 콜백·테스트용 서비스 응답과 실제 Windows 암호화 저장소를 검증한다.
게임 설치·실행은 아직 구현하지 않았다.

## 1. 앱 등록 권한 준비

[Microsoft Entra 관리 센터](https://entra.microsoft.com/)에 로그인한다.
앱 등록이 가능한 디렉터리와 권한이 필요하다. App registrations 메뉴가 보이지 않거나 등록이 거부되면
디렉터리 선택과 앱 등록 권한부터 확인한다. 필요한 계정·디렉터리 조건은
[Microsoft 앱 등록 안내](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)를 따른다.

이 작업은 런처 개발자가 한 번 수행한다. 런처를 사용할 사람마다 앱을 등록하는 방식이 아니다.

## 2. Lilac 전용 앱 등록

Entra ID → App registrations → New registration에서 다음처럼 등록한다.

| 항목 | 값 |
| --- | --- |
| Name | Lilac Client |
| Supported account types | Personal Microsoft accounts only / Personal accounts only |
| Redirect URI 플랫폼 | Mobile and desktop applications / Public client/native |
| Redirect URI | `http://localhost` |

포털 버전에 따라 문구가 조금 다를 수 있다. 회사·학교 계정 전용인 Single tenant를 선택하지 않는다.
앱 생성 시 URI 입력란이 없다면 생성 후 Authentication → Add a platform → Mobile and desktop applications에서 등록한다.
현재 코드는 `consumers` 인증 기관을 사용하므로 개인 Microsoft 계정으로 테스트한다.

등록 후 Overview의 **Application (client) ID**를 복사한다. Directory (tenant) ID나 Object ID가 아니다.
Client ID는 공개 앱 식별자이며 비밀번호가 아니다.

## 3. 인증 설정 확인

- `http://localhost`는 **Mobile and desktop applications** 플랫폼에 등록한다. Web 또는 SPA로 등록하지 않는다.
- 런처는 `http://localhost:<임시 포트>/`에서 응답을 받는다. Microsoft의 localhost 매칭 규칙에 따라 포트별 URI를 모두 등록할 필요는 없다.
- Authorization Code + PKCE를 사용한다. Client Secret이나 인증서를 만들거나 런처에 넣지 않는다.
- Implicit grant를 활성화할 필요가 없다.
- 별도의 “Allow public client flows” 토글은 이 브라우저 인증 코드 흐름을 위해 켤 필요가 없다. 이 토글과 Mobile/desktop 플랫폼 등록은 구분한다.
- 요청 범위는 코드에서 `XboxLive.signin`, `openid`, `profile`, `offline_access`로 지정한다. Microsoft Graph User.Read는 사용하지 않는다.

관련 공식 자료:
[Redirect URI 및 localhost 규칙](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url),
[Public client 설정](https://learn.microsoft.com/en-us/entra/identity-platform/msal-client-applications).

## 4. Minecraft API 접근 신청 확인

Microsoft OAuth 로그인과 Minecraft 서비스 접근은 별도 단계다.
앱 ID에 Minecraft API 접근 권한이 없으면 Microsoft/Xbox 인증 뒤 Minecraft 단계에서 403이 발생할 수 있다.
앱 등록만으로 Minecraft 서비스 접근이 완료된다고 가정하지 않는다.

[Java Edition Game Service API Review or Application Process](https://help.minecraft.net/hc/en-us/articles/16254801392141)를 열어
현재 신청 절차와 기준을 확인하고 Lilac의 앱 ID로 신청한다. 신청 양식에서 요구하는 프로젝트 설명,
연락처·프로젝트 링크 등은 실제 진행 상태대로 작성한다. 공개 페이지나 배포 링크가 아직 없다면
이미 배포했다고 적지 않는다. 승인 여부와 처리 기간은 Mojang/Microsoft에서 결정한다.

이 환경에서는 공식 도움말의 제목·경로는 확인했지만 동적 본문과 신청 양식은 읽을 수 없었다.
따라서 현재 양식의 세부 요구 항목이나 승인 기간은 단정하지 않는다. 위 공식 페이지에 표시되는 절차를 우선한다.
403 하나만으로 원인을 확정할 수는 없으며, 앱 승인 상태와 서비스 응답을 함께 확인해야 한다.

## 5. 런처에 앱 ID 입력

앱 ID는 개발자가 설정한다. 일반 사용자 화면에는 개발자 설정이나 앱 ID 입력란을 표시하지 않는다.

개발 환경에서는 `config/microsoft.example.json`을 `config/microsoft.local.json`으로 복사하고
`clientId`를 자신의 앱 ID로 바꾼다. 또는 `LILAC_MS_CLIENT_ID` 환경 변수를 사용한다.
이미 로컬 설정 파일이 있다면 그 값을 그대로 읽는다. 설정 변경 후 런처를 다시 실행한다.

배포 설정을 준비하려면 `npm run prepare:auth`를 실행한다.
생성된 `.generated/microsoft.json`을 향후 설치 프로그램 구성에서 `resources/microsoft.json`으로 포함한다.
현재는 이 준비 명령과 배포본의 읽기 경로를 구현한 상태이며, 설치 프로그램 패키징 자체는 후속 단계다.
배포본은 해당 리소스의 앱 ID를 사용하고 사용자 환경 변수나 입력값으로 바꾸지 않는다.

일반 사용자는 오른쪽 위 **로그인 → Microsoft로 로그인**만 누른다.
기본 브라우저에서 인증한 뒤 런처로 돌아와 결과를 확인한다.
로그인 설정이 누락된 빌드는 사용자에게 앱 ID를 요구하지 않고 배포자에게 문의하도록 안내한다.

실제 앱 ID와 생성된 배포 설정 파일은 Git에서 제외한다. 이는 저장소와 화면에서 불필요하게 노출하지 않는 운영 방식이다.
Client ID는 비밀 인증 정보가 아니며, 로그인 요청이나 배포 파일을 분석하면 확인할 수 있다.
Client Secret이나 액세스·갱신 토큰과는 구분한다. Client ID 자체를 감추는 것을 인증 보안 수단으로 사용하지 않는다.

## 6. 테스트 계정 준비 및 확인

- Minecraft Java Edition을 이용할 수 있는 개인 Microsoft 계정과 Xbox 프로필을 사용한다.
- 자녀 계정·한국의 성인 인증 등 계정별 조건은 Microsoft/Xbox 사이트에서 처리한다.
- Minecraft Java 프로필 이름이 없다면 minecraft.net에서 먼저 설정한다.
- Microsoft 인증 성공과 Minecraft 이용 권한 확인 결과를 계정 창에서 각각 확인한다.
- 앱 승인 전 Minecraft API에서 거부되면 Microsoft 계정 정보는 유지되지만 게임 이용 가능 상태로 표시하지 않는다.
- 승인 후에는 **다시 확인**으로 재시도할 수 있다. 세션이 만료되었다면 **다시 로그인**한다.
- 런처를 종료한 뒤 다시 열어 브라우저 없이 로그인 정보가 갱신되는지 확인한다.
- **로그아웃** 후 재실행했을 때 계정이 남지 않는지 확인한다.

## 저장 및 로그아웃 동작

개발 환경에서는 `.local-data/auth/msal-cache.bin`, 배포본에서는 Electron의 사용자별 userData 디렉터리 아래 `auth/msal-cache.bin`에 암호화된 MSAL 캐시로 저장한다.
Electron 비동기 safeStorage와 Windows DPAPI를 사용한다. 같은 Windows 사용자로 실행한 앱 사이의
완전한 격리나 악성코드 방어를 보장하는 저장소는 아니다.
암호화 기능을 사용할 수 없을 때 평문 저장으로 대체하지 않는다.
브라우저 UI에는 토큰을 전달하지 않고, 일반 설정 localStorage에도 인증 정보를 저장하지 않는다.

Minecraft 실행용 액세스 토큰은 메인 프로세스 메모리에만 보관하며 만료 여부를 확인한다.
현재는 게임 실행 기능이 없으므로 실제 게임에 전달하지 않는다.
로그아웃은 Lilac의 로컬 캐시와 세션을 삭제한다. 기본 브라우저의 Microsoft 로그인 쿠키나
다른 Microsoft 앱의 로그인까지 해제하지는 않는다.

## 오류별 다음 행동

| 표시되는 문제 | 확인할 것 |
| --- | --- |
| 앱 ID 형식 오류 | Application (client) ID를 복사했는지 확인 |
| 리디렉션/앱 설정 오류 | 개인 계정 지원, Mobile/desktop 플랫폼, `http://localhost` 확인 |
| Minecraft 403 | Lilac 앱 ID의 Minecraft API 접근 승인 상태 확인 |
| Xbox 프로필 없음 | xbox.com에서 프로필 생성 |
| 성인 인증·가족 설정 필요 | Microsoft/Xbox 계정에서 해당 조건 처리 |
| Java 이용 권한 확인 실패 | 구매 계정 또는 Game Pass 구독 상태 확인 |
| Minecraft 프로필 없음 | minecraft.net에서 Java 프로필 설정 |
| 로그인 만료 | 다시 로그인 |
| 암호화 캐시 복호화 실패 | 계정 창에서 로그아웃한 뒤 다시 로그인 |

## 구현 참고 자료

- [MSAL Node 인증 요청](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/request.md)
- [Microsoft Xbox 서비스 인증](https://learn.microsoft.com/en-us/gaming/gdk/docs/services/fundamentals/s2s-auth-calls/service-authentication/live-website-authentication)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Prism Launcher의 현재 인증 단계](https://github.com/PrismLauncher/PrismLauncher/tree/develop/launcher/minecraft/auth/steps): 게임 서비스 요청 규격 참고. 구현 코드를 복사하지 않았다.
