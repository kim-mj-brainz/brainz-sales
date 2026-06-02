/* =============================================================
   공통 권한 모듈  (담당: 공통영역)
   통합 기준: 문서생성 정의서 기준 3단계 — ADMIN / MANAGER / USER
   - ADMIN     : 전체 메뉴/기능 + 사용자·코드마스터·시스템설정 관리
   - MANAGER   : 전체 업무 데이터 조회/수정 (설정/사용자관리 제외)
   - USER      : 본인 생성/할당 데이터만
   다른 모듈은 이 파일의 ROLES / hasPermission 만 import 해서 사용한다.
   ============================================================= */

export const ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  USER: 'USER',
};

export const ROLE_LABEL = {
  ADMIN: '관리자',
  MANAGER: '부서운영자',
  USER: '개인사용자',
};

/* action 별 허용 권한 정의.
   값이 '*' 이면 전체 허용, 배열이면 해당 역할만 허용.
   각 모듈 담당자는 자기 action 을 여기 추가하면 된다. (네임스페이스: module:action) */
const PERMISSION_MAP = {
  // ----- 시스템/공통 -----
  'system:settings': [ROLES.ADMIN],
  'system:userManage': [ROLES.ADMIN],
  'system:codeMaster': [ROLES.ADMIN],
  'audit:view': [ROLES.ADMIN, ROLES.MANAGER],
  'audit:download': [ROLES.ADMIN],

  // ----- 문서생성 -----
  'document:create': [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER],
  'document:viewAll': [ROLES.ADMIN, ROLES.MANAGER],
  'document:viewOwn': [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER],
  'document:download': [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER],

  // ----- 신용등급(거래처) -----
  'credit:view': [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER],
  'credit:request': [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER],
  'credit:manage': [ROLES.ADMIN, ROLES.MANAGER], // 등록/수정/엑셀
  'credit:editGrade': [ROLES.ADMIN, ROLES.MANAGER],

  // ----- 레퍼런스 -----
  'reference:view': [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER],
  'reference:edit': [ROLES.ADMIN, ROLES.MANAGER],
  'reference:upload': [ROLES.ADMIN, ROLES.MANAGER],
  'reference:ocr': [ROLES.ADMIN, ROLES.MANAGER],

  // ----- 인콜 CRM -----
  'incall:viewAll': [ROLES.ADMIN, ROLES.MANAGER],
  'incall:viewOwn': [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER],
  'incall:create': [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER],
  'incall:edit': [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER],
  'incall:delete': [ROLES.ADMIN, ROLES.MANAGER],
  'incall:assignChange': [ROLES.ADMIN, ROLES.MANAGER],
};

export function hasPermission(role, action) {
  const allowed = PERMISSION_MAP[action];
  if (!allowed) return false;
  if (allowed === '*') return true;
  return allowed.includes(role);
}

/* 일반사용자 데이터 범위 제한 헬퍼 (FR-AUTHZ-02)
   USER 는 본인 생성/할당 건만. MANAGER/ADMIN 은 전체. */
export function scopeFilter(role, currentUserId, list, ownerKeys = ['ownerId']) {
  if (role === ROLES.ADMIN || role === ROLES.MANAGER) return list;
  return list.filter((item) => ownerKeys.some((k) => item[k] === currentUserId));
}
