# Document Menu Shared Change Policy PRD

## Purpose

문서 메뉴 작업은 기본적으로 `src/modules/document` 내부에 한정한다. 다른 메뉴, 앱 셸, 공통 컴포넌트, 공통 스타일, 전역 의존성 변경이 필요할 경우에는 코드 변경과 별도로 이 PRD 형식으로 변경 목적과 영향 범위를 기록한다.

## Scope Rule

- 문서 메뉴 전용 변경: `src/modules/document/**` 내부에서 처리한다.
- 공통 변경 필요 시: 먼저 PRD를 작성하고, 팀이 같은 방향으로 반영할 수 있게 변경 이유와 적용 범위를 명시한다.
- 다른 메뉴 변경 필요 시: 문서 메뉴 작업에 직접 섞지 않고 별도 PRD 또는 별도 작업으로 분리한다.

## Current Shared Changes To Review

### 1. Shared Styles

- File: `src/common/styles.css`
- Reason: 문서생성 화면의 4열 입력 레이아웃, 담당자 검색/추가 팝업, PDF 드래그앤드랍 업로드 UI를 스타일링하기 위해 문서 전용 class를 추가했다.
- Containment: class 이름은 `doc-`, `staff-`, `pdf-` prefix로 제한했다.
- Risk: 공통 CSS 파일에 위치하므로 class 충돌 가능성은 낮지만 전역 스타일 파일 변경 이력으로 관리가 필요하다.

### 2. App Shell Seed Initialization

- File: `src/app/AppShell.jsx`
- Reason: 문서 메뉴의 기존 더미 데이터가 localStorage에 남아 있을 수 있어 문서 관련 seed id를 제거하는 로직을 추가했다.
- Containment: `credits`, `docs` 컬렉션의 문서 메뉴 더미 id만 대상으로 한다.
- Risk: `credits` 컬렉션이 문서 메뉴 외 기능과 공유될 경우 데이터 정책 합의가 필요하다.

### 3. Global Dependencies

- Files: `package.json`, `package-lock.json`
- Dependencies:
  - `pdfjs-dist`: PDF 문자 추출 검사
  - `jszip`: PPTX 템플릿 수정 및 다운로드 생성
- Reason: 문서생성 메뉴에서 PDF 검사와 라이선스 PPT 생성 기능을 구현하기 위해 필요하다.
- Risk: 앱 전체 번들/설치 의존성에 영향을 준다. PDF 파서는 동적 import로 초기 번들 부담을 줄였다.

### 4. Public Template Asset

- File: `public/templates/license.pptx`
- Reason: 문서 메뉴에서 라이선스 증서 PPT를 생성하기 위한 템플릿 파일이다.
- Risk: public asset이므로 배포 시 포함된다. 템플릿 버전 관리 기준이 필요하다.

## Acceptance Criteria

- 문서 메뉴 기능은 문서 메뉴 화면에서만 노출된다.
- 공통 파일 변경은 문서 전용 prefix나 명확한 대상 id로 제한된다.
- 향후 공통/다른 메뉴 변경이 필요하면 구현 전에 PRD를 추가하거나 갱신한다.
- PRD 없이 다른 메뉴의 동작, 라우팅, 권한, 데이터 구조를 변경하지 않는다.
