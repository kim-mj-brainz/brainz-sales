const SALES_SHEET_NAME  = '영업 요약';
const INCALL_SHEET_NAME = 'InCall';
const COL_CODE     = 5;
const COL_WINRATE  = 11;
const COL_ACTIVITY = 12;
const ALLOWED_DOMAIN = 'brainz.co.kr';

const MEMBER_EMAIL = {
  '심재걸': 'mouzo@brainz.co.kr',
  '서은숙': 'seo@brainz.co.kr',
  '송택수': 'mitaek@brainz.co.kr',
  '김선길': 'kimsk@brainz.co.kr',
  '이규영': 'rbdud1@brainz.co.kr',
  '김영민': 'sky443@brainz.co.kr',
  '진석빈': 'sb.jin@brainz.co.kr',
  '박종관': 'killen9@brainz.co.kr',
  '신지연': 'jy.shin@brainz.co.kr',
  '이성경': 'lee.sk@brainz.co.kr',
  '김민지': 'kim.mj@brainz.co.kr',
};

const PROP_TOKEN = 'AUTH_TOKEN';

function getToken()       { return PropertiesService.getScriptProperties().getProperty(PROP_TOKEN); }
function validateToken(p) { const t = getToken(); return !t || p.token === t; }
function validateDomain() {
  try { const e = Session.getActiveUser().getEmail(); return !e || e.endsWith('@' + ALLOWED_DOMAIN); }
  catch { return true; }
}

function toResponse(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function errData(msg, code) { return { ok: false, error: msg, code: code || 400 }; }

function doGet(e) {
  try {
    const p        = e.parameter || {};
    const callback = p.callback  || '';

    if (!validateToken(p))  return toResponse(errData('인증 실패', 401), callback);
    if (!validateDomain())  return toResponse(errData('접근 권한 없음', 403), callback);

    const action = p.action || '';

    if (action === 'getActivity') {
      const code = (p.code || '').trim();
      if (!code || code === '__TEST__') return toResponse({ ok: true, found: false, ping: true }, callback);

      const ss    = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SALES_SHEET_NAME);
      if (!sheet) return toResponse(errData(`시트 "${SALES_SHEET_NAME}" 없음`), callback);

      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return toResponse({ ok: true, found: false }, callback);

      const colMax = Math.max(COL_ACTIVITY, COL_WINRATE, COL_CODE);
      const data   = sheet.getRange(2, 1, lastRow - 1, colMax).getValues();

      for (const row of data) {
        if (String(row[COL_CODE - 1] || '').trim() === code) {
          const rawW = row[COL_WINRATE - 1];
          let winrate = null;
          if (rawW !== '' && rawW !== null && rawW !== undefined) {
            const num = parseFloat(rawW);
            if (!isNaN(num)) {
              // 소수형(0.7 → 70%) 또는 정수형(70 → 70%) 모두 처리
              winrate = (num > 0 && num <= 1) ? Math.round(num * 100) : Math.round(num);
            }
          }
          return toResponse({
            ok: true, found: true,
            winrate,
            activity: String(row[COL_ACTIVITY - 1] || '').trim(),
          }, callback);
        }
      }
      return toResponse({ ok: true, found: false }, callback);
    }

    if (action === 'getAllSales') {
      const ss    = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SALES_SHEET_NAME);
      if (!sheet) return toResponse(errData(`시트 "${SALES_SHEET_NAME}" 없음`), callback);
      const lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
      if (lastRow < 2) return toResponse({ ok: true, rows: [] }, callback);
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const rows    = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      return toResponse({ ok: true, rows: rows.map(r => Object.fromEntries(headers.map((h, i) => [h || `col${i+1}`, r[i]]))) }, callback);
    }

    return toResponse(errData('알 수 없는 action'), callback);
  } catch (err) { return toResponse(errData('서버 오류: ' + err.message, 500), p.callback || ''); }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (!validateToken(body)) return toResponse(errData('인증 실패', 401), '');
    if (!validateDomain())    return toResponse(errData('접근 권한 없음', 403), '');

    const action       = body.action || '';
    const notifyMethod = body.notifyMethod || 'none';
    const ss           = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'addIncall') {
      const d = body.data || {};
      let sheet = ss.getSheetByName(INCALL_SHEET_NAME);
      if (!sheet) {
        sheet = ss.insertSheet(INCALL_SHEET_NAME);
        sheet.appendRow(['ID','유입일자','유입유형','엔드유저','문의회사','문의담당자','문의연락처','문의인프라','담당영업','프리세일즈','진행상태','수주여부(%)','매출코드','활동내역','비고','등록일시','등록자ID']);
      }
      sheet.appendRow([d.id||'',d.inflowDate||'',d.inflowType||'',d.endUser||'',d.company||'',d.contactPerson||'',d.contactPhone||'',(d.infra||[]).join('/'),d.sales||'',d.presales||'',d.status||'',d.winrate||0,d.salesCode||'',d.activity||'',d.note||'',new Date().toISOString(),d.ownerId||'']);

      if (notifyMethod !== 'none') sendEmailNotification(d);

      return toResponse({ ok: true, message: `인콜 저장 완료` }, '');
    }

    return toResponse(errData('알 수 없는 action'), '');
  } catch (err) { return toResponse(errData('서버 오류: ' + err.message, 500), ''); }
}

// ── 이메일 알림 발송 ──────────────────────────────────────────
function sendEmailNotification(d) {
  const infra   = (d.infra || []).join(', ') || '-';
  const title   = `[InCall 신규] ${d.endUser || '(미입력)'} — 진행 요청`;
  const details = [
    `📅 유입일자  : ${d.inflowDate || '-'}`,
    `📋 유입유형  : ${d.inflowType || '-'}`,
    `🏢 엔드유저  : ${d.endUser || '-'}`,
    `🏬 문의회사  : ${d.company || '-'}`,
    `👤 문의담당자: ${d.contactPerson || '-'}${d.contactPhone ? ' (' + d.contactPhone + ')' : ''}`,
    `🖥️ 인프라    : ${infra}${d.infraDetail ? ' / ' + d.infraDetail : ''}`,
    `👔 담당영업  : ${d.sales || '-'}`,
    `🔬 프리세일즈: ${d.presales || '-'}`,
    `📊 진행상태  : ${d.status || '-'} (수주 ${d.winrate || 0}%)`,
    d.salesCode ? `🔑 매출코드  : ${d.salesCode}` : '',
    d.activity  ? `📝 활동내역  : ${d.activity.slice(0, 300)}${d.activity.length > 300 ? '…' : ''}` : '',
    d.note      ? `📌 비고      : ${d.note}` : '',
    '', '위 건에 대해 담당자 확인 후 진행 부탁드립니다.',
  ].filter(Boolean).join('\n');

  const recipients = new Set();
  if (d.sales    && MEMBER_EMAIL[d.sales])    recipients.add(MEMBER_EMAIL[d.sales]);
  if (d.presales && MEMBER_EMAIL[d.presales]) recipients.add(MEMBER_EMAIL[d.presales]);
  const toList = [...recipients].join(',');

  if (!toList) { Logger.log('ℹ️ 담당자 이메일 매핑 없음'); return; }

  try {
    MailApp.sendEmail({
      to: toList, subject: title, body: details,
      htmlBody: `<div style="font-family:sans-serif;max-width:600px"><h3 style="color:#1e40af">${title}</h3><pre style="background:#f8fafc;padding:16px;border-radius:8px;line-height:1.8;font-size:14px">${details}</pre><p style="color:#94a3b8;font-size:12px">brainz 영업관리시스템 InCall CRM</p></div>`,
    });
    Logger.log('✅ Gmail → ' + toList);
  } catch (err) { Logger.log('❌ Gmail 실패: ' + err.message); }
}

// ── 설정 함수 ─────────────────────────────────────────────────
function setupToken() {
  PropertiesService.getScriptProperties().setProperty(PROP_TOKEN, 'brainz-incall-2026');
  Logger.log('✅ 토큰 설정 완료');
}

function testAll() {
  Logger.log('로그인: ' + Session.getActiveUser().getEmail());
  Logger.log('토큰: ' + (getToken() || '미설정'));
  sendEmailNotification({
    inflowDate: new Date().toISOString().slice(0,10), inflowType: '테스트',
    endUser: '테스트 엔드유저', company: '테스트 회사',
    contactPerson: '홍길동', contactPhone: '010-0000-0000',
    infra: ['EMS'], infraDetail: 'NMS',
    sales: '이규영', presales: '박종관',
    status: '컨택중', winrate: 20, salesCode: '', activity: 'GAS 테스트',
  });
  Logger.log('✅ 테스트 완료');
}
