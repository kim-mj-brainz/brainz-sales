import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

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

async function init() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS collections (
      col_key    VARCHAR(100) PRIMARY KEY,
      data       LONGTEXT     NOT NULL,
      updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
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

async function replaceRows(conn, deleteSql, items, insertItem) {
  await conn.beginTransaction();
  try {
    await conn.execute(deleteSql);
    for (const item of items) {
      await insertItem(conn, item);
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

const handlers = {
  async usersGet() {
    const [rows] = await pool.execute(`
      SELECT id, employee_no, name, team, email, phone, role, active, password, raw_json
      FROM users
      ORDER BY employee_no
    `);
    if (!rows.length) return emptyRowsFallback('users');
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
      await replaceRows(conn, 'DELETE FROM incalls', asArray(items), async (tx, item) => {
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
      });
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
      await replaceRows(conn, 'DELETE FROM document_customers', asArray(items), async (tx, item) => {
        const id = itemId(item, 'CUST');
        await tx.execute(
          `INSERT INTO document_customers
           (id, company, address, raw_json)
           VALUES (?, ?, ?, ?)`,
          [id, item.company || item.customer || '', item.address || '', stringify({ ...item, id })],
        );
      });
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
      await replaceRows(conn, 'DELETE FROM credits', asArray(items), async (tx, item) => {
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
      });
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
