import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const TOKEN = String(process.env.SHARED_PHONE_TOKEN || '').trim();
const DB_PATH = resolve(process.env.SHARED_PHONE_DB || './data/shared-phone.sqlite');

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS diaries (
  id TEXT PRIMARY KEY,
  char_id TEXT NOT NULL,
  date TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_by TEXT NOT NULL CHECK(updated_by IN ('xiaoci','laoshi')),
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diaries_char_date ON diaries(char_id, date);
CREATE INDEX IF NOT EXISTS idx_diaries_updated_at ON diaries(updated_at DESC);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL CHECK(actor IN ('xiaoci','laoshi')),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity(created_at DESC);

CREATE TABLE IF NOT EXISTS wake_signals (
  id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','consumed','expired','failed')),
  payload TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_wake_status_created ON wake_signals(status, created_at DESC);
`);

const qDiaryList = db.prepare('SELECT payload, updated_by, updated_at FROM diaries WHERE char_id = ? ORDER BY date DESC');
const qDiaryUpsert = db.prepare(`
INSERT INTO diaries(id, char_id, date, payload, updated_by, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  char_id=excluded.char_id,
  date=excluded.date,
  payload=excluded.payload,
  updated_by=excluded.updated_by,
  updated_at=excluded.updated_at
`);
const qDiaryDelete = db.prepare('DELETE FROM diaries WHERE id = ?');
const qActivityInsert = db.prepare('INSERT OR REPLACE INTO activity(id, actor, action, target_type, target_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const qRecentActivity = db.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT ?');
const qPendingWake = db.prepare("SELECT * FROM wake_signals WHERE status='pending' AND (expires_at IS NULL OR expires_at > ?) ORDER BY priority DESC, created_at ASC LIMIT 1");
const qWakeInsert = db.prepare('INSERT INTO wake_signals(id, reason, priority, status, payload, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const qWakeConsume = db.prepare("UPDATE wake_signals SET status='consumed', consumed_at=? WHERE id=? AND status IN ('pending','processing')");

function send(res, status, body = null) {
  const data = body === null ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function unauthorized(res) {
  send(res, 401, { error: 'unauthorized' });
}

function isAuthorized(req) {
  if (!TOKEN) return true;
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

async function readJson(req, maxBytes = 2_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function parseRowJson(value, fallback = null) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function rowToActivity(row) {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    targetType: row.target_type || undefined,
    targetId: row.target_id || undefined,
    metadata: parseRowJson(row.metadata, undefined),
    createdAt: row.created_at,
  };
}

function rowToWake(row) {
  if (!row) return null;
  return {
    id: row.id,
    reason: row.reason,
    priority: row.priority,
    status: row.status,
    payload: parseRowJson(row.payload, undefined),
    createdAt: row.created_at,
    expiresAt: row.expires_at || undefined,
    consumedAt: row.consumed_at || undefined,
  };
}

function teacherHome() {
  const now = Date.now();
  const diaryCount = db.prepare('SELECT COUNT(*) AS n FROM diaries').get().n;
  const xiaociActivity = db.prepare("SELECT MAX(created_at) AS t FROM activity WHERE actor='xiaoci'").get().t || null;
  const laoshiActivity = db.prepare("SELECT MAX(created_at) AS t FROM activity WHERE actor='laoshi'").get().t || null;
  const recent = qRecentActivity.all(20).map(rowToActivity);
  const pendingWake = rowToWake(qPendingWake.get(now));
  const recentDiaries = db.prepare('SELECT payload, updated_by, updated_at FROM diaries ORDER BY updated_at DESC LIMIT 8').all()
    .map(row => ({
      diary: parseRowJson(row.payload, {}),
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    }));

  return {
    now,
    diaryCount,
    lastActivityAt: { xiaoci: xiaociActivity, laoshi: laoshiActivity },
    recentActivity: recent,
    recentDiaries,
    pendingWake,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204);
    if (!isAuthorized(req)) return unauthorized(res);

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;

    if (req.method === 'GET' && path === '/health') {
      return send(res, 200, { ok: true, service: 'shared-phone', now: Date.now() });
    }

    if (req.method === 'GET' && path === '/v1/diaries') {
      const charId = url.searchParams.get('charId');
      if (!charId) return send(res, 400, { error: 'charId required' });
      const items = qDiaryList.all(charId).map(row => ({
        diary: parseRowJson(row.payload, {}),
        updatedBy: row.updated_by,
        updatedAt: row.updated_at,
      }));
      return send(res, 200, { items });
    }

    if (req.method === 'PUT' && path.startsWith('/v1/diaries/')) {
      const id = decodeURIComponent(path.slice('/v1/diaries/'.length));
      const body = await readJson(req);
      const diary = body.diary;
      if (!id || !diary || diary.id !== id || !diary.charId || !diary.date) {
        return send(res, 400, { error: 'invalid diary' });
      }
      const actor = body.updatedBy === 'laoshi' ? 'laoshi' : 'xiaoci';
      const updatedAt = Number(body.updatedAt || Date.now());
      qDiaryUpsert.run(id, diary.charId, diary.date, JSON.stringify(diary), actor, updatedAt);
      return send(res, 200, { ok: true, updatedAt });
    }

    if (req.method === 'DELETE' && path.startsWith('/v1/diaries/')) {
      const id = decodeURIComponent(path.slice('/v1/diaries/'.length));
      qDiaryDelete.run(id);
      return send(res, 204);
    }

    if (req.method === 'POST' && path === '/v1/activity') {
      const body = await readJson(req);
      const actor = body.actor === 'laoshi' ? 'laoshi' : 'xiaoci';
      const id = String(body.id || randomUUID());
      const createdAt = Number(body.createdAt || Date.now());
      qActivityInsert.run(
        id,
        actor,
        String(body.action || 'unknown'),
        body.targetType ? String(body.targetType) : null,
        body.targetId ? String(body.targetId) : null,
        body.metadata ? JSON.stringify(body.metadata) : null,
        createdAt,
      );
      return send(res, 201, { ok: true, id });
    }

    if (req.method === 'GET' && path === '/v1/activity') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 30)));
      return send(res, 200, { items: qRecentActivity.all(limit).map(rowToActivity) });
    }

    if (req.method === 'GET' && path === '/v1/teacher/home') {
      return send(res, 200, teacherHome());
    }

    if (req.method === 'GET' && path === '/v1/wake/next') {
      return send(res, 200, { wake: rowToWake(qPendingWake.get(Date.now())) });
    }

    if (req.method === 'POST' && path === '/v1/wake') {
      const body = await readJson(req);
      const id = String(body.id || randomUUID());
      const now = Date.now();
      const expiresAt = body.expiresAt ? Number(body.expiresAt) : null;
      qWakeInsert.run(
        id,
        String(body.reason || 'manual'),
        Number(body.priority || 0),
        'pending',
        body.payload ? JSON.stringify(body.payload) : null,
        now,
        expiresAt,
      );
      return send(res, 201, { ok: true, id });
    }

    if (req.method === 'POST' && /^\/v1\/wake\/[^/]+\/consume$/.test(path)) {
      const id = decodeURIComponent(path.split('/')[3]);
      qWakeConsume.run(Date.now(), id);
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'not found' });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: error instanceof Error ? error.message : 'internal error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`shared-phone server listening on http://${HOST}:${PORT}`);
  console.log(`database: ${DB_PATH}`);
});
