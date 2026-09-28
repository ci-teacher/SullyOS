import { DatabaseSync } from 'node:sqlite';
import { cpSync, mkdirSync, rmSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const DB_PATH = resolve(process.env.SHARED_PHONE_DB || './data/shared-phone.sqlite');
const MEDIA_DIR = resolve(process.env.SHARED_PHONE_MEDIA_DIR || './data/media');
const BACKUP_DIR = resolve(process.env.SHARED_PHONE_BACKUP_DIR || './backups');
const KEEP = Math.max(1, Number(process.env.SHARED_PHONE_BACKUP_KEEP || 14));

function stamp(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z',
  ].join('');
}

mkdirSync(BACKUP_DIR, { recursive: true });
const target = join(BACKUP_DIR, stamp());
mkdirSync(target, { recursive: true });

const dbTarget = join(target, 'shared-phone.sqlite');
const db = new DatabaseSync(DB_PATH);
try {
  const escaped = dbTarget.replaceAll("'", "''");
  db.exec(`VACUUM INTO '${escaped}'`);
} finally {
  db.close();
}

try {
  statSync(MEDIA_DIR);
  cpSync(MEDIA_DIR, join(target, 'media'), { recursive: true });
} catch {
  // An empty/new install may not have media yet.
}

const backups = readdirSync(BACKUP_DIR, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => ({
    name: entry.name,
    path: join(BACKUP_DIR, entry.name),
    mtime: statSync(join(BACKUP_DIR, entry.name)).mtimeMs,
  }))
  .sort((a, b) => b.mtime - a.mtime);

for (const old of backups.slice(KEEP)) {
  rmSync(old.path, { recursive: true, force: true });
}

console.log(`shared-phone backup created: ${target}`);
console.log(`retaining newest ${KEEP} backup directories`);
