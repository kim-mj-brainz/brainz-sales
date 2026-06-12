const http = require('http');
const net = require('net');
const tls = require('tls');

const PORT = Number(process.env.DOCUMENT_MAIL_API_PORT || 5174);
const HOST = process.env.DOCUMENT_MAIL_API_HOST || '127.0.0.1';
const MAX_BODY_SIZE = 20 * 1024 * 1024;

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error('요청 본문이 너무 큽니다.'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function encodeHeader(value) {
  const text = String(value || '');
  if (!/[^\x20-\x7E]/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function formatAddress(address) {
  const email = String(address?.email || '').trim();
  const name = String(address?.name || '').trim();
  if (!email) return '';
  return name ? `${encodeHeader(name)} <${email}>` : email;
}

function wrapBase64(value) {
  return String(value || '').replace(/(.{76})/g, '$1\r\n');
}

function makeMimeMessage(payload) {
  const to = (payload.to || []).map(formatAddress).filter(Boolean);
  const cc = (payload.cc || []).map(formatAddress).filter(Boolean);
  const smtp = payload.smtp || {};
  const fromEmail = smtp.fromEmail || smtp.user;
  const from = formatAddress({ name: payload.fromName, email: fromEmail });
  const attachments = payload.attachments || [];
  const headers = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    cc.length ? `Cc: ${cc.join(', ')}` : '',
    `Subject: ${encodeHeader(payload.subject || '')}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
  ].filter(Boolean);

  if (!attachments.length) {
    return [
      ...headers,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(Buffer.from(payload.body || '', 'utf8').toString('base64')),
      '',
    ].join('\r\n');
  }

  const boundary = `brainz-document-${Date.now().toString(36)}`;
  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(payload.body || '', 'utf8').toString('base64')),
  ];

  attachments.forEach((attachment) => {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.contentType || 'application/octet-stream'}; name="${attachment.filename || 'attachment'}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.filename || 'attachment'}"`,
      '',
      wrapBase64(attachment.contentBase64 || ''),
    );
  });
  parts.push(`--${boundary}--`, '');
  return parts.join('\r\n');
}

function parseStatus(response) {
  const code = Number(String(response || '').slice(0, 3));
  return { code, text: String(response || '').trim() };
}

async function sendSmtpCommand(state, command, expectedCodes) {
  if (command !== null) state.socket.write(`${command}\r\n`);
  const response = await state.readResponse();
  const status = parseStatus(response);
  if (!expectedCodes.includes(status.code)) {
    throw new Error(`SMTP 응답 오류 (${status.text})`);
  }
  return status;
}

function attachSocket(state, socket) {
  state.socket = socket;
  state.buffer = '';
  state.waiters = [];
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    state.buffer += chunk;
    const lines = state.buffer.split(/\r?\n/);
    const complete = lines.some((line) => /^\d{3} /.test(line));
    if (!complete || !state.waiters.length) return;
    const response = state.buffer;
    state.buffer = '';
    const waiter = state.waiters.shift();
    waiter.resolve(response);
  });
}

function connectSocket(smtp) {
  return new Promise((resolve, reject) => {
    const socket = smtp.secure
      ? tls.connect({ host: smtp.host, port: smtp.port, servername: smtp.host })
      : net.connect({ host: smtp.host, port: smtp.port });
    socket.once(smtp.secure ? 'secureConnect' : 'connect', () => resolve(socket));
    socket.once('error', reject);
    socket.setTimeout(30000, () => {
      socket.destroy();
      reject(new Error('SMTP 서버 연결 시간이 초과되었습니다.'));
    });
  });
}

function upgradeToTls(state, smtp) {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({ socket: state.socket, servername: smtp.host });
    secureSocket.once('secureConnect', () => {
      attachSocket(state, secureSocket);
      resolve();
    });
    secureSocket.once('error', reject);
  });
}

async function sendMail(payload) {
  const smtp = payload.smtp || {};
  if (!smtp.host) throw new Error('SMTP Host가 없습니다.');
  if (!smtp.port) smtp.port = smtp.secure ? 465 : 587;
  if (!smtp.user) throw new Error('SMTP 계정이 없습니다.');
  if (!smtp.password) throw new Error('SMTP 비밀번호가 없습니다.');

  const recipients = [...(payload.to || []), ...(payload.cc || [])]
    .map((item) => String(item.email || '').trim())
    .filter(Boolean);
  if (!recipients.length) throw new Error('수신자가 없습니다.');

  const state = {
    socket: null,
    buffer: '',
    waiters: [],
    readResponse() {
      return new Promise((resolve, reject) => {
        this.waiters.push({ resolve, reject });
      });
    },
  };

  const socket = await connectSocket(smtp);
  attachSocket(state, socket);

  try {
    await sendSmtpCommand(state, null, [220]);
    await sendSmtpCommand(state, 'EHLO localhost', [250]);
    if (!smtp.secure) {
      await sendSmtpCommand(state, 'STARTTLS', [220]);
      await upgradeToTls(state, smtp);
      await sendSmtpCommand(state, 'EHLO localhost', [250]);
    }
    await sendSmtpCommand(state, 'AUTH LOGIN', [334]);
    await sendSmtpCommand(state, Buffer.from(smtp.user, 'utf8').toString('base64'), [334]);
    await sendSmtpCommand(state, Buffer.from(smtp.password, 'utf8').toString('base64'), [235]);
    await sendSmtpCommand(state, `MAIL FROM:<${smtp.fromEmail || smtp.user}>`, [250]);
    for (const recipient of recipients) {
      await sendSmtpCommand(state, `RCPT TO:<${recipient}>`, [250, 251]);
    }
    await sendSmtpCommand(state, 'DATA', [354]);
    const message = makeMimeMessage(payload).replace(/^\./gm, '..');
    await sendSmtpCommand(state, `${message}\r\n.`, [250]);
    await sendSmtpCommand(state, 'QUIT', [221]);
  } finally {
    state.socket?.end();
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === 'GET' && request.url === '/api/document-mails/health') {
    sendJson(response, 200, { ok: true, service: 'document-mail-api' });
    return;
  }

  if (request.method !== 'POST' || request.url !== '/api/document-mails/inspection') {
    sendJson(response, 404, { ok: false, error: 'NOT_FOUND' });
    return;
  }

  try {
    const payload = JSON.parse(await readBody(request) || '{}');
    await sendMail(payload);
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message || '메일 발송에 실패했습니다.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Document mail API: http://${HOST}:${PORT}/api/document-mails/inspection`);
});
