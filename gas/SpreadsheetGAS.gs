const SALES_SHEET_NAME = '영업 요약';
const COL_CODE     = 5;
const COL_WINRATE  = 11;
const COL_ACTIVITY = 12;
const ALLOWED_DOMAIN = 'brainz.co.kr';

// 기본 구글챗 웹훁 URL (설정 안 한 폴백)
const DEFAULT_CHAT_WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/AAQArZ5D0S8/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=N3LyGkgtuzRVz6bemZLIBsxPx93WyQS1yesiTxys0KY';

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
function validateToken(p) { var t = getToken(); return !t || p.token === t; }
function validateDomain() {
  try { var e = Session.getActiveUser().getEmail(); return !e || e.endsWith('@' + ALLOWED_DOMAIN); }
  catch(err) { return true; }
}

function toResponse(obj, callback) {
  var json = JSON.stringify(obj);
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
  var p = e.parameter || {};

  // 담당자 지정 HTML 페이지 (토큰 포함 URL)
  if (p.action === 'assign') {
    return serveAssignPage(p);
  }

  try {
    var callback = p.callback || '';
    if (!validateToken(p))  return toResponse(errData('인증 실패', 401), callback);
    if (!validateDomain())  return toResponse(errData('접근 권한 없음', 403), callback);

    var action = p.action || '';

    if (action === 'getActivity') {
      var code = (p.code || '').trim();
      if (!code || code === '__TEST__') return toResponse({ ok: true, found: false, ping: true }, callback);

      var ss    = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(SALES_SHEET_NAME);
      if (!sheet) return toResponse(errData('시트 "' + SALES_SHEET_NAME + '" 없음'), callback);

      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return toResponse({ ok: true, found: false }, callback);

      var colMax = Math.max(COL_ACTIVITY, COL_WINRATE, COL_CODE);
      var data   = sheet.getRange(2, 1, lastRow - 1, colMax).getValues();

      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        if (String(row[COL_CODE - 1] || '').trim() === code) {
          var rawW = row[COL_WINRATE - 1];
          var winrate = null;
          if (rawW !== '' && rawW !== null && rawW !== undefined) {
            var num = parseFloat(rawW);
            if (!isNaN(num)) {
              winrate = (num > 0 && num <= 1) ? Math.round(num * 100) : Math.round(num);
            }
          }
          return toResponse({
            ok: true, found: true,
            winrate: winrate,
            activity: String(row[COL_ACTIVITY - 1] || '').trim(),
          }, callback);
        }
      }
      return toResponse({ ok: true, found: false }, callback);
    }

    if (action === 'getAllSales') {
      var ss2    = SpreadsheetApp.getActiveSpreadsheet();
      var sheet2 = ss2.getSheetByName(SALES_SHEET_NAME);
      if (!sheet2) return toResponse(errData('시트 "' + SALES_SHEET_NAME + '" 없음'), callback);
      var lastRow2 = sheet2.getLastRow(), lastCol2 = sheet2.getLastColumn();
      if (lastRow2 < 2) return toResponse({ ok: true, rows: [] }, callback);
      var headers2 = sheet2.getRange(1, 1, 1, lastCol2).getValues()[0];
      var rows2    = sheet2.getRange(2, 1, lastRow2 - 1, lastCol2).getValues();
      return toResponse({ ok: true, rows: rows2.map(function(r) {
        var obj = {};
        headers2.forEach(function(h, idx) { obj[h || ('col' + (idx+1))] = r[idx]; });
        return obj;
      }) }, callback);
    }

    return toResponse(errData('알 수 없는 action'), callback);
  } catch (err) { return toResponse(errData('서버 오류: ' + err.message, 500), p.callback || ''); }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (!validateToken(body)) return toResponse(errData('인증 실패', 401), '');
    if (!validateDomain())    return toResponse(errData('접근 권한 없음', 403), '');

    var action         = body.action || '';
    var notifyMethod   = body.notifyMethod || 'none';
    var chatWebhookUrl = body.chatWebhookUrl || DEFAULT_CHAT_WEBHOOK_URL;
    var mailOptions    = body.mailOptions || {};

    if (action === 'addIncall') {
      var d = body.data || {};
      d.mailOptions = d.mailOptions || mailOptions;
      if (notifyMethod === 'email' || notifyMethod === 'both') sendEmailNotification(d);
      if (notifyMethod === 'chat'  || notifyMethod === 'both') sendChatNotification(d, chatWebhookUrl);
      return toResponse({ ok: true, message: '알림 발송 완료' }, '');
    }

    if (action === 'notifyZsales') {
      var d2 = body.data || {};
      d2.mailOptions = d2.mailOptions || mailOptions;
      var assignLink = body.assignLink || '';
      var zsalesEmail = body.zsalesEmail || 'zsales@brainz.co.kr';
      sendZsalesNotification(d2, assignLink, zsalesEmail);
      return toResponse({ ok: true, message: 'zsales 알림 발송 완료' }, '');
    }

    return toResponse(errData('알 수 없는 action'), '');
  } catch (err) { return toResponse(errData('서버 오류: ' + err.message, 500), ''); }
}

// ── 담당자 지정 HTML 페이지 ───────────────────────────────────────
function serveAssignPage(p) {
  if (!validateToken(p)) {
    return HtmlService.createHtmlOutput('<h2 style="color:red">인증 실패</h2>').setTitle('오류');
  }

  var assignData = {};
  try {
    var bytes = Utilities.base64Decode(p.data || '');
    var decoded = Utilities.newBlob(bytes).getDataAsString('UTF-8');
    assignData = JSON.parse(decoded);
  } catch (err) {
    return HtmlService.createHtmlOutput('<h2 style="color:red">데이터 오류: ' + err.message + '</h2>').setTitle('오류');
  }

  var sp = assignData.salesPersons || [];
  var optHtml = sp.map(function(s) {
    return '<option value="' + s.name + '|' + (s.email || '') + '">' + s.name + (s.email ? ' (' + s.email + ')' : '') + '</option>';
  }).join('');
  // 폴백: 담당자 목록 없으면 MEMBER_EMAIL 사용
  if (!optHtml) {
    optHtml = Object.keys(MEMBER_EMAIL).map(function(name) {
      return '<option value="' + name + '|' + MEMBER_EMAIL[name] + '">' + name + ' (' + MEMBER_EMAIL[name] + ')</option>';
    }).join('');
  }

  var infra = (assignData.infra || []).join(', ') || '-';
  var chatWebhook = assignData.chatWebhook || DEFAULT_CHAT_WEBHOOK_URL;

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>담당자 지정</title>'
    + '<style>*{box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#f0f4f8;margin:0;padding:16px}'
    + '.card{background:#fff;border-radius:12px;padding:24px;max-width:560px;margin:0 auto;box-shadow:0 2px 16px rgba(0,0,0,.1)}'
    + 'h2{color:#1e40af;margin:0 0 20px;font-size:18px}'
    + 'table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px}'
    + 'td{padding:8px 10px;border-bottom:1px solid #e2e8f0}'
    + 'td:first-child{color:#64748b;width:90px;white-space:nowrap;font-size:13px}'
    + 'select{width:100%;padding:9px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;margin-top:4px;background:#fff}'
    + '.field{margin-bottom:16px}label.lbl{font-weight:600;font-size:13px;color:#374151;display:block;margin-bottom:4px}'
    + '.radio-group{display:flex;flex-wrap:wrap;gap:12px;margin-top:6px}'
    + '.radio-group label{font-size:13px;display:flex;align-items:center;gap:5px;cursor:pointer;font-weight:400}'
    + 'button{width:100%;padding:13px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;margin-top:4px}'
    + 'button:hover{background:#1d4ed8}button:disabled{background:#94a3b8;cursor:not-allowed}'
    + '#status{margin-top:14px;padding:11px;border-radius:8px;font-size:14px;text-align:center;display:none}'
    + '.ok{background:#dcfce7;color:#166534}.err{background:#fee2e2;color:#991b1b}'
    + '</style></head><body>'
    + '<div class="card"><h2>🔔 InCall 담당자 지정</h2>'
    + '<table>'
    + '<tr><td>엔드유저</td><td><b>' + (assignData.endUser || '-') + '</b></td></tr>'
    + '<tr><td>문의회사</td><td>' + (assignData.company || '-') + '</td></tr>'
    + '<tr><td>유입일자</td><td>' + (assignData.inflowDate || '-') + ' (' + (assignData.inflowType || '-') + ')</td></tr>'
    + '<tr><td>인프라</td><td>' + infra + '</td></tr>'
    + '</table>'
    + '<div class="field"><label class="lbl">담당영업 지정</label>'
    + '<select id="salesSel"><option value="">선택하세요</option>' + optHtml + '</select></div>'
    + '<div class="field"><label class="lbl">알림 방법</label>'
    + '<div class="radio-group">'
    + '<label><input type="radio" name="nm" value="both" checked> 이메일+구글챗</label>'
    + '<label><input type="radio" name="nm" value="email"> 이메일만</label>'
    + '<label><input type="radio" name="nm" value="chat"> 구글챗만</label>'
    + '<label><input type="radio" name="nm" value="none"> 알림없음</label>'
    + '</div></div>'
    + '<button id="btn" onclick="doSubmit()">담당자 지정 완료</button>'
    + '<div id="status"></div></div>'
    + '<script>'
    + 'var INCALL_DATA=' + JSON.stringify(assignData) + ';'
    + 'var CHAT_WH=' + JSON.stringify(chatWebhook) + ';'
    + 'function doSubmit(){'
    + '  var sel=document.getElementById("salesSel").value;'
    + '  if(!sel){alert("담당영업을 선택하세요");return;}'
    + '  var parts=sel.split("|");'
    + '  var nm=document.querySelector("input[name=nm]:checked").value;'
    + '  var btn=document.getElementById("btn");'
    + '  var st=document.getElementById("status");'
    + '  btn.disabled=true;'
    + '  st.style.display="block";st.className="";st.textContent="체리 중...";'
    + '  google.script.run'
    + '    .withSuccessHandler(function(){'
    + '      st.className="ok";'
    + '      st.textContent="✅ 담당자 지정 완료! 알림이 발송되었습니다.";'
    + '    })'
    + '    .withFailureHandler(function(err){'
    + '      btn.disabled=false;'
    + '      st.className="err";'
    + '      st.textContent="오류: "+(err.message||err);'
    + '    })'
    + '    .processAssignmentFromForm({'
    + '      salesName:parts[0],'
    + '      salesEmail:parts[1]||"",'
    + '      notifyMethod:nm,'
    + '      chatWebhookUrl:CHAT_WH,'
    + '      incallInfo:INCALL_DATA'
    + '    });'
    + '}'
    + '<\/script></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('담당자 지정 — ' + (assignData.endUser || 'InCall'))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function applyMailOptions(message, mailOptions) {
  var opts = mailOptions || {};
  var fromName = String(opts.fromName || '').trim();
  var fromEmail = String(opts.fromEmail || '').trim();
  var replyToEmail = String(opts.replyToEmail || '').trim();

  if (fromName) message.name = fromName;
  if (replyToEmail) message.replyTo = replyToEmail;
  if (fromEmail) message.from = fromEmail;
  return message;
}

function canSendFromAlias(fromEmail) {
  var target = String(fromEmail || '').trim().toLowerCase();
  if (!target) return false;
  try {
    var aliases = GmailApp.getAliases() || [];
    for (var i = 0; i < aliases.length; i++) {
      if (String(aliases[i] || '').trim().toLowerCase() === target) return true;
    }
  } catch (err) {
    Logger.log('Gmail alias check failed: ' + err.message);
  }
  return false;
}

function sendConfiguredMail(message, mailOptions) {
  var msg = applyMailOptions(message, mailOptions);
  var fromEmail = String((mailOptions || {}).fromEmail || '').trim();

  if (fromEmail && canSendFromAlias(fromEmail)) {
    var options = {};
    if (msg.htmlBody) options.htmlBody = msg.htmlBody;
    if (msg.name) options.name = msg.name;
    if (msg.replyTo) options.replyTo = msg.replyTo;
    if (msg.cc) options.cc = msg.cc;
    if (msg.bcc) options.bcc = msg.bcc;
    if (msg.attachments) options.attachments = msg.attachments;
    if (msg.inlineImages) options.inlineImages = msg.inlineImages;
    options.from = fromEmail;
    GmailApp.sendEmail(msg.to, msg.subject, msg.body || '', options);
    return;
  }

  if (fromEmail) {
    Logger.log('Requested From address is not a Gmail alias for this Apps Script account: ' + fromEmail);
  }
  delete msg.from;
  MailApp.sendEmail(msg);
}

// ── 담당자 지정 폼 처리 (google.script.run 호출) ───────────────
function processAssignmentFromForm(formData) {
  var salesName    = formData.salesName    || '';
  var salesEmail   = formData.salesEmail   || '';
  var notifyMethod = formData.notifyMethod || 'none';
  var chatWebhook  = formData.chatWebhookUrl || DEFAULT_CHAT_WEBHOOK_URL;
  var d            = formData.incallInfo   || {};

  // MEMBER_EMAIL 폴백
  if (!salesEmail && salesName && MEMBER_EMAIL[salesName]) {
    salesEmail = MEMBER_EMAIL[salesName];
  }

  if (notifyMethod === 'email' || notifyMethod === 'both') {
    sendAssignmentEmail(salesEmail, salesName, d);
  }
  if (notifyMethod === 'chat' || notifyMethod === 'both') {
    sendAssignmentChat(chatWebhook, salesName, d);
  }

  Logger.log('✅ 담당자 지정: ' + salesName + ' (' + salesEmail + ') / ' + notifyMethod);
  return { ok: true };
}

// ── 담당자 배정 이메일 ─────────────────────────────────────────────
function sendAssignmentEmail(salesEmail, salesName, d) {
  if (!salesEmail) { Logger.log('ℹ️ 담당자 이메일 없음'); return; }
  var infra = (d.infra || []).join(', ') || '-';
  var title = '[InCall 배정] ' + (d.endUser || '(미입력)') + ' — 담당 배정되었습니다';
  var bodyTxt = '안녕하세요, ' + salesName + '님.\n\n'
    + '아래 InCall 건에 담당영업으로 배정되었습니다.\n\n'
    + '■ 인콜 정보\n'
    + '  엔드유저 : ' + (d.endUser || '-') + '\n'
    + '  문의회사 : ' + (d.company || '-') + '\n'
    + '  유입일자 : ' + (d.inflowDate || '-') + ' (' + (d.inflowType || '-') + ')\n'
    + '  인프라   : ' + infra + (d.infraDetail ? ' / ' + d.infraDetail : '') + '\n'
    + (d.contactPerson ? '  문의담당자: ' + d.contactPerson + (d.contactPhone ? ' (' + d.contactPhone + ')' : '') + '\n' : '')
    + (d.note ? '  비고      : ' + d.note + '\n' : '')
    + '\n확인 후 진행 부탁드립니다.\n\nbrainz 영업관리시스템 InCall CRM';

  var htmlBody = '<div style="font-family:sans-serif;max-width:600px">'
    + '<h3 style="color:#1e40af">' + title + '</h3>'
    + '<pre style="background:#f8fafc;padding:16px;border-radius:8px;font-size:14px;line-height:1.8">' + bodyTxt + '</pre>'
    + '<p style="color:#94a3b8;font-size:11px">brainz 영업관리시스템 InCall CRM</p></div>';

  try {
    sendConfiguredMail({ to: salesEmail, subject: title, body: bodyTxt, htmlBody: htmlBody }, d.mailOptions);
    Logger.log('✅ 배정 메일 → ' + salesEmail);
  } catch (err) { Logger.log('❌ 배정 메일 실패: ' + err.message); }
}

// ── 담당자 배정 구글챗 ────────────────────────────────────────────
function sendAssignmentChat(webhookUrl, salesName, d) {
  if (!webhookUrl) { Logger.log('ℹ️ 챗 웹훁 미설정'); return; }
  var infra = (d.infra || []).join(', ') || '-';
  var text = [
    '🎯 *[InCall 담당자 배정]*',
    '• 담당영업: *' + salesName + '*',
    '• 엔드유저: *' + (d.endUser || '-') + '*',
    '• 문의회사: ' + (d.company || '-'),
    '• 유입일자: ' + (d.inflowDate || '-') + ' (' + (d.inflowType || '-') + ')',
    '• 인프라: ' + infra,
  ].join('\n');
  try {
    UrlFetchApp.fetch(webhookUrl, { method: 'POST', contentType: 'application/json', payload: JSON.stringify({ text: text }) });
    Logger.log('✅ 배정 챗 → ' + salesName);
  } catch (err) { Logger.log('❌ 배정 챗 실패: ' + err.message); }
}

// ── 구글챗 알림 발송 ──────────────────────────────────────────────────
function sendChatNotification(d, webhookUrl) {
  var url = webhookUrl || DEFAULT_CHAT_WEBHOOK_URL;
  if (!url) { Logger.log('ℹ️ 구글챗 웹훁 미설정'); return; }
  var infra = (d.infra || []).join(', ') || '-';
  var lines = [
    '🔔 *[InCall 신규 등록]*',
    '• 유입일자: ' + (d.inflowDate || '-') + ' (' + (d.inflowType || '-') + ')',
    '• 엔드유저: *' + (d.endUser || '-') + '*',
    '• 문의회사: ' + (d.company || '-'),
    '• 인프라: ' + infra + (d.infraDetail ? ' / ' + d.infraDetail : ''),
    '• 담당영업: ' + (d.sales || '-'),
    '• 진행상태: ' + (d.status || '-') + ' (수주 ' + (d.winrate || 0) + '%)',
    d.salesCode ? '• 매출코드: ' + d.salesCode : '',
    d.activity  ? '• 활동내역: ' + d.activity.slice(0, 200) + (d.activity.length > 200 ? '…' : '') : '',
  ].filter(Boolean).join('\n');

  try {
    UrlFetchApp.fetch(url, { method: 'POST', contentType: 'application/json', payload: JSON.stringify({ text: lines }) });
    Logger.log('✅ 구글챗 알림 발송 완료');
  } catch (err) { Logger.log('❌ 구글챗 알림 실패: ' + err.message); }
}

// ── 이메일 알림 발송 ──────────────────────────────────────────────────
function sendEmailNotification(d) {
  var infra   = (d.infra || []).join(', ') || '-';
  var title   = '[InCall 신규] ' + (d.endUser || '(미입력)') + ' — 진행 요청';
  var details = [
    '📅 유입일자  : ' + (d.inflowDate || '-'),
    '📋 유입유형  : ' + (d.inflowType || '-'),
    '🏢 엔드유저  : ' + (d.endUser || '-'),
    '🏬 문의회사  : ' + (d.company || '-'),
    '👤 문의담당자: ' + (d.contactPerson || '-') + (d.contactPhone ? ' (' + d.contactPhone + ')' : ''),
    '🖥️ 인프라    : ' + infra + (d.infraDetail ? ' / ' + d.infraDetail : ''),
    '👔 담당영업  : ' + (d.sales || '-'),
    '📊 진행상태  : ' + (d.status || '-') + ' (수주 ' + (d.winrate || 0) + '%)',
    d.salesCode ? '🔑 매출코드  : ' + d.salesCode : '',
    d.activity  ? '📝 활동내역  : ' + d.activity.slice(0, 300) + (d.activity.length > 300 ? '…' : '') : '',
    d.note      ? '📌 비고      : ' + d.note : '',
    '', '위 건에 대해 담당자 확인 후 진행 부탁드립니다.',
  ].filter(Boolean).join('\n');

  var recipients = {};
  if (d.sales && MEMBER_EMAIL[d.sales]) recipients[MEMBER_EMAIL[d.sales]] = true;
  var toList = Object.keys(recipients).join(',');

  if (!toList) { Logger.log('ℹ️ 담당자 이메일 매핑 없음'); return; }

  try {
    sendConfiguredMail({
      to: toList, subject: title, body: details,
      htmlBody: '<div style="font-family:sans-serif;max-width:600px"><h3 style="color:#1e40af">' + title + '</h3><pre style="background:#f8fafc;padding:16px;border-radius:8px;line-height:1.8;font-size:14px">' + details + '</pre><p style="color:#94a3b8;font-size:12px">brainz 영업관리시스템 InCall CRM</p></div>',
    }, d.mailOptions);
    Logger.log('✅ Gmail → ' + toList);
  } catch (err) { Logger.log('❌ Gmail 실패: ' + err.message); }
}

// ── zsales 배정 요청 메일 ────────────────────────────────────────────────
function sendZsalesNotification(d, assignLink, zsalesEmail) {
  var toEmail = zsalesEmail || 'zsales@brainz.co.kr';
  var infra  = (d.infra || []).join(', ') || '-';
  var title  = '[InCall 배정 요청] ' + (d.endUser || '(미입력)') + ' — ' + (d.company || '-');

  var rows = [
    ['엔드유저',   d.endUser || '-'],
    ['문의회사',   d.company || '-'],
    ['유입유형',   d.inflowType || '-'],
    ['유입일자',   d.inflowDate || '-'],
    ['문의인프라', infra + (d.infraDetail ? ' / ' + d.infraDetail : '')],
    ['문의담당자', (d.contactPerson || '-') + (d.contactPhone ? ' (' + d.contactPhone + ')' : '')],
    ['비고',       d.note || ''],
  ].filter(function(r) { return r[1]; });

  var tableRows = rows.map(function(r) {
    return '<tr><td style="padding:7px 10px;color:#64748b;width:90px;white-space:nowrap">' + r[0] + '</td>'
         + '<td style="padding:7px 10px">' + r[1] + '</td></tr>';
  }).join('');

  var btnHtml = assignLink
    ? '<a href="' + assignLink + '" style="display:inline-block;margin-top:20px;padding:11px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">담당자 지정하기 →</a>'
    : '';

  var htmlBody =
    '<div style="font-family:sans-serif;max-width:600px">'
    + '<h3 style="color:#1e40af;margin-bottom:16px">' + title + '</h3>'
    + '<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">'
    + tableRows + '</table>'
    + btnHtml
    + '<p style="color:#94a3b8;font-size:11px;margin-top:24px">brainz 영업관리시스템 InCall CRM</p>'
    + '</div>';

  var plainBody = rows.map(function(r) { return r[0] + ': ' + r[1]; }).join('\n')
    + (assignLink ? '\n\n담당자 지정 링크: ' + assignLink : '');

  try {
    sendConfiguredMail({ to: toEmail, subject: title, body: plainBody, htmlBody: htmlBody }, d.mailOptions);
    Logger.log('✅ zsales 메일 → ' + toEmail);
  } catch (err) { Logger.log('❌ zsales 메일 실패: ' + err.message); }
}

// ── 설정 함수 ─────────────────────────────────────────────────────────
function setupToken() {
  PropertiesService.getScriptProperties().setProperty(PROP_TOKEN, 'brainz-incall-2026');
  Logger.log('✅ 토큰 설정 완료');
}

function testAll() {
  Logger.log('로그인: ' + Session.getActiveUser().getEmail());
  Logger.log('토큰: ' + (getToken() || '미설정'));
  sendChatNotification({
    inflowDate: new Date().toISOString().slice(0,10), inflowType: '테스트',
    endUser: '테스트 엔드유저', company: '테스트 회사',
    infra: ['EMS'], infraDetail: 'NMS',
    sales: '이규영',
    status: '컨택중', winrate: 20, salesCode: '', activity: 'GAS 테스트',
  }, DEFAULT_CHAT_WEBHOOK_URL);
  Logger.log('✅ 테스트 완료');
}
