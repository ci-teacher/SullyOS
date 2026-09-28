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
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_wake_status_created ON wake_signals(status, created_at DESC);
`);

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
const qInsert = db.prepare('INSERT INTO wake_signals(id, reason, priority, status, payload, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const qExpire = db.prepare("UPDATE wake_signals SET status='expired' WHERE status='pending' AND expires_at IS NOT NULL AND expires_at <= ?");

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

function createSignal(reason, priority, payload, now) {
  const id = randomUUID();
  qInsert.run(
    id,
    reason,
    priority,
    'pending',
    payload ? JSON.stringify(payload) : null,
    now,
    now + SIGNAL_TTL_MS,
  );
  console.log(`[wake-engine] signal ${reason} priority=${priority} id=${id}`);
}

function probabilityForElapsed(elapsedMs) {
  const hours = Math.max(0, elapsedMs / 3_600_000);
  return 1 - Math.exp(-hours / RANDOM_MEAN_HOURS);
}

function runOnce() {
  const now = Date.now();
  qExpire.run(now);

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
      createSignal('new_xiaoci_activity', 80, {
        count: meaningful.length,
        latest: meaningful.slice(0, 6),
      }, now);
      return;
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
