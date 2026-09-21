/* =============================================================
   GAS 연동 API 모듈 (src/common/gasApi.js)
   도메인 전용 GAS 배포 대응:
     GET  → JSONP (script 태그, CORS 우회 + 구글 로그인 쿠키 자동 전송)
     POST → no-cors + credentials (인증 쿠키 포함, fire-and-forget)

   설정(GAS URL/토큰, zsales 이메일, 챗 웹훅, 발신 메일 옵션)은 브라우저별
   localStorage가 아니라 MySQL DB(collections 테이블, key: incallGasSettings)에
   저장한다 — PC마다 다른 값을 볼 수 있었던 문제를 없애기 위함.
   getGasUrl() 등은 동기 함수로 유지하기 위해 모듈 로드 시점에 DB 값을
   메모리 캐시로 1회 미리 불러온다 (ensureIncallGasSettingsLoaded로 완료 대기 가능).
   ============================================================= */
import { apiLoad, apiSave } from './store.js';

const SETTINGS_KEY = 'incallGasSettings';

// 기본값 (DB에 설정이 없을 때 사용)
const DEFAULT_GAS_URL    = 'https://script.google.com/a/macros/brainz.co.kr/s/AKfycbydUCsc4DEIcGo4IcToEhAu4Xep2AcpLZ9VJgMO4bCh2lOO-9yyFyJWqSnWCQ6iA64d/exec';
const DEFAULT_GAS_TOKEN  = 'brainz-incall-2026';
const DEFAULT_ZSALES_EMAIL = 'rbdud1@brainz.co.kr'; // 테스트용 (실운영: zsales@brainz.co.kr)

let settingsCache = null;
let settingsLoadPromise = null;

function loadSettingsFromDb() {
  if (!settingsLoadPromise) {
    settingsLoadPromise = apiLoad(SETTINGS_KEY, null).then((data) => {
      settingsCache = data && typeof data === 'object' ? data : {};
      return settingsCache;
    });
  }
  return settingsLoadPromise;
}

/** DB에서 설정을 미리 불러온다. 화면 마운트 시 await해서 최신값으로 동기화할 때 사용. */
export function ensureIncallGasSettingsLoaded() {
  return loadSettingsFromDb();
}

// 모듈 로드 즉시 1회 조회 시작 (이후 동기 getter들이 곧 최신값을 참조하도록)
loadSettingsFromDb();

async function saveSettings(patch) {
  await loadSettingsFromDb();
  settingsCache = { ...settingsCache, ...patch };
  await apiSave(SETTINGS_KEY, settingsCache);
  return settingsCache;
}

export function getGasUrl()   { return settingsCache?.gasUrl   || DEFAULT_GAS_URL; }
export function getGasToken() { return settingsCache?.gasToken || DEFAULT_GAS_TOKEN; }
export async function setGasConfig(url, token) {
  await saveSettings({ gasUrl: url.trim(), gasToken: token.trim() });
}
export function isGasConfigured() { return !!getGasUrl(); }

export function getIncallZsalesEmail() { return settingsCache?.zsalesEmail || DEFAULT_ZSALES_EMAIL; }
export function getIncallChatWebhook() { return settingsCache?.chatWebhook || ''; }
export function getIncallMailOptions() {
  return {
    fromName: settingsCache?.mailFromName || '',
    fromEmail: settingsCache?.mailFromEmail || '',
    replyToEmail: settingsCache?.mailReplyToEmail || '',
  };
}
export async function setIncallSettings(zsalesEmail, chatWebhook, mailOptions = {}) {
  const patch = {};
  if (zsalesEmail !== undefined) patch.zsalesEmail = zsalesEmail.trim();
  if (chatWebhook !== undefined) patch.chatWebhook = chatWebhook.trim();
  if (mailOptions.fromName !== undefined) patch.mailFromName = mailOptions.fromName.trim();
  if (mailOptions.fromEmail !== undefined) patch.mailFromEmail = mailOptions.fromEmail.trim();
  if (mailOptions.replyToEmail !== undefined) patch.mailReplyToEmail = mailOptions.replyToEmail.trim();
  await saveSettings(patch);
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
