export const DEFAULT_INSPECTION_MAIL_SETTINGS = {
  id: 'default',
  enabled: true,
  apiUrl: 'http://127.0.0.1:5174/api/document-mails/inspection',
  senderName: '',
  ccSales: true,
  smtpEnabled: false,
  smtpHost: '',
  smtpPort: '587',
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  smtpFromEmail: '',
  smtpTestEmail: '',
  creditGoogleChatWebhookUrl: '',
  creditGoogleChatRequestTemplate: `요청일시: {requestedAt}
요청자: {requester}
회사명: {company}`,
  creditGoogleChatTestMessage: 'Google Chat 웹훅 연동 테스트입니다.',
  subject: '[검수확인서] {customer} {project}',
  body: `담당엔지니어님,

{customer} {project} 검수확인서를 전달드립니다.

문서번호: {documentNo}
품목수: {itemCount}개

감사합니다.`,
};

function fillTemplate(template, context) {
  return String(template || '').replace(/\{(\w+)\}/g, (match, key) => context[key] ?? '');
}

function hideCreditInputUrlLine(text, inputUrl) {
  const url = String(inputUrl || '').trim();
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = line.replace(/\s+/g, '').toLowerCase();
      if (normalized.startsWith('입력url:') || normalized.startsWith('입력url：')) return false;
      if (url && line.includes(url)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('첨부파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(blob);
  });
}

function buildContext({ data, items, recipient, filename, documentNo }) {
  return {
    customer: data.customer || '',
    project: data.project || '',
    issueDate: data.issueDate || '',
    documentNo: documentNo || '',
    salesCode: data.salesCode || '',
    engineer: recipient.name || '',
    engineerEmail: recipient.email || '',
    sales: data.salesName || '',
    salesEmail: data.salesEmail || '',
    itemCount: String(items.length),
    filename,
  };
}

function buildSmtpPayload(settings) {
  if (!settings.smtpEnabled) return null;
  return {
    host: String(settings.smtpHost || '').trim(),
    port: Number(settings.smtpPort) || 587,
    secure: Boolean(settings.smtpSecure),
    user: String(settings.smtpUser || '').trim(),
    password: settings.smtpPassword || '',
    fromEmail: String(settings.smtpFromEmail || '').trim(),
  };
}

function formatKoreanDateTime(date = new Date()) {
  const hours = date.getHours();
  const period = hours < 12 ? '오전' : '오후';
  const displayHours = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}. ${period} ${displayHours}:${minutes}:${seconds}`;
}

async function readApiError(response) {
  try {
    const payload = await response.json();
    return payload.error || payload.message || '';
  } catch (error) {
    return '';
  }
}

export async function sendInspectionMail({ settings, data, items, recipient, cc, blob, filename, documentNo }) {
  if (!settings.enabled) return { status: 'disabled' };
  if (!recipient.email) throw new Error('담당엔지니어 이메일이 없어 메일을 보낼 수 없습니다.');

  const context = buildContext({ data, items, recipient, filename, documentNo });
  const subject = fillTemplate(settings.subject, context);
  const body = fillTemplate(settings.body, context);
  const apiUrl = String(settings.apiUrl || DEFAULT_INSPECTION_MAIL_SETTINGS.apiUrl).trim();
  const smtp = buildSmtpPayload(settings);

  if (apiUrl) {
    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'inspection-confirmation',
          fromName: settings.senderName,
          to: [{ name: recipient.name, email: recipient.email }],
          cc,
          smtp,
          subject,
          body,
          attachments: [{
            filename,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            contentBase64: await blobToBase64(blob),
          }],
          meta: {
            customer: data.customer,
            project: data.project,
            salesCode: data.salesCode,
            documentNo,
            itemCount: items.length,
          },
        }),
      });
    } catch (error) {
      throw new Error('문서 메일 API 서버가 실행 중인지 확인하세요. run-web.bat로 실행하면 같이 시작됩니다.');
    }

    if (!response.ok) {
      const detail = await readApiError(response);
      throw new Error(detail || `메일 API 발송 실패 (${response.status})`);
    }

    return { status: 'sent' };
  }

  if (smtp) {
    throw new Error('문서 메일 API 서버 설정을 확인하세요.');
  }

  const params = new URLSearchParams({ subject, body });
  if (cc?.length) params.set('cc', cc.map((item) => item.email).filter(Boolean).join(','));
  window.location.href = `mailto:${encodeURIComponent(recipient.email)}?${params.toString()}`;
  return { status: 'draft' };
}

export async function sendSmtpTestMail({ settings, requester }) {
  const apiUrl = String(settings.apiUrl || DEFAULT_INSPECTION_MAIL_SETTINGS.apiUrl).trim();
  const smtp = buildSmtpPayload({ ...settings, smtpEnabled: true });
  const toEmail = String(settings.smtpTestEmail || requester?.email || '').trim();

  if (!smtp.host) throw new Error('SMTP Host를 입력하세요.');
  if (!toEmail) throw new Error('테스트 수신 이메일을 입력하세요.');

  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'smtp-test',
        fromName: settings.senderName || requester?.name || '',
        to: [{ name: requester?.name || '테스트 수신자', email: toEmail }],
        cc: [],
        smtp,
        subject: '[문서 설정] SMTP 테스트 메일',
        body: [
          '문서-설정 SMTP 연동 테스트 메일입니다.',
          `요청일시: ${formatKoreanDateTime()}`,
          `요청자: ${requester?.name || '-'}`,
        ].join('\n'),
        attachments: [],
        meta: {
          test: true,
          source: 'document-settings',
        },
      }),
    });
  } catch (error) {
    throw new Error('문서 메일 API 서버가 실행 중인지 확인하세요. run-web.bat로 실행하면 같이 시작됩니다.');
  }

  if (!response.ok) {
    const detail = await readApiError(response);
    throw new Error(detail || `SMTP 테스트 메일 발송 실패 (${response.status})`);
  }
  return { status: 'sent' };
}

export function buildCreditInputUrl({ company }) {
  const location = typeof window !== 'undefined' ? window.location : null;
  const origin = new URL(location?.origin || 'http://127.0.0.1:5173');
  origin.protocol = 'http:';
  if (origin.port === '443') origin.port = '';
  const baseUrl = origin.toString();
  const apiBase = '/api';
  const appBasePath = import.meta.env.BASE_URL || '/';
  const normalizedBasePath = appBasePath.endsWith('/') ? appBasePath : `${appBasePath}/`;
  const url = new URL(`${normalizedBasePath}document-credit-input.html`, baseUrl);
  url.searchParams.set('company', company || '');
  url.searchParams.set('apiBase', apiBase);
  url.protocol = 'http:';
  if (url.port === '443') url.port = '';
  return url.toString();
}

export async function sendCreditGoogleChatWebhook({ settings, company, query, requester, inputUrl }) {
  const webhookUrl = String(settings.creditGoogleChatWebhookUrl || '').trim();
  if (!webhookUrl) {
    throw new Error('문서-설정에 신용도 조회 Google Chat 웹훅 URL을 입력하세요.');
  }

  const requestedAt = formatKoreanDateTime();
  const companyName = company || query || '-';
  const text = hideCreditInputUrlLine(fillTemplate(
    settings.creditGoogleChatRequestTemplate || DEFAULT_INSPECTION_MAIL_SETTINGS.creditGoogleChatRequestTemplate,
    {
      requestedAt,
      requester: requester?.name || '-',
      requesterEmail: requester?.email || '',
      company: companyName,
      query: query || companyName,
      inputUrl: inputUrl || '',
    },
  ), inputUrl);

  let response;
  try {
    const payload = inputUrl ? {
      text,
      cardsV2: [{
        cardId: 'credit-input-link',
        card: {
          sections: [{
            widgets: [{
              buttonList: {
                buttons: [{
                  text: '신용도 입력',
                  onClick: {
                    openLink: {
                      url: inputUrl,
                    },
                  },
                }],
              },
            }],
          }],
        },
      }],
    } : { text };

    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error('Google Chat 웹훅 호출이 브라우저에서 차단되었거나 네트워크 오류입니다. 웹훅 URL을 확인하고, 계속 실패하면 서버 API 프록시가 필요합니다.');
  }

  if (!response.ok) {
    throw new Error(`Google Chat 웹훅 전송 실패 (${response.status})`);
  }

  return { status: 'sent', inputUrl };
}

export async function sendGoogleChatTestWebhook({ settings, requester }) {
  const webhookUrl = String(settings.creditGoogleChatWebhookUrl || '').trim();
  if (!webhookUrl) throw new Error('신용도 조회 Google Chat 웹훅 URL을 입력하세요.');

  const text = [
    '[문서 설정 테스트]',
    `요청일시: ${formatKoreanDateTime()}`,
    `요청자: ${requester?.name || '-'}`,
    String(settings.creditGoogleChatTestMessage || '').trim() || 'Google Chat 웹훅 연동 테스트입니다.',
  ].join('\n');

  let response;
  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    throw new Error('Google Chat 테스트 전송이 브라우저에서 차단되었거나 네트워크 오류입니다.');
  }

  if (!response.ok) throw new Error(`Google Chat 테스트 전송 실패 (${response.status})`);
  return { status: 'sent' };
}
