/* =============================================================
   GAS 연동 API 모듈 (src/common/gasApi.js)
   URL과 토큰을 localStorage에서 읽습니다.
   설정은 인콜 목록 화면의 ⚙️ GAS 설정 버튼에서 입력.
   ============================================================= */

const LS_URL   = 'gas-url';
const LS_TOKEN = 'gas-token';

export function getGasUrl()   { return localStorage.getItem(LS_URL)   || ''; }
export function getGasToken() { return localStorage.getItem(LS_TOKEN) || ''; }
export function setGasConfig(url, token) {
  localStorage.setItem(LS_URL,   url.trim());
  localStorage.setItem(LS_TOKEN, token.trim());
}
export function isGasConfigured() { return !!getGasUrl(); }

// ── 내부 fetch 헬퍼 ──────────────────────────────────────────
async function gasGet(params) {
  const url   = getGasUrl();
  const token = getGasToken();
  if (!url) throw new Error('GAS URL 미설정');
  const qs = new URLSearchParams({ ...params, token }).toString();
  const res = await fetch(`${url}?${qs}`, {
    method: 'GET',
    redirect: 'follow',
    // credentials 제거 — "모든 사용자" 배포에서는 불필요하며 CORS 오류 유발
  });
  if (!res.ok) throw new Error(`GAS 응답 오류: ${res.status}`);
  return res.json();
}

async function gasPost(body) {
  const url   = getGasUrl();
  const token = getGasToken();
  if (!url) throw new Error('GAS URL 미설정');
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain' }, // GAS POST는 text/plain 권장
    body: JSON.stringify({ ...body, token }),
  });
  if (!res.ok) throw new Error(`GAS 응답 오류: ${res.status}`);
  return res.json();
}

// ── 공개 API ─────────────────────────────────────────────────

/** 매출코드로 수주확률 + 주간보고 조회 */
export async function lookupByCode(code) {
  const data = await gasGet({ action: 'getActivity', code });
  if (!data.ok) throw new Error(data.error || 'GAS 오류');
  return { found: data.found || false, winrate: data.winrate ?? null, activity: data.activity ?? '' };
}

/**
 * 인콜 데이터를 GAS에 저장 + 알림 발송
 * @param {object} incall
 * @param {string} notifyMethod - 'email' | 'chat' | 'both' | 'none'
 */
export async function syncIncallToGAS(incall, notifyMethod = 'none') {
  const data = await gasPost({ action: 'addIncall', data: incall, notifyMethod });
  if (!data.ok) throw new Error(data.error || 'GAS 저장 실패');
  return data;
}

/** GAS 연결 테스트 */
export async function testConnection() {
  try { await gasGet({ action: 'getActivity', code: '__TEST__' }); return true; }
  catch { return false; }
}
