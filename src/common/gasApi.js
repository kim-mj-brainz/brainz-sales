/* =============================================================
   GAS 연동 API 모듈 (src/common/gasApi.js)
   도메인 전용 GAS 배포 대응:
     GET  → JSONP (script 태그, CORS 우회 + 구글 로그인 쿠키 자동 전송)
     POST → no-cors (fire-and-forget, 응답 읽기 불가)
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

// ── JSONP GET (도메인 전용 GAS 우회) ─────────────────────────
function gasGetJSONP(params) {
  return new Promise((resolve, reject) => {
    const url   = getGasUrl();
    const token = getGasToken();
    if (!url) { reject(new Error('GAS URL 미설정')); return; }

    const cbName = '_gas_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');

    const cleanup = () => {
      delete window[cbName];
      script.remove();
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('GAS 요청 타임아웃 (10초)'));
    }, 10000);

    window[cbName] = (data) => {
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('GAS 연결 실패 — 브라우저에서 구글 계정 로그인 여부 확인'));
    };

    const qs = new URLSearchParams({ ...params, token, callback: cbName }).toString();
    script.src = `${url}?${qs}`;
    document.head.appendChild(script);
  });
}

// ── no-cors POST (fire-and-forget, 알림 발송용) ───────────────
async function gasPostNoCors(body) {
  const url   = getGasUrl();
  const token = getGasToken();
  if (!url) throw new Error('GAS URL 미설정');
  // no-cors: 응답을 읽을 수 없지만 요청은 전송됨 (구글 쿠키 자동 포함)
  await fetch(url, {
    method: 'POST',
    mode:   'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ ...body, token }),
  });
  return { ok: true }; // no-cors에서는 응답 읽기 불가 → 성공으로 간주
}

// ── 공개 API ─────────────────────────────────────────────────

/** 매출코드로 수주확률 + 주간보고 조회 */
export async function lookupByCode(code) {
  const data = await gasGetJSONP({ action: 'getActivity', code });
  if (!data.ok) throw new Error(data.error || 'GAS 오류');
  return { found: data.found || false, winrate: data.winrate ?? null, activity: data.activity ?? '' };
}

/**
 * 인콜 데이터를 GAS에 저장 + 알림 발송
 * @param {object} incall
 * @param {string} notifyMethod - 'email' | 'chat' | 'both' | 'none'
 */
export async function syncIncallToGAS(incall, notifyMethod = 'none') {
  // no-cors POST — 응답 확인 불가이나 알림 발송은 정상 처리됨
  return await gasPostNoCors({ action: 'addIncall', data: incall, notifyMethod });
}

/** GAS 연결 테스트 (JSONP) */
export async function testConnection() {
  try {
    const data = await gasGetJSONP({ action: 'getActivity', code: '__TEST__' });
    return data.ok !== undefined; // ok 필드가 있으면 연결 성공
  } catch {
    return false;
  }
}
