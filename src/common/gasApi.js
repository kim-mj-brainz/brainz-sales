/* =============================================================
   GAS 연동 API 모듈 (src/common/gasApi.js)
   Google Apps Script 웹앱과 HTTP 통신.

   사용 전 설정:
     1. SpreadsheetGAS.gs 를 구글 시트 앱스스크립트에 붙여넣기
     2. GAS 배포 URL을 .env.local 의 VITE_GAS_URL 에 입력
     3. setupToken() 실행 후 같은 토큰을 VITE_GAS_TOKEN 에 입력

   .env.local 예시:
     VITE_GAS_URL=https://script.google.com/macros/s/XXXXX/exec
     VITE_GAS_TOKEN=brainz-incall-2026
   ============================================================= */

export const GAS_URL   = import.meta.env.VITE_GAS_URL   || '';
export const GAS_TOKEN = import.meta.env.VITE_GAS_TOKEN || 'brainz-incall-2026';

// ── 내부 fetch 헬퍼 ──────────────────────────────────────────
async function gasGet(params) {
  if (!GAS_URL) throw new Error('GAS_URL 미설정 (.env.local 의 VITE_GAS_URL 확인)');
  const qs = new URLSearchParams({ ...params, token: GAS_TOKEN }).toString();
  const res = await fetch(`${GAS_URL}?${qs}`, {
    method: 'GET',
    credentials: 'include', // 도메인 로그인 세션 포함
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`GAS 응답 오류: ${res.status}`);
  return res.json();
}

async function gasPost(body) {
  if (!GAS_URL) throw new Error('GAS_URL 미설정');
  const res = await fetch(GAS_URL, {
    method: 'POST',
    credentials: 'include',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, token: GAS_TOKEN }),
  });
  if (!res.ok) throw new Error(`GAS 응답 오류: ${res.status}`);
  return res.json();
}

// ── 공개 API ─────────────────────────────────────────────────

/**
 * 매출코드로 수주확률 + 주간보고 조회
 * 구글 시트 영업 요약 탭 E열 일치 → K열(수주확률), L열(주간보고) 반환
 * @param {string} code - 예: "A12345-01"
 * @returns {{ found: boolean, winrate: number|null, activity: string }}
 */
export async function lookupByCode(code) {
  const data = await gasGet({ action: 'getActivity', code });
  if (!data.ok) throw new Error(data.error || 'GAS 오류');
  return {
    found:    data.found    || false,
    winrate:  data.winrate  ?? null,
    activity: data.activity ?? '',
  };
}

/**
 * 인콜 데이터를 GAS(구글 시트 InCall 탭)에 저장
 * @param {object} incall - 인콜 레코드 전체
 */
export async function syncIncallToGAS(incall) {
  const data = await gasPost({ action: 'addIncall', data: incall });
  if (!data.ok) throw new Error(data.error || 'GAS 저장 실패');
  return data;
}

/**
 * 영업 요약 시트 전체 반환
 */
export async function getAllSalesData() {
  const data = await gasGet({ action: 'getAllSales' });
  if (!data.ok) throw new Error(data.error || 'GAS 오류');
  return data.rows || [];
}

/**
 * GAS 연결 테스트
 */
export async function testConnection() {
  try {
    await gasGet({ action: 'getActivity', code: '__TEST__' });
    return true;
  } catch {
    return false;
  }
}
