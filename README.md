# brainz 영업관리시스템 (Sales Management System)

4개 요구사항 정의서(공통영역 · 레퍼런스 조회기 · InCall CRM · 문서생성/신용등급)를
하나의 Vite + React (JavaScript/JSX) 프로젝트로 통합한 사내 영업관리 시스템입니다.

## 실행 방법

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 프로덕션 빌드 → dist/
```

빌드 없이 바로 보려면 동봉된 `영업관리시스템_데모.html` 을 브라우저로 열면 됩니다.

## 데모 계정 (비밀번호 전부 `1234`)

| 사번 | 이름 | 권한 | 설명 |
|------|------|------|------|
| E001 | 김관리 | ADMIN (관리자) | 전체 메뉴 + 사용자/코드마스터/설정 |
| E002 | 이부장 | MANAGER (부서운영자) | 전체 업무데이터, 설정·사용자관리 제외 |
| E003 | 박영업 | USER (개인사용자) | 본인 데이터만 |
| E004 | 최영업 | USER (개인사용자) | 본인 데이터만 |

## 권한 모델 (통합 기준: 문서생성 정의서)

- **ADMIN** : 전체 기능 + 시스템 관리(사용자/코드마스터/설정/감사로그 다운로드)
- **MANAGER** : 전체 업무 데이터 조회·수정, 감사로그 조회, 거래처 등록
- **USER** : 본인 생성/할당 데이터만 (인콜·문서이력 본인 것만 노출)

권한 규칙은 전부 `src/common/permissions.js` 의 `PERMISSION_MAP` 한 곳에 있습니다.

---

## 폴더 구조 & 담당자 분담

각 담당자는 **자기 `modules/` 폴더만** 수정하면 됩니다.
`common/` 의 인터페이스(컴포넌트, 권한, 스토어, 감사로그)는 고정 규약입니다.

```
src/
├── app/                      [공통] 앱 셸 · 라우팅 · 사이드바
│   ├── App.jsx                 로그인 분기
│   └── AppShell.jsx            사이드바 메뉴 / 라우팅 / 공통 컬렉션 보유
│
├── common/                   [공통] 모든 모듈이 공유 — 함부로 바꾸지 말 것
│   ├── permissions.js          권한 정의 (ROLES, hasPermission)
│   ├── store.js                localStorage 추상화 (← 추후 API 교체 지점)
│   ├── audit.js                감사로그 기록 (logAudit)
│   ├── useCollection.js        CRUD 데이터 훅
│   ├── components.jsx          공통 UI (Button/Input/Modal/Table/Badge…)
│   ├── AppContext.jsx          전역 컨텍스트 (로그인 사용자/코드마스터/토스트)
│   └── styles.css              디자인 토큰 (색/폰트/간격)
│
├── data/                     [공통] 초기 더미 데이터 · 코드마스터
│   ├── codeMaster.js           통합 기준정보 + 매출코드 정규식
│   ├── seedUsers.js            초기 사용자
│   └── seedData.js             모듈별 초기 데이터
│
└── modules/
    ├── auth/        ★ 담당자 A (공통영역) — 로그인·사용자·권한·감사로그·설정
    │   ├── LoginScreen.jsx
    │   ├── UserManage.jsx       (ADMIN 전용)
    │   ├── AuditLog.jsx         (ADMIN/MANAGER)
    │   └── ProfileSettings.jsx  (내 정보 + 코드마스터 설정)
    │
    ├── reference/   ★ 담당자 B — 레퍼런스 조회기
    │   └── ReferenceModule.jsx  검색/목록/상세/업로드/중복확인/CSV
    │
    ├── incall/      ★ 담당자 C — InCall CRM
    │   ├── IncallModule.jsx     대시보드/목록 탭, 역할별 범위
    │   ├── IncallDashboard.jsx  KPI + 차트(순수 SVG)
    │   └── IncallModal.jsx      등록/수정 폼
    │
    └── document/    ★ 담당자 D — 문서생성 · 신용등급
        ├── DocumentCreate.jsx   라이선스+납품확인서 생성
        ├── DocumentHistory.jsx  생성이력 + 거래처(신용등급) 조회/관리
        └── SearchPopups.jsx     거래처/직원 검색 팝업
```

## 통합 시 조정된 사항 (정의서 간 충돌 해소)

1. **권한 체계** : 문서생성 정의서의 ADMIN/MANAGER/USER 3단계로 통일.
   (공통영역 정의서의 "설정관리자=설정만" 모델 대신 ADMIN=전체권한)
2. **매출코드** : InCall은 `A12345-01`, 문서생성은 `A12345`(+연번 3자리) —
   두 형식 모두 `codeMaster.js` 에 정규식으로 분리 보존.
3. **인프라유형** : InCall 정의서 규칙대로 `EMS / SIEM / ITSM` 3종 고정.
4. **기준정보(코드마스터)** : 4개 문서에 흩어진 코드값을 하나로 통합, ADMIN이 설정에서 관리.

## MVP → 운영 전환 메모

- 현재 모든 데이터는 브라우저 **localStorage** 에 저장됩니다 (`sms-` 접두사).
- 실제 운영 전환 시 `src/common/store.js` 의 load/save 를 REST API(PostgreSQL) 호출로 교체하면
  나머지 코드는 그대로 동작하도록 설계했습니다.
- 외부 연동 지점은 코드 내 `// TODO:` 주석으로 표시했습니다
  (GAS 활동내역 자동조회, 문서생성 API, 구글챗/메일 발송, 엑셀 파싱, 비밀번호 해시 등).
