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

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL CHECK(author IN ('xiaoci','laoshi')),
  app_type TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  payload TEXT,
  visibility TEXT NOT NULL DEFAULT 'shared' CHECK(visibility IN ('shared','xiaoci','laoshi')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_entries_type_updated ON entries(app_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_author_updated ON entries(author, updated_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  payload TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_pending ON events(consumed_at, expires_at, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('cedar','coc','game','reading','movie','listening')),
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','archived')),
  payload TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT NOT NULL CHECK(updated_by IN ('xiaoci','laoshi')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_kind_status ON sessions(kind, status, updated_at DESC);
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
  consumed_at INTEGER,
  dedupe_key TEXT,
  claimed_at INTEGER,
  claim_expires_at INTEGER,
  resolution TEXT,
  result_payload TEXT
);
CREATE INDEX IF NOT EXISTS idx_wake_status_created ON wake_signals(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wake_dedupe_key ON wake_signals(dedupe_key) WHERE dedupe_key IS NOT NULL;
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
ensureColumn('wake_signals', 'dedupe_key', 'TEXT');
ensureColumn('wake_signals', 'claimed_at', 'INTEGER');
ensureColumn('wake_signals', 'claim_expires_at', 'INTEGER');
ensureColumn('wake_signals', 'resolution', 'TEXT');
ensureColumn('wake_signals', 'result_payload', 'TEXT');
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_wake_dedupe_key ON wake_signals(dedupe_key) WHERE dedupe_key IS NOT NULL");

const qDiaryList = db.prepare('SELECT id, payload, updated_by, updated_at, deleted FROM diaries WHERE char_id = ? ORDER BY date DESC');
const qDiaryUpsert = db.prepare(`
INSERT OR REPLACE INTO diaries(id, char_id, date, payload, updated_by, updated_at, deleted)
VALUES (?, ?, ?, ?, ?, ?, 0)
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

const qEntryGet = db.prepare('SELECT * FROM entries WHERE id = ?');
const qEntryUpsert = db.prepare(`
INSERT INTO entries(id, author, app_type, title, body, payload, visibility, created_at, updated_at, deleted)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
ON CONFLICT(id) DO UPDATE SET
  author=excluded.author,
  app_type=excluded.app_type,
  title=excluded.title,
  body=excluded.body,
  payload=excluded.payload,
  visibility=excluded.visibility,
  updated_at=excluded.updated_at,
  deleted=0
`);
const qEntryTombstone = db.prepare('UPDATE entries SET deleted=1, updated_at=? WHERE id=?');

const qEventInsert = db.prepare(`
INSERT OR REPLACE INTO events(id, type, source, payload, created_at, expires_at, consumed_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const qEventConsume = db.prepare('UPDATE events SET consumed_at=? WHERE id=?');

const qSessionGet = db.prepare('SELECT * FROM sessions WHERE id = ?');
const qSessionUpsert = db.prepare(`
INSERT INTO sessions(id, kind, title, status, payload, updated_by, created_at, updated_at, deleted)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
ON CONFLICT(id) DO UPDATE SET
  kind=excluded.kind,
  title=excluded.title,
  status=excluded.status,
  payload=excluded.payload,
  updated_by=excluded.updated_by,
  updated_at=excluded.updated_at,
  deleted=0
`);
const qSessionTombstone = db.prepare('UPDATE sessions SET deleted=1, updated_by=?, updated_at=? WHERE id=?');
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
const qWakeInsert = db.prepare('INSERT OR IGNORE INTO wake_signals(id, reason, priority, status, payload, created_at, expires_at, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const qWakeConsume = db.prepare("UPDATE wake_signals SET status='consumed', consumed_at=?, resolution=?, result_payload=?, claim_expires_at=NULL WHERE id=? AND status IN ('pending','processing')");
const qWakeClaim = db.prepare("UPDATE wake_signals SET status='processing', claimed_at=?, claim_expires_at=? WHERE id=? AND status='pending'");
const qWakeFail = db.prepare("UPDATE wake_signals SET status='failed', consumed_at=?, resolution='failed', result_payload=?, claim_expires_at=NULL WHERE id=? AND status IN ('pending','processing')");
const qWakeRequeueExpiredClaims = db.prepare("UPDATE wake_signals SET status='pending', claimed_at=NULL, claim_expires_at=NULL WHERE status='processing' AND claim_expires_at IS NOT NULL AND claim_expires_at <= ?");

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
    dedupeKey: row.dedupe_key || undefined,
    claimedAt: row.claimed_at || undefined,
    claimExpiresAt: row.claim_expires_at || undefined,
    resolution: row.resolution || undefined,
    result: parseRowJson(row.result_payload, undefined),
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

function clampLimit(value, fallback = 50, max = 200) {
  return Math.min(max, Math.max(1, Number(value || fallback)));
}

function rowToEntry(row) {
  return {
    id: row.id,
    author: row.author,
    appType: row.app_type,
    title: row.title || undefined,
    body: row.body || '',
    payload: parseRowJson(row.payload, undefined),
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: Boolean(row.deleted),
  };
}

function rowToEvent(row) {
  return {
    id: row.id,
    type: row.type,
    source: row.source,
    payload: parseRowJson(row.payload, undefined),
    createdAt: row.created_at,
    expiresAt: row.expires_at || undefined,
    consumedAt: row.consumed_at || undefined,
  };
}

function rowToSession(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title || undefined,
    status: row.status,
    payload: parseRowJson(row.payload, {}),
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: Boolean(row.deleted),
  };
}

function listEntries(url) {
  const where = ['deleted=0'];
  const values = [];
  const appType = url.searchParams.get('appType');
  const visibility = url.searchParams.get('visibility');
  if (appType) { where.push('app_type=?'); values.push(appType); }
  if (visibility) { where.push('visibility=?'); values.push(visibility); }
  const limit = clampLimit(url.searchParams.get('limit'), 50);
  values.push(limit);
  const sql = `SELECT * FROM entries WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`;
  return db.prepare(sql).all(...values).map(rowToEntry);
}

function listEvents(url) {
  const where = ['1=1'];
  const values = [];
  const type = url.searchParams.get('type');
  const source = url.searchParams.get('source');
  const pending = url.searchParams.get('pending') === '1';
  if (type) { where.push('type=?'); values.push(type); }
  if (source) { where.push('source=?'); values.push(source); }
  if (pending) {
    where.push('consumed_at IS NULL');
    where.push('(expires_at IS NULL OR expires_at > ?)');
    values.push(Date.now());
  }
  const limit = clampLimit(url.searchParams.get('limit'), 50);
  values.push(limit);
  const sql = `SELECT * FROM events WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`;
  return db.prepare(sql).all(...values).map(rowToEvent);
}

function listSessions(url) {
  const where = ['deleted=0'];
  const values = [];
  const kind = url.searchParams.get('kind');
  const status = url.searchParams.get('status');
  if (kind) { where.push('kind=?'); values.push(kind); }
  if (status) { where.push('status=?'); values.push(status); }
  const limit = clampLimit(url.searchParams.get('limit'), 50);
  values.push(limit);
  const sql = `SELECT * FROM sessions WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`;
  return db.prepare(sql).all(...values).map(rowToSession);
}
function safeMediaPath(id) {
  const hash = createHash('sha256').update(id).digest('hex');
  return resolve(MEDIA_DIR, hash);
}

function unifiedTimeline(limit = 50) {
  const perSource = Math.max(20, Math.min(100, limit * 2));
  const items = [];

  for (const row of db.prepare('SELECT id, payload, updated_by, updated_at FROM diaries WHERE deleted=0 ORDER BY updated_at DESC LIMIT ?').all(perSource)) {
    items.push({
      id: `diary:${row.id}`,
      source: 'diary',
      actor: row.updated_by,
      occurredAt: row.updated_at,
      payload: parseRowJson(row.payload, {}),
    });
  }

  for (const row of db.prepare('SELECT * FROM entries WHERE deleted=0 ORDER BY updated_at DESC LIMIT ?').all(perSource)) {
    const entry = rowToEntry(row);
    items.push({
      id: `entry:${row.id}`,
      source: entry.appType,
      actor: entry.author,
      occurredAt: entry.updatedAt,
      payload: entry,
    });
  }

  for (const row of db.prepare('SELECT * FROM shared_resources WHERE deleted=0 ORDER BY updated_at DESC LIMIT ?').all(perSource)) {
    const resource = rowToResource(row);
    items.push({
      id: `resource:${row.kind}:${row.id}`,
      source: row.kind,
      actor: row.updated_by,
      occurredAt: row.updated_at,
      payload: resource,
    });
  }

  return items.sort((a, b) => b.occurredAt - a.occurredAt).slice(0, limit);
}

function searchSharedContent(query, limit = 40) {
  const q = String(query || '').trim();
  if (!q) return [];
  const like = `%${q.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
  const each = Math.max(10, Math.min(50, limit));
  const items = [];

  for (const row of db.prepare("SELECT * FROM entries WHERE deleted=0 AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' OR payload LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT ?").all(like, like, like, each)) {
    items.push({ id: `entry:${row.id}`, source: row.app_type, occurredAt: row.updated_at, payload: rowToEntry(row) });
  }

  for (const row of db.prepare("SELECT id, payload, updated_by, updated_at FROM diaries WHERE deleted=0 AND payload LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?").all(like, each)) {
    items.push({ id: `diary:${row.id}`, source: 'diary', actor: row.updated_by, occurredAt: row.updated_at, payload: parseRowJson(row.payload, {}) });
  }

  for (const row of db.prepare("SELECT * FROM shared_resources WHERE deleted=0 AND payload LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?").all(like, each)) {
    items.push({ id: `resource:${row.kind}:${row.id}`, source: row.kind, actor: row.updated_by, occurredAt: row.updated_at, payload: rowToResource(row) });
  }

  return items.sort((a, b) => b.occurredAt - a.occurredAt).slice(0, limit);
}
function teacherHome() {
  const now = Date.now();
  const diaryCount = db.prepare('SELECT COUNT(*) AS n FROM diaries WHERE deleted=0').get().n;
  const xiaociActivity = db.prepare("SELECT MAX(created_at) AS t FROM activity WHERE actor='xiaoci'").get().t || null;
  const laoshiActivity = db.prepare("SELECT MAX(created_at) AS t FROM activity WHERE actor='laoshi'").get().t || null;
  const recent = qRecentActivity.all(20).map(rowToActivity);
  const pendingWake = rowToWake(qPendingWake.get(now));
  const recentDiaries = db.prepare('SELECT id, payload, updated_by, updated_at FROM diaries WHERE deleted=0 ORDER BY updated_at DESC LIMIT 8').all()
    .map(row => ({
      id: row.id,
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
  const entryCounts = Object.fromEntries(
    db.prepare("SELECT app_type, COUNT(*) AS n FROM entries WHERE deleted=0 GROUP BY app_type").all()
      .map(row => [row.app_type, row.n]),
  );
  const recentEntries = db.prepare("SELECT * FROM entries WHERE deleted=0 ORDER BY updated_at DESC LIMIT 12").all()
    .map(rowToEntry);
  const activeSessions = db.prepare("SELECT * FROM sessions WHERE deleted=0 AND status IN ('active','paused') ORDER BY updated_at DESC LIMIT 8").all()
    .map(rowToSession);
  const freshBaseline = Number(laoshiActivity || 0);
  const freshEntryCounts = Object.fromEntries(
    db.prepare("SELECT app_type, COUNT(*) AS n FROM entries WHERE deleted=0 AND author='xiaoci' AND updated_at > ? GROUP BY app_type").all(freshBaseline)
      .map(row => [row.app_type, row.n]),
  );
  const freshResourceCounts = Object.fromEntries(
    db.prepare("SELECT kind, COUNT(*) AS n FROM shared_resources WHERE deleted=0 AND updated_by='xiaoci' AND updated_at > ? GROUP BY kind").all(freshBaseline)
      .map(row => [row.kind, row.n]),
  );
  const randomMemoryRow = db.prepare("SELECT * FROM entries WHERE deleted=0 AND app_type='memory' ORDER BY RANDOM() LIMIT 1").get();
  const randomMemory = randomMemoryRow ? rowToEntry(randomMemoryRow) : null;
  const upcomingCalendar = db.prepare(
    "SELECT * FROM entries WHERE deleted=0 AND app_type='calendar' AND CAST(json_extract(payload, '$.startsAt') AS INTEGER) >= ? ORDER BY CAST(json_extract(payload, '$.startsAt') AS INTEGER) ASC LIMIT 8"
  ).all(now).map(rowToEntry);
  const recentLetters = db.prepare("SELECT * FROM entries WHERE deleted=0 AND app_type='letter' ORDER BY updated_at DESC LIMIT 6").all()
    .map(rowToEntry);
  const recentMemories = db.prepare("SELECT * FROM entries WHERE deleted=0 AND app_type='memory' ORDER BY updated_at DESC LIMIT 6").all()
    .map(rowToEntry);

  return {
    now,
    diaryCount,
    resourceCounts,
    entryCounts,
    lastActivityAt: { xiaoci: xiaociActivity, laoshi: laoshiActivity },
    recentActivity: recent,
    recentDiaries,
    recentResources,
    recentEntries,
    recentLetters,
    recentMemories,
    upcomingCalendar,
    randomMemory,
    freshCounts: {
      entries: freshEntryCounts,
      resources: freshResourceCounts,
    },
    activeSessions,
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
        id: row.id,
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

    if (req.method === 'GET' && path === '/v1/entries') {
      return send(res, 200, { items: listEntries(url) });
    }

    if (req.method === 'PUT' && path.startsWith('/v1/entries/')) {
      const id = decodeURIComponent(path.slice('/v1/entries/'.length));
      const body = await readJson(req);
      if (!id || String(body.id || '') !== id || !body.appType) {
        return send(res, 400, { error: 'invalid entry' });
      }
      qEntryUpsert.run(
        id,
        actor(body.author),
        String(body.appType),
        body.title ? String(body.title) : null,
        String(body.body || ''),
        body.payload ? JSON.stringify(body.payload) : null,
        ['shared','xiaoci','laoshi'].includes(body.visibility) ? body.visibility : 'shared',
        Number(body.createdAt || Date.now()),
        Number(body.updatedAt || Date.now()),
      );
      return send(res, 200, { ok: true, id });
    }

    if (req.method === 'DELETE' && path.startsWith('/v1/entries/')) {
      const id = decodeURIComponent(path.slice('/v1/entries/'.length));
      const body = await readJson(req);
      const existing = qEntryGet.get(id);
      if (existing) qEntryTombstone.run(Number(body.updatedAt || Date.now()), id);
      return send(res, 204);
    }

    if (req.method === 'GET' && path === '/v1/events') {
      return send(res, 200, { items: listEvents(url) });
    }

    if (req.method === 'POST' && path === '/v1/events') {
      const body = await readJson(req);
      const id = String(body.id || randomUUID());
      qEventInsert.run(
        id,
        String(body.type || 'generic'),
        String(body.source || 'shared-phone'),
        body.payload ? JSON.stringify(body.payload) : null,
        Number(body.createdAt || Date.now()),
        body.expiresAt ? Number(body.expiresAt) : null,
        body.consumedAt ? Number(body.consumedAt) : null,
      );
      return send(res, 201, { ok: true, id });
    }

    if (req.method === 'POST' && /^\/v1\/events\/[^/]+\/consume$/.test(path)) {
      const id = decodeURIComponent(path.split('/')[3]);
      const body = await readJson(req);
      qEventConsume.run(Number(body.consumedAt || Date.now()), id);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && path === '/v1/sessions') {
      return send(res, 200, { items: listSessions(url) });
    }

    if (req.method === 'PUT' && path.startsWith('/v1/sessions/')) {
      const id = decodeURIComponent(path.slice('/v1/sessions/'.length));
      const body = await readJson(req);
      if (!id || String(body.id || '') !== id || !['cedar','coc','game','reading','movie','listening'].includes(body.kind)) {
        return send(res, 400, { error: 'invalid session' });
      }
      const status = ['active','paused','completed','archived'].includes(body.status) ? body.status : 'active';
      qSessionUpsert.run(
        id,
        body.kind,
        body.title ? String(body.title) : null,
        status,
        JSON.stringify(body.payload || {}),
        actor(body.updatedBy),
        Number(body.createdAt || Date.now()),
        Number(body.updatedAt || Date.now()),
      );
      return send(res, 200, { ok: true, id });
    }

    if (req.method === 'DELETE' && path.startsWith('/v1/sessions/')) {
      const id = decodeURIComponent(path.slice('/v1/sessions/'.length));
      const body = await readJson(req);
      const existing = qSessionGet.get(id);
      if (existing) qSessionTombstone.run(actor(body.updatedBy), Number(body.updatedAt || Date.now()), id);
      return send(res, 204);
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

    if (req.method === 'GET' && path === '/v1/timeline') {
      const limit = clampLimit(url.searchParams.get('limit'), 50, 200);
      return send(res, 200, { items: unifiedTimeline(limit) });
    }

    if (req.method === 'GET' && path === '/v1/search') {
      const query = url.searchParams.get('q') || '';
      const limit = clampLimit(url.searchParams.get('limit'), 40, 100);
      return send(res, 200, { items: searchSharedContent(query, limit) });
    }
    if (req.method === 'GET' && path === '/v1/teacher/home') {
      return send(res, 200, teacherHome());
    }

    if (req.method === 'POST' && path === '/v1/wake/claim') {
      const now = Date.now();
      qWakeRequeueExpiredClaims.run(now);
      const row = qPendingWake.get(now);
      if (!row) return send(res, 200, { wake: null });
      const claimExpiresAt = now + 30 * 60_000;
      const result = qWakeClaim.run(now, claimExpiresAt, row.id);
      if (!result.changes) return send(res, 409, { error: 'wake already claimed' });
      return send(res, 200, {
        wake: rowToWake({
          ...row,
          status: 'processing',
          claimed_at: now,
          claim_expires_at: claimExpiresAt,
        }),
      });
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
        body.dedupeKey ? String(body.dedupeKey) : null,
      );
      return send(res, 201, { ok: true, id });
    }

    if (req.method === 'POST' && /^\/v1\/wake\/[^/]+\/consume$/.test(path)) {
      const id = decodeURIComponent(path.split('/')[3]);
      const body = await readJson(req);
      const resolution = body.resolution === 'no_action' ? 'no_action' : 'acted';
      qWakeConsume.run(
        Date.now(),
        resolution,
        body.result ? JSON.stringify(body.result) : null,
        id,
      );
      return send(res, 200, { ok: true, resolution });
    }

    if (req.method === 'POST' && /^\/v1\/wake\/[^/]+\/fail$/.test(path)) {
      const id = decodeURIComponent(path.split('/')[3]);
      const body = await readJson(req);
      qWakeFail.run(
        Date.now(),
        body.result ? JSON.stringify(body.result) : null,
        id,
      );
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
