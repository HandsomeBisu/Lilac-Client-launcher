# Lilac Client Launcher

Lilac Client is an independent Minecraft: Java Edition launcher currently under development for public distribution. It provides a desktop interface for version selection and Microsoft account authentication, with Forge/Fabric installation and authenticated game launching planned for subsequent development.

The project is not yet a complete game launcher. Microsoft authentication is implemented, but live end-to-end authentication and Minecraft API approval have not been verified. Game download, installation and launching are not yet implemented.

전체 화면 게임 풍경과 어두운 오버레이, 연보라 버튼을 사용하는 Electron 데스크톱 런처.
좁은 아이콘 메뉴, 상단 버전·계정 선택, 중앙 플레이 영역과 하단 모드·버전 바로가기로 구성했다.
외부 이미지·폰트·웹 서비스 없이 UI가 표시된다.

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
- Windows 암호화 인증 캐시, 재실행 시 조용한 갱신, 로그아웃·취소·시간 초과 처리

Microsoft 로그인은 Lilac 전용 앱 등록과 앱 ID 설정이 먼저 필요하다.
[사용자가 준비할 것과 설정 방법](docs/MICROSOFT_LOGIN_SETUP.md)을 따른다.
실제 계정을 통한 종단 간 로그인은 아직 검증하지 않았으며,
인증 흐름은 테스트 응답으로, Windows 저장소는 실제 암호화 API로 검증했다.

게임 다운로드·설치·실행, Java 검색·설치, 모드 관리, 자동 업데이트는 아직 구현하지 않았다.
메모리와 화면 크기는 실행 연동을 위한 저장 설정이며 현재 게임에는 적용되지 않는다.
지원 예정 버전은 검증 완료를 의미하지 않는다.

## 구조와 검증

- `electron/`: 격리된 네이티브 창과 허용된 창 제어 IPC
- `electron/auth/`: Microsoft/MSAL·PKCE·로컬 콜백·암호화 캐시·Minecraft 인증
- `src/model.js`: 지원 목록과 저장 설정 검증
- `src/`: 로컬 화면, 단색 아이콘과 스타일
- `src/assets/forest-dusk.png`: 생성한 게임 풍경 배경. 제작 방식과 프롬프트는 `docs/BACKGROUND_ASSET.md` 참고
- `tests/`: 지원 조합과 저장 설정 복구 검증
- `npm run check`, `npm test`, `npm run test:ui`
- UI 검증은 별도의 `.smoke-data/` 프로필을 사용하고 `artifacts/`에 화면을 저장한다.

개발용 Electron 데이터는 `.local-data/`에 저장하며 Git에서 제외한다.
배포 설치 프로그램은 후속 단계에서 구성한다.
