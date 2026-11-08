# Lilac Client Launcher

## 소개

Lilac Client는 여러 버전의 Minecraft: Java Edition과 모드 환경을 한곳에서 관리하고, 게임 안에서 필요한 편의 기능을 제공하기 위해 개발 중인 독립 클라이언트 프로젝트입니다.

이 저장소에서는 Lilac Client의 전용 데스크톱 런처를 개발합니다. 사용자가 자신의 Microsoft 계정으로 로그인하고, 원하는 게임 버전과 실행 설정을 선택해 플레이를 시작할 수 있도록 만드는 것이 목표입니다.

런처는 어두운 배경과 연보라색을 중심으로 구성하며, 버전 선택·계정·플레이 버튼 등 자주 사용하는 기능에 바로 접근할 수 있도록 설계합니다. 현재는 Windows 환경을 기준으로 개발하고 있습니다.

### 개발 목표

- **여러 버전 지원:** 1.8.9부터 26.3까지 선정한 19개 버전을 지원하고, 버전별 실행 환경을 분리해 관리합니다.
- **모드 환경 관리:** 1.8.9와 1.12.2에는 Forge를, 나머지 지원 대상에는 Fabric을 사용하며 버전에 맞는 모드 설치와 관리를 제공합니다.
- **게임 내 편의 기능:** 전용 클라이언트와 연동해 FPS·좌표·키 입력 HUD, HUD 편집, 줌 등의 기능을 제공합니다.

위 항목은 제품의 개발 목표이며, 현재 구현 범위는 아래 **현재 동작**에 정리되어 있습니다. 게임 설치·실행과 게임 내 편의 기능은 아직 구현하지 않았습니다.

### About

Lilac Client is an independent Minecraft: Java Edition client project under development for public distribution. It aims to bring version selection, Forge/Fabric mod management, and in-game quality-of-life features into one product. This repository contains its Windows desktop launcher.

The launcher currently implements version selection, saved launch preferences, and a system-browser Microsoft authentication flow using OAuth 2.0 Authorization Code Flow with PKCE. Minecraft API access is intended for checking Java Edition entitlement, retrieving the player's profile, and authenticated game launching. Live end-to-end authentication and API approval have not yet been verified. Game download, installation, launching, mod management, and in-game features remain under development.

## 실행

이 폴더에서 `npm install` 후 `npm start`를 실행한다.
Windows에서는 `Start Lilac.cmd`를 더블클릭해도 된다. 의존성을 먼저 설치해야 한다.

## 현재 동작

- 플레이, 버전 목록, 모드 준비 화면, 설정 화면
- 확정된 19개 버전과 지정 로더 표시, 검색, 로더 필터, 즐겨찾기
- 버전 선택, 최대 메모리·게임 창 크기·화면 효과 설정과 자동 저장
- 플레이 화면에서 즐겨찾는 버전 바로 선택, 현재 실행 설정 확인
- 설정 초기화 확인, 다이얼로그, 키보드 포커스, 창 최소화·최대화·닫기
- 기본 브라우저를 통한 Microsoft 로그인, Xbox·Minecraft 권한 및 프로필 확인, 이름·스킨 표시
- 프로필 버튼에서 열리는 오른쪽 계정 패널, 여러 Microsoft 계정 추가·전환·개별 삭제·전체 로그아웃
- Windows 암호화 인증 캐시, 재실행 시 조용한 갱신, 로그아웃·취소·시간 초과 처리
- 페이지·팝업·계정 패널·버튼·즐겨찾기 전환 효과. 화면 효과 설정과 OS의 동작 줄이기 설정 반영

Microsoft 로그인은 Lilac 전용 앱 등록과 앱 ID 설정이 먼저 필요하다.
설정은 개발자가 로컬 파일 또는 빌드 단계에서 준비하며, 사용자 화면에는 개발자 설정과 앱 ID를 표시하지 않는다.
[사용자가 준비할 것과 설정 방법](docs/MICROSOFT_LOGIN_SETUP.md)을 따른다.
실제 계정을 통한 종단 간 로그인은 아직 검증하지 않았으며,
인증 흐름은 테스트 응답으로, Windows 저장소는 실제 암호화 API로 검증했다.

게임 다운로드·설치·실행, Java 검색·설치, 모드 관리, 자동 업데이트는 아직 구현하지 않았다.
메모리와 화면 크기는 실행 연동을 위한 저장 설정이며 현재 게임에는 적용되지 않는다.
지원 예정 버전은 검증 완료를 의미하지 않는다.

## 구조와 검증

- `electron/`: 격리된 네이티브 창과 허용된 창 제어 IPC
- `electron/auth/`: Microsoft/MSAL·PKCE·로컬 콜백·암호화 캐시·Minecraft 인증
- `npm run prepare:auth`: 로컬 앱 ID를 읽어 Git에서 제외되는 배포 설정 `.generated/microsoft.json` 생성. 설치 프로그램 구성 시 `resources/microsoft.json`으로 포함해야 한다.
- `src/model.js`: 지원 목록과 저장 설정 검증
- `src/motion.js`: 팝업 열기·닫기, 페이지 전환, 상호작용 애니메이션과 동작 줄이기 처리
- `src/`: 로컬 화면, 단색 아이콘과 스타일
- `src/assets/forest-dusk.png`: 생성한 게임 풍경 배경. 제작 방식과 프롬프트는 `docs/BACKGROUND_ASSET.md` 참고
- `tests/`: 지원 조합과 저장 설정 복구 검증
- `npm run check`, `npm test`, `npm run test:ui`
- UI 검증은 별도의 `.smoke-data/` 프로필을 사용하고 `artifacts/`에 화면을 저장한다.

개발용 Electron 데이터는 `.local-data/`에 저장하며 Git에서 제외한다.
배포 설치 프로그램은 후속 단계에서 구성한다.
