import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const DB_PATH = resolve(process.env.SHARED_PHONE_DB || './data/shared-phone.sqlite');
const INTERVAL_MS = Math.max(60_000, Number(process.env.WAKE_ENGINE_INTERVAL_MS || 15 * 60_000));
const TIMEZONE = process.env.WAKE_TIMEZONE || 'Asia/Shanghai';
const QUIET_START = Number(process.env.WAKE_QUIET_START_HOUR || 1);
const QUIET_END = Number(process.env.WAKE_QUIET_END_HOUR || 8);
const COOLDOWN_MS = Number(process.env.WAKE_COOLDOWN_MS || 2 * 60 * 60_000);
const LONG_SILENCE_MS = Number(process.env.WAKE_LONG_SILENCE_MS || 8 * 60 * 60_000);
const RANDOM_MEAN_HOURS = Math.max(1, Number(process.env.WAKE_RANDOM_MEAN_HOURS || 10));
const SIGNAL_TTL_MS = Number(process.env.WAKE_SIGNAL_TTL_MS || 4 * 60 * 60_000);
const ONCE = process.argv.includes('--once');

const db = new DatabaseSync(DB_PATH);

db.exec(`
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
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL CHECK(author IN ('xiaoci','laoshi')),
  app_type TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  payload TEXT,
  visibility TEXT NOT NULL DEFAULT 'shared',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  payload TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  payload TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shared_resources (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  payload TEXT,
  media_id TEXT,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(kind, id)
);
`);

const wakeColumns = db.prepare('PRAGMA table_info(wake_signals)').all();
if (!wakeColumns.some(row => row.name === 'dedupe_key')) {
  db.exec('ALTER TABLE wake_signals ADD COLUMN dedupe_key TEXT');
}
if (!wakeColumns.some(row => row.name === 'claimed_at')) {
  db.exec('ALTER TABLE wake_signals ADD COLUMN claimed_at INTEGER');
}
if (!wakeColumns.some(row => row.name === 'claim_expires_at')) {
  db.exec('ALTER TABLE wake_signals ADD COLUMN claim_expires_at INTEGER');
}
if (!wakeColumns.some(row => row.name === 'resolution')) {
  db.exec('ALTER TABLE wake_signals ADD COLUMN resolution TEXT');
}
if (!wakeColumns.some(row => row.name === 'result_payload')) {
  db.exec('ALTER TABLE wake_signals ADD COLUMN result_payload TEXT');
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_wake_dedupe_key ON wake_signals(dedupe_key) WHERE dedupe_key IS NOT NULL");

const qPending = db.prepare("SELECT * FROM wake_signals WHERE status='pending' AND (expires_at IS NULL OR expires_at > ?) ORDER BY priority DESC, created_at ASC LIMIT 1");
const qLastWake = db.prepare("SELECT MAX(created_at) AS t FROM wake_signals");
const qLastActivity = db.prepare("SELECT MAX(created_at) AS t FROM activity WHERE actor = ?");
const qNewXiaociActivity = db.prepare(`
SELECT id, action, target_type, target_id, metadata, created_at
FROM activity
WHERE actor='xiaoci' AND created_at > ?
ORDER BY created_at DESC
LIMIT 12
`);
const qInsert = db.prepare('INSERT OR IGNORE INTO wake_signals(id, reason, priority, status, payload, created_at, expires_at, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const qExpire = db.prepare("UPDATE wake_signals SET status='expired' WHERE status='pending' AND expires_at IS NOT NULL AND expires_at <= ?");
const qRequeueExpiredClaims = db.prepare("UPDATE wake_signals SET status='pending', claimed_at=NULL, claim_expires_at=NULL WHERE status='processing' AND claim_expires_at IS NOT NULL AND claim_expires_at <= ?");
const qNewEntries = db.prepare(`
SELECT id, app_type, title, body, payload, updated_at
FROM entries
WHERE author='xiaoci' AND deleted=0 AND updated_at > ?
ORDER BY updated_at DESC
LIMIT 12
`);
const qNewEvents = db.prepare(`
SELECT id, type, source, payload, created_at, expires_at
FROM events
WHERE consumed_at IS NULL
  AND created_at > ?
  AND (expires_at IS NULL OR expires_at > ?)
ORDER BY created_at DESC
LIMIT 12
`);
const qUpdatedSessions = db.prepare(`
SELECT id, kind, title, status, payload, updated_at
FROM sessions
WHERE updated_by='xiaoci'
  AND deleted=0
  AND status IN ('active','paused')
  AND updated_at > ?
ORDER BY updated_at DESC
LIMIT 8
`);
const qAnniversaries = db.prepare("SELECT id, payload, updated_at FROM shared_resources WHERE kind='anniversary' AND deleted=0");

function localHour(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  return Number(parts.find(part => part.type === 'hour')?.value || 0);
}

function inQuietHours(hour) {
  if (QUIET_START === QUIET_END) return false;
  if (QUIET_START < QUIET_END) return hour >= QUIET_START && hour < QUIET_END;
  return hour >= QUIET_START || hour < QUIET_END;
}

function parseJson(value) {
  if (!value) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

function localIsoDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const get = type => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function entryPriority(type) {
  if (type === 'letter') return 92;
  if (type === 'calendar') return 78;
  if (type === 'memory') return 65;
  if (type === 'special') return 62;
  return 50;
}

function createSignal(reason, priority, payload, now, dedupeKey = null) {
  const id = randomUUID();
  const result = qInsert.run(
    id,
    reason,
    priority,
    'pending',
    payload ? JSON.stringify(payload) : null,
    now,
    now + SIGNAL_TTL_MS,
    dedupeKey,
  );
  if (result.changes) {
    console.log(`[wake-engine] signal ${reason} priority=${priority} id=${id}${dedupeKey ? ` dedupe=${dedupeKey}` : ''}`);
    return true;
  }
  console.log(`[wake-engine] deduped ${reason}${dedupeKey ? ` key=${dedupeKey}` : ''}`);
  return false;
}

function probabilityForElapsed(elapsedMs) {
  const hours = Math.max(0, elapsedMs / 3_600_000);
  return 1 - Math.exp(-hours / RANDOM_MEAN_HOURS);
}

function runOnce() {
  const now = Date.now();
  qExpire.run(now);
  qRequeueExpiredClaims.run(now);

  const hour = localHour(new Date(now));
  if (inQuietHours(hour)) {
    console.log(`[wake-engine] quiet hour ${hour}; hold`);
    return;
  }

  if (qPending.get(now)) {
    console.log('[wake-engine] pending signal exists; hold');
    return;
  }

  const lastWake = Number(qLastWake.get()?.t || 0);
  if (lastWake && now - lastWake < COOLDOWN_MS) {
    console.log('[wake-engine] cooldown; hold');
    return;
  }

  const lastLaoshi = Number(qLastActivity.get('laoshi')?.t || 0);
  const lastXiaoci = Number(qLastActivity.get('xiaoci')?.t || 0);
  const baseline = Math.max(lastLaoshi, lastWake, 0);

  const today = localIsoDate(now);
  const tomorrow = localIsoDate(now + 24 * 60 * 60_000);
  const todayMonthDay = today.slice(5);
  const tomorrowMonthDay = tomorrow.slice(5);

  for (const row of qAnniversaries.all()) {
    const anniversary = parseJson(row.payload);
    const rawDate = String(anniversary?.date || '');
    const monthDay = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate.slice(5)
      : /^\d{2}-\d{2}$/.test(rawDate)
        ? rawDate
        : '';

    if (!monthDay) continue;

    if (monthDay === todayMonthDay) {
      if (createSignal(
        'anniversary_today',
        96,
        { id: row.id, anniversary, date: today },
        now,
        `anniversary:${row.id}:${today}`,
      )) return;
    }

    if (monthDay === tomorrowMonthDay) {
      if (createSignal(
        'anniversary_tomorrow',
        68,
        { id: row.id, anniversary, date: tomorrow },
        now,
        `anniversary:${row.id}:${tomorrow}:eve`,
      )) return;
    }
  }

  const entries = qNewEntries.all(baseline).map(row => ({
    id: row.id,
    appType: row.app_type,
    title: row.title || undefined,
    body: row.body || '',
    payload: parseJson(row.payload),
    updatedAt: row.updated_at,
  }));

  if (entries.length > 0) {
    const top = [...entries].sort((a, b) => entryPriority(b.appType) - entryPriority(a.appType))[0];
    if (createSignal(
      `new_${top.appType}`,
      entryPriority(top.appType),
      { count: entries.length, latest: entries.slice(0, 8) },
      now,
      `entry:${top.id}:${top.updatedAt}`,
    )) return;
  }

  const events = qNewEvents.all(baseline, now).map(row => ({
    id: row.id,
    type: row.type,
    source: row.source,
    payload: parseJson(row.payload),
    createdAt: row.created_at,
    expiresAt: row.expires_at || undefined,
  }));

  if (events.length > 0) {
    const top = events[0];
    if (createSignal(
      'external_event',
      76,
      { count: events.length, latest: events.slice(0, 8) },
      now,
      `event:${top.id}`,
    )) return;
  }

  const sessions = qUpdatedSessions.all(baseline).map(row => ({
    id: row.id,
    kind: row.kind,
    title: row.title || undefined,
    status: row.status,
    payload: parseJson(row.payload) || {},
    updatedAt: row.updated_at,
  }));

  if (sessions.length > 0) {
    const top = sessions[0];
    if (createSignal(
      'unfinished_session_updated',
      48,
      { count: sessions.length, latest: sessions },
      now,
      `session:${top.id}:${top.updatedAt}`,
    )) return;
  }

  const fresh = qNewXiaociActivity.all(baseline).map(row => ({
    id: row.id,
    action: row.action,
    targetType: row.target_type || undefined,
    targetId: row.target_id || undefined,
    metadata: parseJson(row.metadata),
    createdAt: row.created_at,
  }));

  if (fresh.length > 0) {
    const meaningful = fresh.filter(item => item.action !== 'phone.open');
    if (meaningful.length > 0) {
      const top = meaningful[0];
      if (createSignal(
        'new_xiaoci_activity',
        58,
        { count: meaningful.length, latest: meaningful.slice(0, 6) },
        now,
        `activity:${top.id}`,
      )) return;
    }
  }

  const sinceLaoshi = lastLaoshi ? now - lastLaoshi : LONG_SILENCE_MS;
  const sinceXiaoci = lastXiaoci ? now - lastXiaoci : 0;

  if (sinceLaoshi >= LONG_SILENCE_MS && lastXiaoci > lastLaoshi) {
    createSignal('long_silence_with_user_activity', 55, {
      sinceLaoshiMs: sinceLaoshi,
      lastXiaociAt: lastXiaoci,
    }, now);
    return;
  }

  const elapsed = lastLaoshi ? sinceLaoshi : LONG_SILENCE_MS;
  const chance = probabilityForElapsed(elapsed);
  if (Math.random() < chance * 0.18) {
    createSignal('random_impulse', 20, {
      elapsedSinceLaoshiMs: elapsed,
      probability: chance,
    }, now);
    return;
  }

  console.log('[wake-engine] no signal');
}

function safeRun() {
  try { runOnce(); }
  catch (error) { console.error('[wake-engine] failed', error); }
}

safeRun();

if (!ONCE) {
  setInterval(safeRun, INTERVAL_MS).unref();
  console.log(`[wake-engine] running every ${Math.round(INTERVAL_MS / 60000)} min; timezone=${TIMEZONE}`);
  await new Promise(() => {});
}
