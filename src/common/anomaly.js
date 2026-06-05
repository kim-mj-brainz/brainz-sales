/* =============================================================
   이상행위 탐지 모듈 (담당: 공통영역)
   FR-AUDIT-04: 고빈도 행위, 비업무시간 로그인, 브루트포스 탐지
   ============================================================= */

const ONE_MIN = 60_000;
const FIVE_MIN = 5 * ONE_MIN;
const ONE_DAY = 24 * 60 * ONE_MIN;

export function detectAnomalies(logs) {
  const now = Date.now();
  const alerts = [];

  // 비업무시간(22:00~06:00 KST) 로그인 — 최근 24시간
  logs
    .filter(l => l.eventType === 'LOGIN_SUCCESS' && now - new Date(l.eventTime).getTime() < ONE_DAY)
    .forEach(l => {
      const kstHour = (new Date(l.eventTime).getUTCHours() + 9) % 24;
      if (kstHour >= 22 || kstHour < 6) {
        alerts.push({
          severity: 'warning',
          type: 'OFF_HOURS_LOGIN',
          message: `비업무시간 로그인 — ${l.actorName}(${l.actorEmployeeNo}) ${new Date(l.eventTime).toLocaleString('ko-KR')}`,
        });
      }
    });

  // 브루트포스: 5분 내 동일 계정 로그인 실패 3회 이상
  const recentFails = logs.filter(l => l.eventType === 'LOGIN_FAIL' && now - new Date(l.eventTime).getTime() < FIVE_MIN);
  const failMap = {};
  recentFails.forEach(l => { failMap[l.actorEmployeeNo] = (failMap[l.actorEmployeeNo] || 0) + 1; });
  Object.entries(failMap).forEach(([empNo, cnt]) => {
    if (cnt >= 3) alerts.push({ severity: 'danger', type: 'BRUTE_FORCE', message: `브루트포스 의심 — ${empNo} 5분 내 로그인 실패 ${cnt}회` });
  });

  // 고빈도 행위: 1분 내 동일 사용자 20건 이상
  const recent1m = logs.filter(l => now - new Date(l.eventTime).getTime() < ONE_MIN);
  const actMap = {};
  recent1m.forEach(l => { actMap[l.actorEmployeeNo] = (actMap[l.actorEmployeeNo] || 0) + 1; });
  Object.entries(actMap).forEach(([empNo, cnt]) => {
    if (cnt >= 20) alerts.push({ severity: 'danger', type: 'HIGH_FREQUENCY', message: `고빈도 행위 감지 — ${empNo} 1분 내 ${cnt}건` });
  });

  return alerts;
}
