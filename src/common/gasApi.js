/* =============================================================
   GAS 연동 API 모듈 (src/common/gasApi.js)
   도메인 전용 GAS 배포 대응:
     GET  → JSONP (script 태그, CORS 우회 + 구글 로그인 쿠키 자동 전송)
     POST → no-cors + credentials (인증 쿠키 포함, fire-and-forget)
   ============================================================= */

const LS_URL          = 'gas-url';
const LS_TOKEN        = 'gas-token';
const LS_ZSALES_EMAIL = 'incall-zsales-email';
const LS_CHAT_WEBHOOK = 'incall-chat-webhook';
const LS_MAIL_FROM_NAME = 'incall-mail-from-name';
const LS_MAIL_FROM_EMAIL = 'incall-mail-from-email';
const LS_MAIL_REPLY_TO_EMAIL = 'incall-mail-reply-to-email';

// 기본값 (localStorage에 설정이 없을 때 사용)
const DEFAULT_GAS_URL    = 'https://script.google.com/a/macros/brainz.co.kr/s/AKfycbydUCsc4DEIcGo4IcToEhAu4Xep2AcpLZ9VJgMO4bCh2lOO-9yyFyJWqSnWCQ6iA64d/exec';
const DEFAULT_GAS_TOKEN  = 'brainz-incall-2026';
const DEFAULT_ZSALES_EMAIL = 'rbdud1@brainz.co.kr'; // 테스트용 (실운영: zsales@brainz.co.kr)

export function getGasUrl()   { return localStorage.getItem(LS_URL)   || DEFAULT_GAS_URL; }
export function getGasToken() { return localStorage.getItem(LS_TOKEN) || DEFAULT_GAS_TOKEN; }
export function setGasConfig(url, token) {
  localStorage.setItem(LS_URL,   url.trim());
  localStorage.setItem(LS_TOKEN, token.trim());
}
export function isGasConfigured() { return !!getGasUrl(); }

export function getIncallZsalesEmail() { return localStorage.getItem(LS_ZSALES_EMAIL) || DEFAULT_ZSALES_EMAIL; }
export function getIncallChatWebhook() { return localStorage.getItem(LS_CHAT_WEBHOOK) || ''; }
export function getIncallMailOptions() {
  return {
    fromName: localStorage.getItem(LS_MAIL_FROM_NAME) || '',
    fromEmail: localStorage.getItem(LS_MAIL_FROM_EMAIL) || '',
    replyToEmail: localStorage.getItem(LS_MAIL_REPLY_TO_EMAIL) || '',
  };
}
export function setIncallSettings(zsalesEmail, chatWebhook, mailOptions = {}) {
  if (zsalesEmail !== undefined) localStorage.setItem(LS_ZSALES_EMAIL, zsalesEmail.trim());
  if (chatWebhook !== undefined) localStorage.setItem(LS_CHAT_WEBHOOK, chatWebhook.trim());
  if (mailOptions.fromName !== undefined) localStorage.setItem(LS_MAIL_FROM_NAME, mailOptions.fromName.trim());
  if (mailOptions.fromEmail !== undefined) localStorage.setItem(LS_MAIL_FROM_EMAIL, mailOptions.fromEmail.trim());
  if (mailOptions.replyToEmail !== undefined) localStorage.setItem(LS_MAIL_REPLY_TO_EMAIL, mailOptions.replyToEmail.trim());
}

// ── JSONP GET (도메인 전용 GAS 우회) ─────────────────────────
function gasGetJSONP(params) {
  return new Promise((resolve, reject) => {
    const url   = getGasUrl();
    const token = getGasToken();
    if (!url) { reject(new Error('GAS URL 미설정')); return; }

    const cbName = '_gas_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');

    const cleanup = () => { delete window[cbName]; script.remove(); };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('GAS 요청 타임아웃 (10초)'));
    }, 10000);

    window[cbName] = (data) => { clearTimeout(timer); cleanup(); resolve(data); };

    script.onerror = () => {
      clearTimeout(timer); cleanup();
      reject(new Error('GAS 연결 실패 — 브라우저에서 구글 계정 로그인 여부 확인'));
    };

    const qs = new URLSearchParams({ ...params, token, callback: cbName }).toString();
    script.src = `${url}?${qs}`;
    document.head.appendChild(script);
  });
}

// ── no-cors POST + credentials (인증 쿠키 포함) ──────────────
async function gasPostNoCors(body) {
  const url   = getGasUrl();
  const token = getGasToken();
  if (!url) throw new Error('GAS URL 미설정');
  await fetch(url, {
    method:      'POST',
    mode:        'no-cors',
    credentials: 'include',
    headers:     { 'Content-Type': 'text/plain' },
    body:        JSON.stringify({ ...body, token }),
  });
  return { ok: true };
}

// ── 공개 API ─────────────────────────────────────────────────

/** 매출코드로 수주확률 + 주간보고 조회 */
export async function lookupByCode(code) {
  const data = await gasGetJSONP({ action: 'getActivity', code });
  if (!data.ok) throw new Error(data.error || 'GAS 오류');
  return { found: data.found || false, winrate: data.winrate ?? null, activity: data.activity ?? '' };
}

/**
 * 인콜 데이터를 GAS에 알림 발송
 * @param {object} incall
 * @param {object} notifyOpts - { method: 'email'|'chat'|'both'|'none', chatWebhookUrl?: string }
 */
export async function syncIncallToGAS(incall, notifyOpts = {}) {
  const { method = 'none', chatWebhookUrl } = typeof notifyOpts === 'string'
    ? { method: notifyOpts } // 하위호환
    : notifyOpts;
  const mailOptions = notifyOpts.mailOptions || getIncallMailOptions();
  return await gasPostNoCors({
    action: 'addIncall',
    data: { ...incall, mailOptions },
    notifyMethod: method,
    chatWebhookUrl: chatWebhookUrl || getIncallChatWebhook(),
    mailOptions,
  });
}

/**
 * zsales 배정 요청 메일 발송
 * @param {object} incall
 * @param {string} assignLink
 * @param {string} [zsalesEmail]
 */
export async function notifyZsales(incall, assignLink, zsalesEmail) {
  const mailOptions = getIncallMailOptions();
  return await gasPostNoCors({
    action: 'notifyZsales',
    data: { ...incall, mailOptions },
    assignLink,
    zsalesEmail: zsalesEmail || getIncallZsalesEmail(),
    mailOptions,
  });
}

/** GAS 연결 테스트 (JSONP) */
export async function testConnection() {
  try {
    const data = await gasGetJSONP({ action: 'getActivity', code: '__TEST__' });
    return data.ok !== undefined;
  } catch { return false; }
}
