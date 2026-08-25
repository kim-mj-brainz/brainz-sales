import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const documentPdfWorkerPath = fileURLToPath(new URL('../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'brainz_sales',
  waitForConnections: true,
  connectionLimit: 10,
});

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function boolToDb(value, defaultValue = true) {
  if (value == null) return defaultValue ? 1 : 0;
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

function boolFromDb(value, defaultValue = true) {
  if (value == null) return defaultValue;
  return value === true || value === 1 || value === '1';
}

function itemId(item, prefix = 'id') {
  return String(item?.id || item?.employeeNo || `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`);
}

function stringify(item) {
  return JSON.stringify(item || {});
}

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function assertUniqueEmployeeNos(items) {
  const seen = new Set();
  for (const item of asArray(items)) {
    const employeeNo = String(item?.employeeNo || item?.id || '').trim();
    if (!employeeNo) throw httpError('사번은 필수입니다.');
    if (seen.has(employeeNo)) throw httpError(`이미 등록된 사번입니다: ${employeeNo}`);
    seen.add(employeeNo);
  }
}

function normalizeUsers(items) {
  const seen = new Set();
  return asArray(items).reduce((list, item) => {
    const employeeNo = String(item?.employeeNo || item?.id || '').trim();
    if (!employeeNo || seen.has(employeeNo)) return list;
    seen.add(employeeNo);
    list.push({ ...item, id: employeeNo, employeeNo });
    return list;
  }, []);
}

async function init() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS collections (
      col_key    VARCHAR(100) PRIMARY KEY,
      data       LONGTEXT     NOT NULL,
      updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS document_credit_requests (
      id VARCHAR(80) PRIMARY KEY,
      company VARCHAR(255) NOT NULL,
      requester_name VARCHAR(100),
      requester_email VARCHAR(255),
      input_url TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      completed_at DATETIME,
      result_json JSON,
      raw_json JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('DB connected and table routing ready');
}

async function loadCollectionFallback(key) {
  const [rows] = await pool.execute('SELECT data FROM collections WHERE col_key = ?', [key]);
  if (!rows.length) return null;
  return parseJson(rows[0].data, null);
}

async function emptyRowsFallback(key) {
  const fallback = await loadCollectionFallback(key);
  return fallback == null ? [] : fallback;
}

async function saveCollectionFallback(key, data) {
  await pool.execute(
    `INSERT INTO collections (col_key, data) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE data = VALUES(data)`,
    [key, JSON.stringify(data)],
  );
}

async function deleteCollectionFallback(key) {
  await pool.execute('DELETE FROM collections WHERE col_key = ?', [key]);
}

async function replaceRows(conn, deleteSql, items, insertItem, fallbackKey = null) {
  await conn.beginTransaction();
  try {
    await conn.execute(deleteSql);
    for (const item of items) {
      await insertItem(conn, item);
    }
    if (fallbackKey) {
      await conn.execute(
        `INSERT INTO collections (col_key, data) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE data = VALUES(data)`,
        [fallbackKey, JSON.stringify(items)],
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }
}

async function getRawJsonList(key, table, orderBy = 'created_at DESC') {
  const [rows] = await pool.query(`SELECT raw_json FROM ${table} ORDER BY ${orderBy}`);
  if (!rows.length) return emptyRowsFallback(key);
  return rows.map((row) => parseJson(row.raw_json, {}));
}

async function clearTable(table) {
  await pool.query(`DELETE FROM ${table}`);
}

function formatKoreanDateTime(date = new Date()) {
  const hours = date.getHours();
  const period = hours < 12 ? '오전' : '오후';
  const displayHours = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}. ${period} ${displayHours}:${minutes}:${seconds}`;
}

async function syncCreditsFallback(conn) {
  const [rows] = await conn.execute('SELECT id, company, grade, expire_month, address, ceo_name, requested_by, raw_json FROM credits ORDER BY company');
  const items = rows.map((row) => ({
    ...parseJson(row.raw_json, {}),
    id: row.id,
    company: row.company,
    grade: row.grade || '',
    expireMonth: row.expire_month || '',
    address: row.address || '',
    ceo: row.ceo_name || '',
    ceoName: row.ceo_name || '',
    requestedBy: row.requested_by || '',
  }));
  await conn.execute(
    `INSERT INTO collections (col_key, data) VALUES ('credits', ?)
     ON DUPLICATE KEY UPDATE data = VALUES(data)`,
    [JSON.stringify(items)],
  );
}

async function upsertCredit(conn, credit) {
  const company = String(credit?.company || '').trim();
  if (!company) throw httpError('회사명은 필수입니다.');

  const requestedId = String(credit?.id || '').trim();
  let existingId = '';
  if (requestedId) {
    const [byId] = await conn.execute('SELECT id FROM credits WHERE id = ? LIMIT 1', [requestedId]);
    existingId = byId[0]?.id || '';
  }
  if (!existingId) {
    const [byCompany] = await conn.execute('SELECT id FROM credits WHERE company = ? LIMIT 1', [company]);
    existingId = byCompany[0]?.id || '';
  }

  const id = existingId || requestedId || itemId(credit, 'CREDIT');
  const normalized = {
    ...credit,
    id,
    company,
    grade: credit?.grade || '',
    expireMonth: credit?.expireMonth || credit?.expiryMonth || '',
    address: credit?.address || '',
    ceo: credit?.ceoName || credit?.ceo || '',
    ceoName: credit?.ceoName || credit?.ceo || '',
    requestedBy: credit?.requestedBy || '',
  };

  if (existingId) {
    await conn.execute(
      `UPDATE credits
       SET company = ?, grade = ?, expire_month = ?, address = ?, ceo_name = ?, requested_by = ?, raw_json = ?
       WHERE id = ?`,
      [
        normalized.company,
        normalized.grade,
        normalized.expireMonth,
        normalized.address,
        normalized.ceoName,
        normalized.requestedBy,
        stringify(normalized),
        id,
      ],
    );
  } else {
    await conn.execute(
      `INSERT INTO credits
       (id, company, grade, expire_month, address, ceo_name, requested_by, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        normalized.company,
        normalized.grade,
        normalized.expireMonth,
        normalized.address,
        normalized.ceoName,
        normalized.requestedBy,
        stringify(normalized),
      ],
    );
  }

  await syncCreditsFallback(conn);
  return normalized;
}

async function getDocumentMailSettings() {
  const [rows] = await pool.execute('SELECT * FROM document_mail_settings ORDER BY id LIMIT 1');
  const row = rows[0];
  if (!row) return {};
  const raw = parseJson(row.raw_json, {});
  return {
    ...raw,
    creditGoogleChatWebhookUrl: raw.creditGoogleChatWebhookUrl ?? row.credit_google_chat_webhook_url ?? '',
  };
}

async function sendCreditCompletedChat({ request, credit }) {
  const settings = await getDocumentMailSettings();
  const webhookUrl = String(settings.creditGoogleChatWebhookUrl || '').trim();
  if (!webhookUrl) return { sent: false, reason: 'NO_WEBHOOK' };

  const lines = [
    '[신용도 조회 처리완료]',
    `처리일시: ${formatKoreanDateTime()}`,
    `요청자: ${request.requester_name || '-'}`,
    `회사명: ${credit.company || request.company || '-'}`,
    `신용등급: ${credit.grade || '-'}`,
    `만료월: ${credit.expireMonth || '-'}`,
  ];

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ text: lines.join('\n') }),
  });
  if (!response.ok) return { sent: false, reason: `HTTP_${response.status}` };
  return { sent: true };
}

const handlers = {
  async usersGet() {
    const [rows] = await pool.execute(`
      SELECT id, employee_no, name, team, email, phone, role, active, password, raw_json
      FROM users
      ORDER BY employee_no
    `);
    if (!rows.length) return normalizeUsers(await emptyRowsFallback('users'));
    return rows.map((row) => {
      const raw = parseJson(row.raw_json, {});
      return {
        ...raw,
        id: raw.id || row.id,
        employeeNo: raw.employeeNo || row.employee_no,
        name: raw.name || row.name,
        team: raw.team ?? row.team ?? '',
        email: raw.email ?? row.email ?? '',
        phone: raw.phone ?? row.phone ?? '',
        role: raw.role || row.role || 'USER',
        active: raw.active ?? boolFromDb(row.active, true),
        password: raw.password ?? row.password ?? '1234',
      };
    });
  },

  async usersPut(items) {
    const userItems = asArray(items);
    assertUniqueEmployeeNos(userItems);
    const conn = await pool.getConnection();
    try {
      await replaceRows(conn, 'DELETE FROM users', userItems, async (tx, item) => {
        const employeeNo = String(item.employeeNo || item.id || '').trim();
        const id = employeeNo;
        await tx.execute(
          `INSERT INTO users
           (id, employee_no, name, team, email, phone, role, active, password, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            employeeNo,
            item.name || '',
            item.team || '',
            item.email || '',
            item.phone || '',
            item.role || 'USER',
            boolToDb(item.active, true),
            item.password || '1234',
            stringify({ ...item, id, employeeNo }),
          ],
        );
      });
    } finally {
      conn.release();
    }
  },

  async incallsGet() {
    return getRawJsonList('incalls', 'incalls');
  },

  async incallsPut(items) {
    const conn = await pool.getConnection();
    try {
      const nextItems = asArray(items);
      await replaceRows(conn, 'DELETE FROM incalls', nextItems, async (tx, item) => {
        const id = itemId(item, 'INC');
        await tx.execute(
          `INSERT INTO incalls
           (id, customer, project, sales_person, sales_email, sales_code, status, memo, owner_id, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            item.customer || item.company || '',
            item.project || item.title || '',
            item.salesPerson || item.sales || item.assignee || '',
            item.salesEmail || item.assigneeEmail || '',
            item.salesCode || '',
            item.status || '',
            item.memo || item.note || '',
            item.ownerId || '',
            stringify({ ...item, id }),
          ],
        );
      }, 'incalls');
    } finally {
      conn.release();
    }
  },

  async referencesGet() {
    return getRawJsonList('references', '`references`');
  },

  async referencesPut(items) {
    const conn = await pool.getConnection();
    try {
      await replaceRows(conn, 'DELETE FROM `references`', asArray(items), async (tx, item) => {
        const id = itemId(item, 'REF');
        await tx.execute(
          `INSERT INTO \`references\`
           (id, customer, project, product, sales_code, inspection_status, inspection_completed_at, owner_id, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            item.customer || item.company || '',
            item.project || item.projectName || '',
            item.product || item.productName || '',
            item.salesCode || '',
            item.inspectionStatus || item.inspection || '',
            item.inspectionCompletedAt || null,
            item.ownerId || '',
            stringify({ ...item, id }),
          ],
        );
      });
    } finally {
      conn.release();
    }
  },

  async docsGet() {
    return getRawJsonList('docs', 'documents');
  },

  async docsPut(items) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM document_items');
      await conn.execute('DELETE FROM documents');
      for (const item of asArray(items)) {
        const id = itemId(item, 'DOC');
        await conn.execute(
          `INSERT INTO documents
           (id, document_no, quote_no, customer, address, project, issue_date, sales_code, seq,
            status, fail_reason, error_id, owner_id, sales_name, sales_phone, sales_email,
            engineer_name, engineer_phone, engineer_email, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            item.documentNo || '',
            item.quoteNo || '',
            item.customer || '',
            item.address || '',
            item.project || '',
            item.issueDate || null,
            item.salesCode || '',
            item.seq || '',
            item.status || '',
            item.failReason || '',
            item.errorId || '',
            item.ownerId || '',
            item.salesName || item.sales || '',
            item.salesPhone || '',
            item.salesEmail || '',
            item.engineerName || item.engineer || '',
            item.engineerPhone || '',
            item.engineerEmail || '',
            stringify({ ...item, id }),
          ],
        );
        for (const [index, docItem] of asArray(item.items).entries()) {
          await conn.execute(
            `INSERT INTO document_items
             (document_id, item_no, description, qty, unit, raw_json)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              id,
              index + 1,
              docItem.description || docItem.item || '',
              Number(docItem.qty || 0),
              docItem.unit || 'EA',
              stringify(docItem),
            ],
          );
        }
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },

  async documentStaffGet() {
    const [rows] = await pool.execute('SELECT id, name, phone, email, role, raw_json FROM document_staff ORDER BY name');
    if (!rows.length) return emptyRowsFallback('documentStaff');
    return rows.map((row) => ({
      ...parseJson(row.raw_json, {}),
      id: row.id,
      name: row.name,
      phone: row.phone || '',
      email: row.email || '',
      role: row.role || '',
    }));
  },

  async documentStaffPut(items) {
    const conn = await pool.getConnection();
    try {
      await replaceRows(conn, 'DELETE FROM document_staff', asArray(items), async (tx, item) => {
        const id = itemId(item, item.role === '엔지니어' ? 'ENG' : 'SALES');
        await tx.execute(
          `INSERT INTO document_staff
           (id, name, phone, email, role, raw_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, item.name || '', item.phone || '', item.email || '', item.role || '', stringify({ ...item, id })],
        );
      });
    } finally {
      conn.release();
    }
  },

  async documentCustomersGet() {
    const [rows] = await pool.execute('SELECT id, company, address, raw_json FROM document_customers ORDER BY company');
    if (!rows.length) return emptyRowsFallback('documentCustomers');
    return rows.map((row) => ({
      ...parseJson(row.raw_json, {}),
      id: row.id,
      company: row.company,
      address: row.address || '',
    }));
  },

  async documentCustomersPut(items) {
    const conn = await pool.getConnection();
    try {
      const nextItems = asArray(items);
      await replaceRows(conn, 'DELETE FROM document_customers', nextItems, async (tx, item) => {
        const id = itemId(item, 'CUST');
        await tx.execute(
          `INSERT INTO document_customers
           (id, company, address, raw_json)
           VALUES (?, ?, ?, ?)`,
          [id, item.company || item.customer || '', item.address || '', stringify({ ...item, id })],
        );
      }, 'documentCustomers');
    } finally {
      conn.release();
    }
  },

  async documentMailSettingsGet() {
    const [rows] = await pool.execute('SELECT * FROM document_mail_settings ORDER BY id');
    if (!rows.length) return emptyRowsFallback('documentMailSettings');
    return rows.map((row) => {
      const raw = parseJson(row.raw_json, {});
      return {
        ...raw,
        id: raw.id || row.id,
        enabled: raw.enabled ?? boolFromDb(row.enabled, true),
        senderName: raw.senderName ?? row.sender_name ?? '',
        ccSales: raw.ccSales ?? boolFromDb(row.cc_sales, true),
        smtpEnabled: raw.smtpEnabled ?? boolFromDb(row.smtp_enabled, false),
        smtpHost: raw.smtpHost ?? row.smtp_host ?? '',
        smtpPort: raw.smtpPort ?? row.smtp_port ?? '',
        smtpSecure: raw.smtpSecure ?? boolFromDb(row.smtp_secure, false),
        smtpUser: raw.smtpUser ?? row.smtp_user ?? '',
        smtpPassword: raw.smtpPassword ?? row.smtp_password ?? '',
        smtpFromEmail: raw.smtpFromEmail ?? row.smtp_from_email ?? '',
        smtpTestEmail: raw.smtpTestEmail ?? row.smtp_test_email ?? '',
        creditGoogleChatWebhookUrl: raw.creditGoogleChatWebhookUrl ?? row.credit_google_chat_webhook_url ?? '',
        creditGoogleChatRequestTemplate: raw.creditGoogleChatRequestTemplate ?? row.credit_google_chat_request_template ?? '',
        creditGoogleChatTestMessage: raw.creditGoogleChatTestMessage ?? row.credit_google_chat_test_message ?? '',
        subject: raw.subject ?? row.subject ?? '',
        body: raw.body ?? row.body ?? '',
      };
    });
  },

  async documentMailSettingsPut(items) {
    const conn = await pool.getConnection();
    try {
      await replaceRows(conn, 'DELETE FROM document_mail_settings', asArray(items), async (tx, item) => {
        const id = itemId(item, 'MAIL');
        await tx.execute(
          `INSERT INTO document_mail_settings
           (id, enabled, sender_name, cc_sales, smtp_enabled, smtp_host, smtp_port, smtp_secure,
            smtp_user, smtp_password, smtp_from_email, smtp_test_email, credit_google_chat_webhook_url,
            credit_google_chat_request_template, credit_google_chat_test_message, subject, body, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            boolToDb(item.enabled, true),
            item.senderName || '',
            boolToDb(item.ccSales, true),
            boolToDb(item.smtpEnabled, false),
            item.smtpHost || '',
            item.smtpPort || '',
            boolToDb(item.smtpSecure, false),
            item.smtpUser || '',
            item.smtpPassword || '',
            item.smtpFromEmail || '',
            item.smtpTestEmail || '',
            item.creditGoogleChatWebhookUrl || '',
            item.creditGoogleChatRequestTemplate || '',
            item.creditGoogleChatTestMessage || '',
            item.subject || '',
            item.body || '',
            stringify({ ...item, id }),
          ],
        );
      });
    } finally {
      conn.release();
    }
  },

  async creditsGet() {
    const [rows] = await pool.execute('SELECT id, company, grade, expire_month, address, ceo_name, requested_by, raw_json FROM credits ORDER BY company');
    if (!rows.length) return emptyRowsFallback('credits');
    return rows.map((row) => ({
      ...parseJson(row.raw_json, {}),
      id: row.id,
      company: row.company,
      grade: row.grade || '',
      expireMonth: row.expire_month || '',
      address: row.address || '',
      ceoName: row.ceo_name || '',
      requestedBy: row.requested_by || '',
    }));
  },

  async creditsPut(items) {
    const conn = await pool.getConnection();
    try {
      const nextItems = asArray(items);
      await replaceRows(conn, 'DELETE FROM credits', nextItems, async (tx, item) => {
        const id = itemId(item, 'CREDIT');
        await tx.execute(
          `INSERT INTO credits
           (id, company, grade, expire_month, address, ceo_name, requested_by, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            item.company || '',
            item.grade || '',
            item.expireMonth || item.expiryMonth || '',
            item.address || '',
            item.ceoName || item.ceo || '',
            item.requestedBy || '',
            stringify({ ...item, id }),
          ],
        );
      }, 'credits');
    } finally {
      conn.release();
    }
  },

  async auditLogsGet() {
    return getRawJsonList('auditLogs', 'audit_logs', 'created_at DESC');
  },

  async auditLogsPut(items) {
    const conn = await pool.getConnection();
    try {
      await replaceRows(conn, 'DELETE FROM audit_logs', asArray(items), async (tx, item) => {
        const id = itemId(item, 'AUDIT');
        await tx.execute(
          `INSERT INTO audit_logs
           (id, event_time, actor_employee_no, actor_name, actor_role, category, event_type,
            target_type, target_id, target_name, result, fail_reason, extra, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            item.eventTime || null,
            item.actorEmployeeNo || '',
            item.actorName || '',
            item.actorRole || '',
            item.category || '',
            item.eventType || '',
            item.targetType || '',
            item.targetId || '',
            item.targetName || '',
            item.result || '',
            item.failReason || '',
            stringify(item.extra || {}),
            stringify({ ...item, id }),
          ],
        );
      });
    } finally {
      conn.release();
    }
  },
};

const keyMap = {
  users: { get: handlers.usersGet, put: handlers.usersPut, clear: () => clearTable('users') },
  incalls: { get: handlers.incallsGet, put: handlers.incallsPut, clear: () => clearTable('incalls') },
  references: { get: handlers.referencesGet, put: handlers.referencesPut, clear: () => clearTable('`references`') },
  docs: { get: handlers.docsGet, put: handlers.docsPut, clear: async () => { await clearTable('document_items'); await clearTable('documents'); } },
  documentStaff: { get: handlers.documentStaffGet, put: handlers.documentStaffPut, clear: () => clearTable('document_staff') },
  documentCustomers: { get: handlers.documentCustomersGet, put: handlers.documentCustomersPut, clear: () => clearTable('document_customers') },
  documentMailSettings: { get: handlers.documentMailSettingsGet, put: handlers.documentMailSettingsPut, clear: () => clearTable('document_mail_settings') },
  credits: { get: handlers.creditsGet, put: handlers.creditsPut, clear: () => clearTable('credits') },
  auditLogs: { get: handlers.auditLogsGet, put: handlers.auditLogsPut, clear: () => clearTable('audit_logs') },
};

app.post('/api/document-credit-requests', async (req, res) => {
  try {
    const id = String(req.body?.id || '').trim();
    const company = String(req.body?.company || '').trim();
    if (!id) throw httpError('요청 ID는 필수입니다.');
    if (!company) throw httpError('회사명은 필수입니다.');

    const raw = {
      id,
      company,
      requesterName: req.body?.requesterName || '',
      requesterEmail: req.body?.requesterEmail || '',
      inputUrl: req.body?.inputUrl || '',
    };
    await pool.execute(
      `INSERT INTO document_credit_requests
       (id, company, requester_name, requester_email, input_url, status, raw_json)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
       ON DUPLICATE KEY UPDATE
         company = VALUES(company),
         requester_name = VALUES(requester_name),
         requester_email = VALUES(requester_email),
         input_url = VALUES(input_url),
         raw_json = VALUES(raw_json)`,
      [id, company, raw.requesterName, raw.requesterEmail, raw.inputUrl, stringify(raw)],
    );
    res.json({ ok: true, id, status: 'PENDING' });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/api/document-credit-requests/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, company, requester_name, requester_email, input_url, status, completed_at, result_json
       FROM document_credit_requests WHERE id = ?`,
      [req.params.id],
    );
    const row = rows[0];
    if (!row) throw httpError('신용도 조회 요청을 찾을 수 없습니다.', 404);
    res.json({
      id: row.id,
      company: row.company,
      requesterName: row.requester_name || '',
      requesterEmail: row.requester_email || '',
      inputUrl: row.input_url || '',
      status: row.status,
      completedAt: row.completed_at,
      result: parseJson(row.result_json, null),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post('/api/document-credit-requests/:id/complete', async (req, res) => {
  const conn = await pool.getConnection();
  let request = null;
  let savedCredit = null;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT id, company, requester_name, requester_email, status
       FROM document_credit_requests WHERE id = ? FOR UPDATE`,
      [req.params.id],
    );
    request = rows[0];
    if (!request) throw httpError('신용도 조회 요청을 찾을 수 없습니다.', 404);
    if (request.status === 'COMPLETED') throw httpError('이미 처리된 신용도 조회 요청입니다.', 409);

    savedCredit = await upsertCredit(conn, {
      ...(req.body?.credit || {}),
      company: req.body?.credit?.company || request.company,
      requestedBy: request.requester_name || req.body?.credit?.requestedBy || '',
      updatedAt: new Date().toISOString(),
    });

    await conn.execute(
      `UPDATE document_credit_requests
       SET status = 'COMPLETED', completed_at = NOW(), result_json = ?
       WHERE id = ?`,
      [stringify(savedCredit), request.id],
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    res.status(error.statusCode || 500).json({ error: error.message });
    conn.release();
    return;
  }
  conn.release();

  let chat = { sent: false };
  try {
    chat = await sendCreditCompletedChat({ request, credit: savedCredit });
  } catch (error) {
    chat = { sent: false, reason: error.message };
  }

  res.json({ ok: true, status: 'COMPLETED', item: savedCredit, chat });
});

/* 거래처관리 화면 전용 페이징 조회 (10개씩) */
app.get('/api/credits/page', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
    const q = String(req.query.q || '').trim();
    const offset = (page - 1) * pageSize;
    const where = q ? "WHERE CONCAT_WS('', company, ceo_name, grade, expire_month) LIKE ?" : '';
    const params = q ? [`%${q}%`] : [];

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM credits ${where}`, params);
    const total = countRows[0]?.total || 0;
    const [rows] = await pool.query(
      `SELECT id, company, grade, expire_month, address, ceo_name, requested_by, raw_json
       FROM credits ${where}
       ORDER BY company
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    res.json({
      items: rows.map((row) => ({
        ...parseJson(row.raw_json, {}),
        id: row.id,
        company: row.company,
        grade: row.grade || '',
        expireMonth: row.expire_month || '',
        address: row.address || '',
        ceoName: row.ceo_name || '',
        requestedBy: row.requested_by || '',
      })),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/api/document-customers/page', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
    const offset = (page - 1) * pageSize;

    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM document_customers');
    const total = countRows[0]?.total || 0;
    const [rows] = await pool.query(
      `SELECT id, company, address, raw_json
       FROM document_customers
       ORDER BY company
       LIMIT ? OFFSET ?`,
      [pageSize, offset],
    );

    res.json({
      items: rows.map((row) => ({
        ...parseJson(row.raw_json, {}),
        id: row.id,
        company: row.company,
        address: row.address || '',
      })),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/* =============================================================
   조달(G2B) 나라장터 조달실적 수집기
   PRD 검증 완료 로직: 총액계약 제외, 모든 변경이력 그대로 합산(최종차수만
   남기지 않음), 자연키는 (cntrctDlvrReqNo, cntrctDlvrReqChgOrd, prdctSno).
   ============================================================= */
const G2B_DEFAULT_BASE_URL = 'https://apis.data.go.kr/1230000/at/ShoppingMallPrdctInfoService/getSpcifyPrdlstPrcureInfoList';
const g2bCollectStatus = { running: false, lastRunAt: null, lastResult: null, progress: null };

function toItemArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseG2BResponse(text) {
  const trimmed = String(text || '').trim();
  const parsed = trimmed.startsWith('<')
    ? new XMLParser({ ignoreAttributes: true }).parse(trimmed)
    : JSON.parse(trimmed);
  /* 공공데이터포털 공통 오류 응답(예: 호출 한도 초과)은 정상 응답과 완전히
     다른 형식(OpenAPI_ServiceResponse.cmmMsgHeader)으로 내려온다. 이를
     구분하지 않으면 header.resultCode가 undefined → '00'(성공)으로 오인되어
     오류가 조용히 "0건 수집"으로 처리된다. */
  if (parsed.OpenAPI_ServiceResponse) {
    const msg = parsed.OpenAPI_ServiceResponse.cmmMsgHeader || {};
    const header = {
      resultCode: String(msg.returnReasonCode || '99'),
      resultMsg: msg.returnAuthMsg || msg.errMsg || 'OpenAPI 서비스 오류',
    };
    return { header, items: [], totalCount: 0 };
  }
  const response = parsed.response || parsed;
  const header = response.header || {};
  const body = response.body || {};
  const items = toItemArray(body.items?.item ?? body.items ?? []);
  return { header, items, totalCount: Number(body.totalCount || 0) };
}

/* 실제 응답(raw_json) 대조로 확인된 필드명 (2026-08-24 검증). 금액/수량은
   증감액(incdecAmt/incdecQty)을 합산한다 — 취소/정정된 이력의 취소 전
   스냅샷 금액이 중복 집계되지 않고, 내부 매출 집계 방식과도 일치한다.
   (2026-08-25: prdctAmt 스냅샷 그대로 합산하는 방식을 검토했으나, 취소
   건의 취소 전 금액까지 포함되는 문제가 있어 증감액 방식으로 최종 확정) */
function parseG2BDate(value) {
  const m = String(value || '').trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function mapG2BItem(item) {
  return {
    dlvrReqNo: String(item.cntrctDlvrReqNo ?? '').trim(),
    dlvrReqChgCha: String(item.cntrctDlvrReqChgOrd ?? '0').trim(),
    prdctSno: String(item.prdctSno ?? '').trim(),
    dcisnDt: parseG2BDate(item.cntrctDlvrReqDate),
    corpNm: item.corpNm || '',
    corpBizNo: item.bizno || '',
    prdctIdntNo: item.prdctIdntNo || '',
    prdctClsfcNm: item.prdctClsfcNoNm || '',
    dtlPrdctNm: item.prdctIdntNoNm || item.dtilPrdctClsfcNoNm || '',
    dmndInsttNm: item.dminsttNm || '',
    dlvrAmt: Number(item.incdecAmt || 0),
    dlvrQty: Number(item.incdecQty || 0),
    contractNo: item.uprcCntrctNo || '',
    cntrctDlvrDivNm: item.cntrctDlvrDivNm || '',
    raw: item,
  };
}

async function upsertG2BRecord(rec) {
  if (!rec.dlvrReqNo || !rec.prdctSno) return false;
  await pool.execute(
    `INSERT INTO g2b_procurement_records
     (dlvr_req_no, dlvr_req_chg_cha, prdct_sno, dcisn_dt, corp_nm, corp_biz_no, prdct_idnt_no,
      prdct_clsfc_nm, dtl_prdct_nm, dmnd_instt_nm, dlvr_amt, dlvr_qty, contract_no, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       dcisn_dt = VALUES(dcisn_dt), corp_nm = VALUES(corp_nm), corp_biz_no = VALUES(corp_biz_no),
       prdct_idnt_no = VALUES(prdct_idnt_no), prdct_clsfc_nm = VALUES(prdct_clsfc_nm),
       dtl_prdct_nm = VALUES(dtl_prdct_nm), dmnd_instt_nm = VALUES(dmnd_instt_nm),
       dlvr_amt = VALUES(dlvr_amt), dlvr_qty = VALUES(dlvr_qty), contract_no = VALUES(contract_no),
       raw_json = VALUES(raw_json)`,
    [
      rec.dlvrReqNo, rec.dlvrReqChgCha, rec.prdctSno, rec.dcisnDt, rec.corpNm, rec.corpBizNo,
      rec.prdctIdntNo, rec.prdctClsfcNm, rec.dtlPrdctNm, rec.dmndInsttNm, rec.dlvrAmt, rec.dlvrQty,
      rec.contractNo, stringify(rec.raw),
    ],
  );
  return true;
}

async function fetchG2BPage({ baseUrl, serviceKey, dtilPrdctClsfcNo, inqryBgnDate, inqryEndDate, pageNo, numOfRows }) {
  const params = new URLSearchParams({
    serviceKey,
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
    inqryDiv: '1',
    inqryBgnDate,
    inqryEndDate,
    inqryPrdctDiv: '2',
    dtilPrdctClsfcNo,
    type: 'json',
  });
  const res = await fetch(`${baseUrl}?${params.toString()}`);
  return parseG2BResponse(await res.text());
}

function formatYYYYMMDD(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

/* 최대 12개월 제한을 넘는 기간은 연 단위로 쪼갬 */
function chunkDateRangeByYear(startDate, endDate) {
  const chunks = [];
  let cursor = new Date(startDate);
  const end = new Date(endDate);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setFullYear(chunkEnd.getFullYear() + 1);
    chunkEnd.setDate(chunkEnd.getDate() - 1);
    const actualEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({ start: formatYYYYMMDD(cursor), end: formatYYYYMMDD(actualEnd) });
    cursor = new Date(actualEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
}

async function runG2BCollection({ startDate, endDate }) {
  g2bCollectStatus.running = true;
  const result = { processed: 0, upserted: 0, excluded: 0, errors: [], byCode: {} };
  g2bCollectStatus.progress = {
    totalCodes: 0, codeIndex: 0, currentCode: null, currentRange: null,
    processed: 0, upserted: 0, excluded: 0,
  };
  try {
    const [settingsRows] = await pool.execute(
      'SELECT service_key, base_url, dtl_prdct_nos FROM g2b_settings WHERE id = ? LIMIT 1',
      ['default'],
    );
    const settings = settingsRows[0];
    const serviceKey = settings?.service_key;
    const baseUrl = settings?.base_url || G2B_DEFAULT_BASE_URL;
    const codes = asArray(parseJson(settings?.dtl_prdct_nos, []));

    if (!serviceKey) throw httpError('SERVICE_KEY가 설정되지 않았습니다. 조달(G2B)-설정에서 먼저 등록하세요.');
    if (!codes.length) throw httpError('세부품명번호가 설정되지 않았습니다. 조달(G2B)-설정에서 먼저 등록하세요.');

    const dateChunks = chunkDateRangeByYear(startDate, endDate);
    g2bCollectStatus.progress.totalCodes = codes.length;

    for (const [codeIndex, code] of codes.entries()) {
      g2bCollectStatus.progress.codeIndex = codeIndex + 1;
      g2bCollectStatus.progress.currentCode = code;
      result.byCode[code] = { processed: 0, upserted: 0, excluded: 0 };
      for (const chunk of dateChunks) {
        g2bCollectStatus.progress.currentRange = `${chunk.start}~${chunk.end}`;
        let pageNo = 1;
        let received = 0;
        let totalCount = Infinity;
        const numOfRows = 100;
        while (received < totalCount) {
          const { header, items, totalCount: tc } = await fetchG2BPage({
            baseUrl, serviceKey, dtilPrdctClsfcNo: code,
            inqryBgnDate: chunk.start, inqryEndDate: chunk.end,
            pageNo, numOfRows,
          });
          const resultCode = String(header.resultCode ?? '00');
          if (resultCode !== '00' && resultCode !== '0') {
            throw new Error(`API 오류 (코드 ${code}, ${chunk.start}~${chunk.end}): ${header.resultMsg || resultCode}`);
          }
          totalCount = tc || 0;
          if (!items.length) break;
          received += items.length;
          for (const raw of items) {
            const rec = mapG2BItem(raw);
            result.processed += 1;
            result.byCode[code].processed += 1;
            g2bCollectStatus.progress.processed = result.processed;
            if (rec.cntrctDlvrDivNm === '총액계약') {
              result.excluded += 1;
              result.byCode[code].excluded += 1;
              g2bCollectStatus.progress.excluded = result.excluded;
              continue;
            }
            if (await upsertG2BRecord(rec)) {
              result.upserted += 1;
              result.byCode[code].upserted += 1;
              g2bCollectStatus.progress.upserted = result.upserted;
            }
          }
          pageNo += 1;
          if (pageNo > 1000) break; // 무한루프 방지 안전장치
        }
      }
    }
  } catch (error) {
    console.error('[G2B] 수집 실패:', error);
    result.errors.push(error.message);
  } finally {
    g2bCollectStatus.running = false;
    g2bCollectStatus.progress = null;
    g2bCollectStatus.lastRunAt = new Date().toISOString();
    g2bCollectStatus.lastResult = result;
    console.log('[G2B] 수집 완료:', JSON.stringify(result));
  }
}

app.post('/api/g2b/collect', (req, res) => {
  if (g2bCollectStatus.running) {
    return res.status(409).json({ error: '이미 수집이 진행 중입니다.' });
  }
  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const toDashDate = (d) => d.toISOString().slice(0, 10);

  const startDate = req.body?.startDate || toDashDate(oneYearAgo);
  const endDate = req.body?.endDate || toDashDate(today);
  runG2BCollection({ startDate, endDate });
  res.json({ ok: true, message: '수집을 시작했습니다.', startDate, endDate });
});

app.get('/api/g2b/collect/status', (req, res) => {
  res.json(g2bCollectStatus);
});

/* 조달(G2B) 상세 실적 — 목록/항목별 AND 검색(전체 매칭 합계 포함)/전체 삭제 */
app.get('/api/g2b/records', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [];
    const params = [];
    const addLike = (column, value) => {
      const v = String(value || '').trim();
      if (v) { conditions.push(`${column} LIKE ?`); params.push(`%${v}%`); }
    };
    addLike('corp_nm', req.query.corpNm);
    addLike('dmnd_instt_nm', req.query.dmndInsttNm);
    addLike('prdct_idnt_no', req.query.prdctIdntNo);
    addLike('dtl_prdct_nm', req.query.dtlPrdctNm);

    const startDate = String(req.query.startDate || '').trim();
    if (startDate) { conditions.push('dcisn_dt >= ?'); params.push(startDate); }
    const endDate = String(req.query.endDate || '').trim();
    if (endDate) { conditions.push('dcisn_dt <= ?'); params.push(endDate); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [aggRows] = await pool.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(dlvr_amt), 0) AS totalAmount FROM g2b_procurement_records ${where}`,
      params,
    );
    const total = aggRows[0]?.total || 0;
    const totalAmount = Number(aggRows[0]?.totalAmount || 0);

    const [rows] = await pool.query(
      `SELECT dcisn_dt, corp_nm, dmnd_instt_nm, prdct_idnt_no, dtl_prdct_nm, dlvr_qty, dlvr_amt
       FROM g2b_procurement_records ${where}
       ORDER BY dcisn_dt DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    res.json({
      items: rows.map((row) => ({
        dcisnDt: row.dcisn_dt,
        corpNm: row.corp_nm || '',
        dmndInsttNm: row.dmnd_instt_nm || '',
        prdctIdntNo: row.prdct_idnt_no || '',
        dtlPrdctNm: row.dtl_prdct_nm || '',
        dlvrQty: Number(row.dlvr_qty || 0),
        dlvrAmt: Number(row.dlvr_amt || 0),
      })),
      total,
      totalAmount,
      page,
      pageSize,
    });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.delete('/api/g2b/records', async (req, res) => {
  try {
    await pool.query('DELETE FROM g2b_procurement_records');
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/* 조달(G2B) API 설정 — SERVICE_KEY 원문은 절대 클라이언트로 내려주지 않음 */
app.get('/api/g2b/settings', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT service_key, base_url, dtl_prdct_nos FROM g2b_settings WHERE id = ? LIMIT 1',
      ['default'],
    );
    const row = rows[0];
    res.json({
      hasServiceKey: !!row?.service_key,
      baseUrl: row?.base_url || '',
      dtlPrdctNos: asArray(parseJson(row?.dtl_prdct_nos, [])),
    });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.put('/api/g2b/settings', async (req, res) => {
  try {
    const body = req.body || {};
    const [existingRows] = await pool.execute(
      'SELECT service_key, base_url, dtl_prdct_nos FROM g2b_settings WHERE id = ? LIMIT 1',
      ['default'],
    );
    const existing = existingRows[0] || {};

    const serviceKey = body.serviceKey !== undefined ? String(body.serviceKey).trim() : (existing.service_key || '');
    const baseUrl = body.baseUrl !== undefined ? String(body.baseUrl).trim() : (existing.base_url || '');
    const dtlPrdctNos = body.dtlPrdctNos !== undefined
      ? asArray(body.dtlPrdctNos).map((v) => String(v).trim()).filter(Boolean)
      : asArray(parseJson(existing.dtl_prdct_nos, []));

    await pool.execute(
      `INSERT INTO g2b_settings (id, service_key, base_url, dtl_prdct_nos) VALUES ('default', ?, ?, ?)
       ON DUPLICATE KEY UPDATE service_key = VALUES(service_key), base_url = VALUES(base_url), dtl_prdct_nos = VALUES(dtl_prdct_nos)`,
      [serviceKey || null, baseUrl || null, JSON.stringify(dtlPrdctNos)],
    );
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/* 조달(G2B) 설정 화면 전용 — 수집된 조달 데이터에서 업체명 검색 (중복 제거) */
app.get('/api/g2b/companies/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ items: [] });
    const [rows] = await pool.query(
      'SELECT DISTINCT corp_nm FROM g2b_procurement_records WHERE corp_nm LIKE ? ORDER BY corp_nm LIMIT 50',
      [`%${q}%`],
    );
    res.json({ items: rows.map((row) => row.corp_nm).filter(Boolean) });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/api/collection/:key', async (req, res) => {
  try {
    const route = keyMap[req.params.key];
    if (route) {
      return res.json(await route.get());
    }
    return res.json(await loadCollectionFallback(req.params.key));
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.put('/api/collection/:key', async (req, res) => {
  try {
    const route = keyMap[req.params.key];
    if (route) {
      await route.put(req.body);
    } else {
      await saveCollectionFallback(req.params.key, req.body);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.delete('/api/collection/:key', async (req, res) => {
  try {
    const route = keyMap[req.params.key];
    if (route) {
      await route.clear();
    } else {
      await deleteCollectionFallback(req.params.key);
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/api/document-pdf-worker.mjs', (_, res) => {
  res.type('application/javascript');
  res.sendFile(documentPdfWorkerPath);
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

init()
  .then(() => {
    const port = process.env.PORT || 3001;
    app.listen(port, () => console.log(`API server running: http://localhost:${port}`));
  })
  .catch((error) => {
    console.error('DB connection failed:', error.message);
    process.exit(1);
  });
