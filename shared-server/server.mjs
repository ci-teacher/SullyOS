import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const TOKEN = String(process.env.SHARED_PHONE_TOKEN || '').trim();
const DB_PATH = resolve(process.env.SHARED_PHONE_DB || './data/shared-phone.sqlite');
const MEDIA_DIR = resolve(process.env.SHARED_PHONE_MEDIA_DIR || './data/media');
const MAX_MEDIA_BYTES = Number(process.env.SHARED_PHONE_MAX_MEDIA_BYTES || 25 * 1024 * 1024);

mkdirSync(dirname(DB_PATH), { recursive: true });
mkdirSync(MEDIA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS diaries (
  id TEXT PRIMARY KEY,
  char_id TEXT NOT NULL,
  date TEXT NOT NULL,
  payload TEXT,
  updated_by TEXT NOT NULL CHECK(updated_by IN ('xiaoci','laoshi')),
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diaries_char_date ON diaries(char_id, date);
CREATE INDEX IF NOT EXISTS idx_diaries_updated_at ON diaries(updated_at DESC);

CREATE TABLE IF NOT EXISTS shared_resources (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  payload TEXT,
  media_id TEXT,
  updated_by TEXT NOT NULL CHECK(updated_by IN ('xiaoci','laoshi')),
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(kind, id)
);
CREATE INDEX IF NOT EXISTS idx_resources_kind_scope ON shared_resources(kind, scope, updated_at DESC);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  file_path TEXT NOT NULL,
  size INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

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

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(row => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[shared-phone] migrated ${table}.${column}`);
  }
}

// Forward-only lightweight migrations for databases created by earlier private builds.
ensureColumn('diaries', 'deleted', 'INTEGER NOT NULL DEFAULT 0');

const qDiaryList = db.prepare('SELECT id, payload, updated_by, updated_at, deleted FROM diaries WHERE char_id = ? ORDER BY date DESC');
const qDiaryUpsert = db.prepare(`
INSERT INTO diaries(id, char_id, date, payload, updated_by, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  char_id=excluded.char_id,
  date=excluded.date,
  payload=excluded.payload,
  updated_by=excluded.updated_by,
  updated_at=excluded.updated_at,
  deleted=0
`);
const qDiaryGet = db.prepare('SELECT * FROM diaries WHERE id = ?');
const qDiaryTombstone = db.prepare("UPDATE diaries SET payload=NULL, updated_by=?, updated_at=?, deleted=1 WHERE id=?");

const qResourceListAll = db.prepare('SELECT * FROM shared_resources WHERE kind = ? ORDER BY updated_at DESC');
const qResourceListScope = db.prepare('SELECT * FROM shared_resources WHERE kind = ? AND scope = ? ORDER BY updated_at DESC');
const qResourceGet = db.prepare('SELECT * FROM shared_resources WHERE kind = ? AND id = ?');
const qResourceUpsert = db.prepare(`
INSERT INTO shared_resources(kind, id, scope, payload, media_id, updated_by, updated_at, deleted)
VALUES (?, ?, ?, ?, ?, ?, ?, 0)
ON CONFLICT(kind, id) DO UPDATE SET
  scope=excluded.scope,
  payload=excluded.payload,
  media_id=excluded.media_id,
  updated_by=excluded.updated_by,
  updated_at=excluded.updated_at,
  deleted=0
`);
const qResourceTombstone = db.prepare(`
INSERT INTO shared_resources(kind, id, scope, payload, media_id, updated_by, updated_at, deleted)
VALUES (?, ?, ?, NULL, NULL, ?, ?, 1)
ON CONFLICT(kind, id) DO UPDATE SET
  updated_by=excluded.updated_by,
  updated_at=excluded.updated_at,
  deleted=1
`);

const qMediaGet = db.prepare('SELECT * FROM media WHERE id = ?');
const qMediaUpsert = db.prepare(`
INSERT INTO media(id, mime, file_path, size, updated_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  mime=excluded.mime,
  file_path=excluded.file_path,
  size=excluded.size,
  updated_at=excluded.updated_at
`);

const qActivityInsert = db.prepare('INSERT OR REPLACE INTO activity(id, actor, action, target_type, target_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const qRecentActivity = db.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT ?');
const qPendingWake = db.prepare("SELECT * FROM wake_signals WHERE status='pending' AND (expires_at IS NULL OR expires_at > ?) ORDER BY priority DESC, created_at ASC LIMIT 1");
const qWakeInsert = db.prepare('INSERT INTO wake_signals(id, reason, priority, status, payload, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const qWakeConsume = db.prepare("UPDATE wake_signals SET status='consumed', consumed_at=? WHERE id=? AND status IN ('pending','processing')");

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Cache-Control': 'no-store',
  };
}

function send(res, status, body = null) {
  const data = body === null ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function sendBinary(res, status, body, mime) {
  res.writeHead(status, {
    ...corsHeaders(),
    'Content-Type': mime || 'application/octet-stream',
    'Content-Length': body.length,
  });
  res.end(body);
}

function unauthorized(res) {
  send(res, 401, { error: 'unauthorized' });
}

function isAuthorized(req) {
  if (!TOKEN) return true;
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

async function readBody(req, maxBytes) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req, maxBytes = 2_000_000) {
  const body = await readBody(req, maxBytes);
  if (!body.length) return {};
  return JSON.parse(body.toString('utf8'));
}

function parseRowJson(value, fallback = null) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function actor(value) {
  return value === 'laoshi' ? 'laoshi' : 'xiaoci';
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

function rowToResource(row) {
  return {
    id: row.id,
    kind: row.kind,
    scope: row.scope || '',
    payload: row.deleted ? null : parseRowJson(row.payload, null),
    mediaId: row.media_id || undefined,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    deleted: Boolean(row.deleted),
  };
}

function safeMediaPath(id) {
  const hash = createHash('sha256').update(id).digest('hex');
  return resolve(MEDIA_DIR, hash);
}

function teacherHome() {
  const now = Date.now();
  const diaryCount = db.prepare('SELECT COUNT(*) AS n FROM diaries WHERE deleted=0').get().n;
  const xiaociActivity = db.prepare("SELECT MAX(created_at) AS t FROM activity WHERE actor='xiaoci'").get().t || null;
  const laoshiActivity = db.prepare("SELECT MAX(created_at) AS t FROM activity WHERE actor='laoshi'").get().t || null;
  const recent = qRecentActivity.all(20).map(rowToActivity);
  const pendingWake = rowToWake(qPendingWake.get(now));
  const recentDiaries = db.prepare('SELECT payload, updated_by, updated_at FROM diaries WHERE deleted=0 ORDER BY updated_at DESC LIMIT 8').all()
    .map(row => ({
      diary: parseRowJson(row.payload, {}),
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    }));
  const resourceCounts = Object.fromEntries(
    db.prepare("SELECT kind, COUNT(*) AS n FROM shared_resources WHERE deleted=0 GROUP BY kind").all()
      .map(row => [row.kind, row.n]),
  );
  const recentResources = db.prepare("SELECT * FROM shared_resources WHERE deleted=0 ORDER BY updated_at DESC LIMIT 12").all()
    .map(rowToResource);

  return {
    now,
    diaryCount,
    resourceCounts,
    lastActivityAt: { xiaoci: xiaociActivity, laoshi: laoshiActivity },
    recentActivity: recent,
    recentDiaries,
    recentResources,
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
        diary: row.deleted ? null : parseRowJson(row.payload, {}),
        updatedBy: row.updated_by,
        updatedAt: row.updated_at,
        deleted: Boolean(row.deleted),
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
      const updatedAt = Number(body.updatedAt || Date.now());
      qDiaryUpsert.run(id, diary.charId, diary.date, JSON.stringify(diary), actor(body.updatedBy), updatedAt);
      return send(res, 200, { ok: true, updatedAt });
    }

    if (req.method === 'DELETE' && path.startsWith('/v1/diaries/')) {
      const id = decodeURIComponent(path.slice('/v1/diaries/'.length));
      const body = await readJson(req);
      const existing = qDiaryGet.get(id);
      if (existing) {
        qDiaryTombstone.run(actor(body.updatedBy), Number(body.updatedAt || Date.now()), id);
      }
      return send(res, 204);
    }

    const resourceMatch = path.match(/^\/v1\/resources\/([^/]+)(?:\/([^/]+))?$/);
    if (resourceMatch) {
      const kind = decodeURIComponent(resourceMatch[1]);
      const id = resourceMatch[2] ? decodeURIComponent(resourceMatch[2]) : null;

      if (req.method === 'GET' && !id) {
        const scope = url.searchParams.get('scope');
        const rows = scope === null ? qResourceListAll.all(kind) : qResourceListScope.all(kind, scope);
        return send(res, 200, { items: rows.map(rowToResource) });
      }

      if (req.method === 'PUT' && id) {
        const body = await readJson(req);
        if (!body.payload || String(body.id || id) !== id) return send(res, 400, { error: 'invalid resource' });
        const updatedAt = Number(body.updatedAt || Date.now());
        qResourceUpsert.run(
          kind,
          id,
          String(body.scope || ''),
          JSON.stringify(body.payload),
          body.mediaId ? String(body.mediaId) : null,
          actor(body.updatedBy),
          updatedAt,
        );
        return send(res, 200, { ok: true, updatedAt });
      }

      if (req.method === 'DELETE' && id) {
        const body = await readJson(req);
        const existing = qResourceGet.get(kind, id);
        const scope = existing?.scope || String(body.scope || '');
        const updatedAt = Number(body.updatedAt || Date.now());
        qResourceTombstone.run(kind, id, scope, actor(body.updatedBy), updatedAt);
        return send(res, 200, { ok: true, updatedAt });
      }
    }

    const mediaMatch = path.match(/^\/v1\/media\/([^/]+)$/);
    if (mediaMatch) {
      const id = decodeURIComponent(mediaMatch[1]);

      if (req.method === 'PUT') {
        const body = await readBody(req, MAX_MEDIA_BYTES);
        if (!body.length) return send(res, 400, { error: 'empty media' });
        const filePath = safeMediaPath(id);
        writeFileSync(filePath, body);
        const mime = String(req.headers['content-type'] || 'application/octet-stream');
        qMediaUpsert.run(id, mime, filePath, body.length, Date.now());
        return send(res, 201, { ok: true, id, size: body.length });
      }

      if (req.method === 'GET') {
        const row = qMediaGet.get(id);
        if (!row || !existsSync(row.file_path)) return send(res, 404, { error: 'media not found' });
        return sendBinary(res, 200, readFileSync(row.file_path), row.mime);
      }
    }

    if (req.method === 'POST' && path === '/v1/activity') {
      const body = await readJson(req);
      const id = String(body.id || randomUUID());
      const createdAt = Number(body.createdAt || Date.now());
      qActivityInsert.run(
        id,
        actor(body.actor),
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
  console.log(`media: ${MEDIA_DIR}`);
});
