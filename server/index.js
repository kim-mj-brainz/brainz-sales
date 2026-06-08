import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'brainz_sales',
  waitForConnections: true,
  connectionLimit: 10,
});

async function init() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS collections (
      col_key    VARCHAR(100) PRIMARY KEY,
      data       LONGTEXT     NOT NULL,
      updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('DB 연결 및 테이블 확인 완료');
}

// 컬렉션 전체 조회
app.get('/api/collection/:key', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT data FROM collections WHERE col_key = ?',
      [req.params.key],
    );
    if (rows.length === 0) return res.json(null);
    res.json(JSON.parse(rows[0].data));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// 컬렉션 전체 저장(덮어쓰기)
app.put('/api/collection/:key', async (req, res) => {
  try {
    const json = JSON.stringify(req.body);
    await pool.execute(
      `INSERT INTO collections (col_key, data) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data)`,
      [req.params.key, json],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// 컬렉션 삭제
app.delete('/api/collection/:key', async (req, res) => {
  try {
    await pool.execute('DELETE FROM collections WHERE col_key = ?', [req.params.key]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

init()
  .then(() => {
    const port = process.env.PORT || 3001;
    app.listen(port, () => console.log(`서버 실행 중: http://localhost:${port}`));
  })
  .catch((e) => {
    console.error('DB 연결 실패:', e.message);
    process.exit(1);
  });
