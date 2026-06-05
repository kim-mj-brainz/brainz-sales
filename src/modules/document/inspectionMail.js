export const DEFAULT_INSPECTION_MAIL_SETTINGS = {
  id: 'default',
  enabled: true,
  apiUrl: '',
  senderName: '',
  ccSales: true,
  creditGoogleChatWebhookUrl: '',
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
    engineer: recipient.name || '',
    engineerEmail: recipient.email || '',
    sales: data.salesName || '',
    salesEmail: data.salesEmail || '',
    itemCount: String(items.length),
    filename,
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

export async function sendInspectionMail({ settings, data, items, recipient, cc, blob, filename, documentNo }) {
  if (!settings.enabled) return { status: 'disabled' };
  if (!recipient.email) throw new Error('담당엔지니어 이메일이 없어 메일을 보낼 수 없습니다.');

  const context = buildContext({ data, items, recipient, filename, documentNo });
  const subject = fillTemplate(settings.subject, context);
  const body = fillTemplate(settings.body, context);
  const apiUrl = settings.apiUrl.trim();

  if (apiUrl) {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'inspection-confirmation',
        fromName: settings.senderName,
        to: [{ name: recipient.name, email: recipient.email }],
        cc,
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
          documentNo,
          itemCount: items.length,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`메일 API 발송 실패 (${response.status})`);
    }

    return { status: 'sent' };
  }

  const params = new URLSearchParams({ subject, body });
  if (cc?.length) params.set('cc', cc.map((item) => item.email).filter(Boolean).join(','));
  window.location.href = `mailto:${encodeURIComponent(recipient.email)}?${params.toString()}`;
  return { status: 'draft' };
}

export function buildCreditInputUrl({ company }) {
  const baseUrl = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://127.0.0.1:5173';
  const url = new URL('/document-credit-input.html', baseUrl);
  url.searchParams.set('company', company || '');
  return url.toString();
}

export async function sendCreditGoogleChatWebhook({ settings, company, query, requester, inputUrl }) {
  const webhookUrl = String(settings.creditGoogleChatWebhookUrl || '').trim();
  if (!webhookUrl) {
    throw new Error('문서-설정에 신용도 조회 Google Chat 웹훅 URL을 입력하세요.');
  }

  const requestedAt = formatKoreanDateTime();
  const companyName = company || query || '-';
  const text = [
    `요청일시: ${requestedAt}`,
    `요청자: ${requester?.name || '-'}`,
    `회사명: ${companyName}`,
    inputUrl ? `입력 URL: ${inputUrl}` : '',
  ].filter(Boolean).join('\n');

  let response;
  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    throw new Error('Google Chat 웹훅 호출이 브라우저에서 차단되었거나 네트워크 오류입니다. 웹훅 URL을 확인하고, 계속 실패하면 서버 API 프록시가 필요합니다.');
  }

  if (!response.ok) {
    throw new Error(`Google Chat 웹훅 전송 실패 (${response.status})`);
  }

  return { status: 'sent', inputUrl };
}
