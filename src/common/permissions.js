/* =============================================================
   공통 권한 모듈  (담당: 공통영역)
   2단계 — ADMIN / USER
   - ADMIN : 전체 메뉴/기능 + 사용자·코드마스터·시스템설정·인콜삭제
   - USER  : 본인 생성/할당 데이터만, 인콜 삭제 불가
   ============================================================= */

export const ROLES = {
  ADMIN: 'ADMIN',
  USER: 'USER',
};

export const ROLE_LABEL = {
  ADMIN: '관리자',
  USER: '개인사용자',
};

const PERMISSION_MAP = {
  // ----- 시스템/공통 -----
  'system:settings':   [ROLES.ADMIN],
  'system:userManage': [ROLES.ADMIN],
  'system:codeMaster': [ROLES.ADMIN],
  'audit:view':        [ROLES.ADMIN],
  'audit:download':    [ROLES.ADMIN],

  // ----- 문서생성 -----
  'document:create':   [ROLES.ADMIN, ROLES.USER],
  'document:viewAll':  [ROLES.ADMIN],
  'document:viewOwn':  [ROLES.ADMIN, ROLES.USER],
  'document:download': [ROLES.ADMIN, ROLES.USER],

  // ----- 신용등급(거래처) -----
  'credit:view':       [ROLES.ADMIN, ROLES.USER],
  'credit:request':    [ROLES.ADMIN, ROLES.USER],
  'credit:manage':     [ROLES.ADMIN],
  'credit:editGrade':  [ROLES.ADMIN],

  // ----- 레퍼런스 -----
  'reference:view':    [ROLES.ADMIN, ROLES.USER],
  'reference:edit':    [ROLES.ADMIN],
  'reference:upload':  [ROLES.ADMIN],
  'reference:ocr':     [ROLES.ADMIN],

  // ----- 인콜 CRM -----
  'incall:viewAll':      [ROLES.ADMIN],
  'incall:viewOwn':      [ROLES.ADMIN, ROLES.USER],
  'incall:create':       [ROLES.ADMIN, ROLES.USER],
  'incall:edit':         [ROLES.ADMIN, ROLES.USER],
  'incall:delete':       [ROLES.ADMIN],
  'incall:assignChange': [ROLES.ADMIN],
};

export function hasPermission(role, action) {
  const allowed = PERMISSION_MAP[action];
  if (!allowed) return false;
  if (allowed === '*') return true;
  return allowed.includes(role);
}

export function scopeFilter(role, currentUserId, list, ownerKeys = ['ownerId']) {
  if (role === ROLES.ADMIN) return list;
  return list.filter((item) => ownerKeys.some((k) => item[k] === currentUserId));
}
