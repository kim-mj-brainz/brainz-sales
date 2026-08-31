# PRD: 로그인 세션 + 인콜 알림 설정의 localStorage → DB 전환

> 상태: 설계 검토용 (구현 승인 전). 코드 변경 없음.
> 적용 범위: **1차는 스테이징(`brainz-sales-staging`)에만 적용.** 프로덕션 반영은 스테이징 검증 후 별도 결정.

## 1. 현재 구조 요약 (코드 기준 재확인)

### 1-1. 로그인 세션
- `src/common/store.js`의 `load`/`save`는 `localStorage`에 **`sms-` 접두사**를 붙여 저장 (`PREFIX = 'sms-'`).
- `AppContext.jsx:17` — `currentUser`를 `load('session', null)`로 초기화 → 실제 키는 `sms-session`.
- `AppContext.jsx:58-62` `login()` — `{ ...user, _sessionToken: uid('tok') }`를 만들어 state에 저장 + `save('session', session)`로 localStorage에 저장. **서버는 전혀 관여하지 않음** — 순수 클라이언트 랜덤 토큰.
- `AppContext.jsx:39-50` — 5초마다 `load('session', null)`을 다시 읽어서, 저장된 `_sessionToken`이 현재 state의 것과 다르면 `SESSION_TAKEOVER`로 감사로그를 남기고 강제 로그아웃.
- **로그인 자체에 서버 검증이 없음**: `LoginScreen.jsx:105-125`의 `submit()`은 `users.find(u => u.employeeNo === id)`만 확인하고 **비밀번호 대조조차 하지 않음** (`password` 필드는 응답에서 제거만 함). 즉 현재 시스템은 "사번을 아는 사람은 로그인 가능"한 낮은 신뢰 수준의 사내 도구이며, 백엔드(`server/index.js`)에도 인증 미들웨어가 전혀 없음(모든 `/api/*`가 무인증 오픈 상태, G2B 조사에서도 동일하게 확인됨).
- **왜 문제인가**: 프로덕션(`/brainz-sales/`)과 스테이징(`/brainz-sales-staging/`)이 nginx상 같은 호스트:포트, 경로만 다름 → **`localStorage`는 스킴+호스트+포트로만 스코프되고 경로는 무관**하므로 두 배포본이 정확히 같은 `sms-session` 키를 공유. 한쪽에 로그인하면 다른 쪽 탭이 5초 폴링에서 "다른 토큰"을 보고 `SESSION_TAKEOVER`로 오인해 강제 로그아웃시킴.

### 1-2. GAS/인콜 알림 설정
- `src/common/gasApi.js:8-14` — `gas-url`, `gas-token`, `incall-zsales-email`, `incall-chat-webhook`, `incall-mail-from-name`, `incall-mail-from-email`, `incall-mail-reply-to-email` — **7개 키가 접두사 없이 `localStorage`에 직접 저장**됨 (session과 달리 `sms-` 프리픽스도 없음).
- 조회는 `getGasUrl()` 등 단순 getter, 저장은 `setGasConfig()`/`setIncallSettings()` — 전부 동기 `localStorage.getItem/setItem`.
- 이미 같은 문제(프로덕션/스테이징 공유) + **추가 문제**: 브라우저를 바꾸거나 캐시를 지우면 설정이 통째로 사라지고, 관리자가 아무 화면에서도 "현재 설정값이 뭔지" 조회할 수 없음(값이 사용자 개인 브라우저에만 존재).

### 1-3. 이미 DB 기반으로 전환된 참고 사례 (재사용 가능한 기존 패턴)
- `useCollection(key, seed)` (`src/common/useCollection.js`) + `apiLoad/apiSave` (`store.js:70-94`) → `GET/PUT /api/collection/:key`.
- 서버(`server/index.js:684`)는 `keyMap`에 정의된 키(users/incalls/references 등)는 전용 핸들러로, 그 외 키는 **범용 `collections` 테이블**(`col_key VARCHAR(100) PK, data LONGTEXT`, `server/db/schema.sql:8-12`)에 JSON 그대로 저장 — `loadCollectionFallback`/`saveCollectionFallback` (`server/index.js:110-127`).
- G2B 대분류/업체(`g2bCategories`, `g2bTargets`)가 바로 이 범용 fallback 패턴을 그대로 써서 새 테이블 없이 구현됨. **GAS/인콜 설정도 이 패턴을 그대로 재사용 가능** (아래 2-3 참고).

## 2. 제안 아키텍처

### 2-1. 세션: httpOnly 쿠키 + 서버 사이드 세션 테이블 (JWT 대신 권장)

| | 쿠키+DB세션 (권장) | JWT |
|---|---|---|
| "동시 로그인 감지"(강제 로그아웃) 구현 | DB row 존재/최신 여부로 즉시 가능 | 자체 무효화 불가 → 결국 서버에 블록리스트/버전 테이블 필요 = 사실상 같은 복잡도 |
| localStorage 공유 문제 해결 | 해결됨 (쿠키/DB, localStorage 미사용) | **localStorage에 저장하면 해결 안 됨** (지금과 똑같이 프로덕션/스테이징 공유). httpOnly 쿠키에 담아야 의미 있음 → 그러면 쿠키 관련 이슈는 JWT도 동일하게 겪음 |
| 구현 난이도 | 세션 테이블 1개 + 미들웨어 | 서명/검증 로직 + (강제로그아웃 원하면) 결국 상태 저장 추가 |

**결론: 이 프로젝트 규모(Express+MySQL, 별도 인증 인프라 없음)에서는 JWT를 도입할 이유가 없습니다.** "동시 로그인 감지"라는 요구사항 자체가 서버 측 상태(세션 테이블)를 요구하므로, 굳이 무상태(JWT)를 시도했다가 결국 상태를 추가하는 것보다 처음부터 세션 테이블로 가는 것이 단순합니다.

**제안 스키마:**
```sql
CREATE TABLE IF NOT EXISTS sessions (
  token       VARCHAR(64) PRIMARY KEY,      -- crypto 랜덤, httpOnly 쿠키 값
  employee_no VARCHAR(50) NOT NULL,
  env         VARCHAR(20) NOT NULL,          -- 'production' | 'staging' (아래 2-2 참고)
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sessions_employee (employee_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
- 로그인: 서버가 `token` 발급 → `Set-Cookie: sid=<token>; HttpOnly; SameSite=Lax; Path=/`로 응답, `sessions`에 INSERT.
- 이후 요청: 클라이언트가 쿠키 자동 첨부(`credentials:'include'` 필요) → 서버가 `sessions`에서 `token` 조회해 `employee_no` 확인 후 `users` 조회.
- 동시 로그인 감지: 같은 `employee_no`로 새로 로그인하면 **그 사번의 기존 세션 row를 DELETE**(또는 `active=0`) → 기존 탭이 폴링(또는 SSE/WS) 시 자기 토큰이 DB에서 사라진 걸 감지하면 강제 로그아웃.

**⚠️ 반드시 알아야 할 점:** 지금 로그인은 비밀번호 검증이 없는 구조입니다. 이 PRD가 다루는 범위는 **"세션을 어디에 저장하느냐"**이지, **"진짜 인증을 도입하느냐"**는 아닙니다. httpOnly 쿠키로 바꿔도 로그인 자체(사번만 입력하면 통과)는 그대로 두는 것을 기본 스코프로 제안합니다. API 엔드포인트에 인증 미들웨어를 씌워 실제로 "로그인 안 하면 API 호출 불가"까지 만드는 건 **별도의, 훨씬 큰 프로젝트**(현재 무인증인 모든 라우트 감사 필요)이므로 이번 범위에서 명시적으로 제외할 것을 제안합니다.

### 2-2. 프로덕션/스테이징 분리 — "쿠키 Path 분리"는 실효성 없음, DB 분리가 실질적 해법

라우틴에서 제안된 "쿠키를 path로 분리"를 검토한 결과, **이 프로젝트 구조에서는 작동하지 않습니다.**

- 쿠키는 **도메인+경로**로만 스코프되고 **포트는 무시**됩니다(RFC 6265). 프론트는 같은 호스트의 다른 경로(`/brainz-sales/` vs `/brainz-sales-staging/`)에서 서빙되지만, **API 호출은 포트만 다르고 경로는 둘 다 동일하게 `/api/...`**입니다(`VITE_API_URL`이 `http://host:3001` vs `http://host:3011`로 빌드 시 결정, 이후 실제 요청 경로는 양쪽 다 `/api/collection/...` 등으로 동일). 즉 쿠키의 `Path` 속성으로 두 환경을 구분할 지점 자체가 없습니다.
- **실질적 해법은 이미 존재하는 DB 분리를 그대로 활용하는 것**입니다: 운영 API는 `brainz_sales` DB를, 스테이징 API는 `brainz_sales_staging` DB를 봅니다. 세션 검증을 서버 DB 조회로 하면, 설령 브라우저가 쿠키 값을 두 포트 모두에 보내더라도(가능성 자체는 낮지만) **스테이징 DB에 있는 토큰은 운영 DB에서 조회가 안 되어 자연스럽게 "세션 없음"으로 처리**됩니다. 이는 오늘의 버그처럼 "다른 사람이 로그인했다"는 오탐(SESSION_TAKEOVER)이 아니라 "로그인 안 됨" 상태가 되므로, 최소한 **잘못된 강제 로그아웃/감사로그 오염은 사라집니다.**
- 추가 안전장치(선택, 권장): 쿠키 이름 자체를 환경별로 다르게(`sid_prod` / `sid_staging`) 하거나, `env` 컬럼을 세션 테이블에 두고 서버가 자신의 `NODE_ENV`/설정값과 다른 `env`의 세션은 거부하도록 이중 체크. 코드 몇 줄로 가능하며 "이론상 우연히 같은 토큰"까지 막아줍니다.

### 2-3. GAS/인콜 알림 설정 저장 — 기존 `collections` 폴백 패턴 재사용

새 테이블 없이 **기존 범용 `collections` 테이블 + `/api/collection/:key` 패턴을 그대로 사용**하는 것을 제안합니다 (G2B 대분류/업체와 동일 방식).

- 새 컬렉션 키: `gasSettings` — `{ gasUrl, gasToken, zsalesEmail, chatWebhook, mailFromName, mailFromEmail, mailReplyToEmail }` 객체 하나를 그대로 저장.
- `src/common/gasApi.js`의 각 getter/setter를 `useCollection('gasSettings', DEFAULT_GAS_SETTINGS)` 기반으로 교체하거나, `apiLoad('gasSettings', DEFAULTS)` / `apiSave('gasSettings', next)` 직접 호출로 교체 (기존 `apiLoad`/`apiSave`가 이미 async라 각 getter를 async 함수로 바꾸는 리팩터링 필요).
- **`gasToken`은 민감정보**이므로, G2B의 `SERVICE_KEY` 마스킹 패턴(`server/index.js`의 `/api/g2b/settings` — 저장은 받되 조회 시 `hasServiceKey: true`만 내려주고 값 자체는 재노출 안 함)을 그대로 적용할지 결정 필요. 다만 이 토큰은 GAS 웹앱 자체 인증용(구글 인프라 밖으로 안 나감)이라 SERVICE_KEY만큼 민감하지 않을 수 있음 — **범위 판단은 요청자 확인 필요** (마스킹까지 하면 전용 테이블+전용 엔드포인트가 필요해져 범용 `collections` 패턴을 못 씀).

## 3. 동시 로그인 감지 유지 방안 (요약)

- 클라이언트 localStorage 비교 → **서버 DB 조회**로 이관 (2-1 참고).
- "진짜 동시 로그인"(같은 환경, 같은 사번, 다른 브라우저/기기)은 여전히 감지: 새 로그인 시 서버가 기존 세션 row를 무효화하므로 기존 탭이 다음 폴링에서 "내 세션이 DB에 없음"을 감지 → 지금과 동일하게 `SESSION_TAKEOVER` 처리 가능.
- "프로덕션/스테이징 오인" 오탐은 DB 분리(2-2)로 구조적으로 사라짐.
- 폴링 주기(5초)는 그대로 유지 가능(엔드포인트만 `GET /api/session/me` 같은 걸로 교체), 또는 이 기회에 폴링 대신 로그인/로그아웃 이벤트 기반으로 줄이는 것도 검토 가능하나 **범위 확대이므로 1단계에서는 제외 권장**.

## 4. 마이그레이션 계획

**적용 범위: 우선 스테이징(`brainz-sales-staging`)에만 적용.** 프로덕션은 스테이징에서 충분히 검증한 뒤 별도 승인/일정으로 진행 — 이번 1차 작업 범위에 프로덕션 반영은 포함하지 않음.

- **세션**: 마이그레이션 대상 없음(휘발성 데이터) — 스테이징에서만 재로그인 필요. 프로덕션은 이번 변경과 무관하게 지금 방식(localStorage 세션) 그대로 유지되므로 사용자 영향 없음.
- **GAS/인콜 설정**: 스테이징 DB에 `gasSettings` 컬렉션을 신규 생성하고, 스테이징 담당자가 현재 브라우저 localStorage 값(있다면)을 스테이징 설정 화면에 재입력해 검증. **프로덕션의 localStorage 값은 이번 단계에서 손대지 않음** — 프로덕션은 여전히 기존 `gasApi.js` localStorage 방식으로 계속 동작(하위 호환 유지, 코드상 프로덕션/스테이징이 같은 브랜치를 쓰더라도 이번 기능은 신규 엔드포인트/신규 저장 방식이라 프로덕션 배포 전까지는 자연히 미사용 상태).
- 참고: `gasApi.js`의 기본값(`DEFAULT_GAS_URL`, `DEFAULT_GAS_TOKEN`)이 이미 실제 운영 GAS URL/토큰으로 하드코딩되어 있어, 로컬에서 별도로 재정의한 적이 없다면 실제로 이관할 값이 없을 가능성이 높음 — 실제로 누가 이 값을 커스텀했는지부터 확인 권장.

## 5. 영향 범위와 리스크

**영향 범위는 예상보다 작습니다.** `currentUser`를 쓰는 파일은 12개(AuditLog, UserManage, ProfileSettings, DocumentCreate, DocumentHistory, G2BModule, IncallModule, ReferenceModule, Dashboard, App, AppShell, AppContext)이지만, **전부 `useApp().currentUser.role/id/employeeNo/name` 형태로만 읽습니다.** `currentUser`의 객체 모양(shape)만 그대로 유지하면 이 12개 파일은 손댈 필요가 없습니다 — 손대는 곳은 세션을 발급/검증/폴링하는 `AppContext.jsx`와 `LoginScreen.jsx`(로그인 성공 처리 부분)뿐입니다.

**리스크:**
- **CORS**: 현재 `app.use(cors())` (`server/index.js:11`)로 옵션 없이 `Access-Control-Allow-Origin: *`를 응답 중입니다. **httpOnly 쿠키(credentialed request)는 와일드카드 origin과 함께 쓸 수 없습니다** — 반드시 `cors({ origin: [프론트 실제 origin들], credentials: true })`로 명시적 화이트리스트 전환 필요. 이건 이번 작업에서 가장 손이 많이 가는 부분이며, 프로덕션/스테이징 프론트 origin을 정확히 나열해야 함(둘 다 같은 origin이므로 실제로는 origin 1개만 허용하면 됨 — 다만 로컬 개발환경(`localhost:5173`)도 같이 허용해야 개발이 안 깨짐).
- 모든 `fetch` 호출에 `credentials: 'include'` 추가 필요 (`store.js`의 `apiLoad`/`apiSave`, `AssignPage.jsx` 등 fetch 사용처 전수 점검 필요).
- 세션 만료 정책 미정 — 무기한 유지할지, TTL을 둘지 결정 필요(현재 localStorage 방식도 사실상 무기한이라 당장 급한 결정은 아님).
- 기존 기능 중 로그인 없이 접근하는 `AssignPage.jsx`(인콜 담당자 지정, `?assign=&t=`)는 이번 세션 변경과 무관 — 이건 애초에 `currentUser` 로그인 세션이 아니라 별도의 1회성 토큰(`assignToken`, incalls 테이블에 저장)이라 영향 없음.

## 6. 예상 작업 범위 및 단계별 진행안

**1단계 — 스테이징에만 배포·검증 (프로덕션 미반영):**
- `server/db/schema.sql`: `sessions` 테이블 추가
- `server/index.js`: `cors()` 옵션화(origin 화이트리스트+credentials), `POST /api/session/login`(사번 검증 후 세션 생성+쿠키 발급), `GET /api/session/me`(쿠키로 현재 세션 조회), `POST /api/session/logout`
- `src/common/AppContext.jsx`: `login`/`logout`/동시 로그인 폴링 로직을 위 엔드포인트 기반으로 교체 (localStorage `session` 완전 제거)
- `src/modules/auth/LoginScreen.jsx`: `submit()`/`handleGoogleCredential()`이 로컬에서 `login(safeUser)` 직접 호출하던 걸 서버 로그인 API 호출로 교체
- `src/common/store.js`: fetch 호출부에 `credentials: 'include'` 추가
- 단, **`sts` 브랜치에 커밋은 하되, 프로덕션 서버(`/srv/brainz-sales`)에는 `git pull`/배포를 진행하지 않고 스테이징 서버(`/srv/brainz-sales-staging`)에만 배포**. (같은 브랜치를 공유하는 배포 구조상, 프로덕션에 미반영 상태를 유지하려면 프로덕션 쪽에서 이번 커밋들을 pull하지 않도록 별도로 관리 필요 — 배포 시점에 명확히 안내.)
- 검증 항목: 스테이징 로그인/로그아웃/동시 로그인 감지가 쿠키+DB 기반으로 정상 동작하는지, 프로덕션 탭과 스테이징 탭을 동시에 열어놔도 더 이상 서로 강제 로그아웃시키지 않는지(이번 버그의 재현 시나리오) 확인.
- **프로덕션 반영 여부/시점은 스테이징 검증 결과를 보고 별도로 결정** — 이번 PRD의 실행 범위에서 제외.

**2단계 — GAS/인콜 알림 설정 DB화 (역시 스테이징 우선):**
- `src/common/gasApi.js`: 7개 getter/setter를 `gasSettings` 컬렉션(2-3) 기반 async 함수로 교체
- 이 설정을 호출하는 `IncallModule.jsx`, `AssignPage.jsx` 등에서 동기 호출 → async 대응 필요(현재 `getGasUrl()`처럼 동기로 즉시 쓰는 곳들이 있어 리팩터링 범위가 세션보다 넓을 수 있음 — 실제 호출부 전수조사가 1단계 완료 후 별도 필요)
- 적용 대상은 스테이징으로 한정.

1단계만으로 이번에 보고받은 버그(프로덕션/스테이징 상호 강제 로그아웃)는 완전히 해결됩니다. 2단계는 "설정을 브라우저마다 다시 안 해도 되게" 하는 개선이라 우선순위/일정은 별도로 정해도 무방합니다.
