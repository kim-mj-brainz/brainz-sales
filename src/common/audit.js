/* =============================================================
   공통 감사로그 모듈 (담당: 공통영역)
   FR-AUDIT-01/03: 주요 행위는 이 모듈을 통해 INSERT 만 기록.
   수정/삭제 API 없음. 다른 모듈은 logAudit() 만 호출한다.
   ============================================================= */
import { load, save, uid } from './store.js';

const KEY = 'audit';

export const AUDIT_CATEGORY = {
  AUTH: 'AUTH',
  ACCOUNT: 'ACCOUNT',
  AUTHZ: 'AUTHZ',
  CREDIT: 'CREDIT',
  DOCUMENT: 'DOCUMENT',
  REFERENCE: 'REFERENCE',
  INCALL: 'INCALL',
  SYSTEM: 'SYSTEM',
};

export function getAuditLogs() {
  return load(KEY, []);
}

/* actor: { employeeNo, name, team, role }  (현재 로그인 사용자) */
export function logAudit(actor, { category, eventType, targetType, targetId, targetName, result = 'SUCCESS', failReason = '', extra = null }) {
  const logs = load(KEY, []);
  const entry = {
    logId: uid('log'),
    eventTime: new Date().toISOString(),
    actorEmployeeNo: actor?.employeeNo || actor?.id || 'SYSTEM',
    actorName: actor?.name || 'SYSTEM',
    actorTeam: actor?.team || '-',
    actorRole: actor?.role || '-',
    actorIp: '127.0.0.1', // TODO: 서버에서 실제 IP 기록
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 60) : '-',
    category,
    eventType,
    targetType: targetType || '-',
    targetId: targetId || '-',
    targetName: targetName || '-',
    result,
    failReason,
    extra,
  };
  // FR-AUDIT-03: INSERT only (맨 앞에 추가, 최신순)
  logs.unshift(entry);
  // 보존 한도 (MVP: 최근 1000건)
  if (logs.length > 1000) logs.length = 1000;
  save(KEY, logs);
  return entry;
}
