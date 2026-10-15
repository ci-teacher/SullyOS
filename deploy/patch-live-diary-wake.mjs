#!/usr/bin/env node
// Minimal, guarded patch for a production checkout that already has private
// Resend / exact-claim edits. Does not change env, database, or other files.
import { readFileSync, writeFileSync, copyFileSync, renameSync, rmSync, chmodSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const apply = process.argv.includes('--apply');
const root = resolve(process.cwd());
const path = join(root, 'shared-server', 'wake-engine.mjs');
const original = readFileSync(path, 'utf8');

if (original.includes('const qNewDiaries = db.prepare(') ||
    original.includes("'new_diary',") ||
    original.includes("new_diary: '")) {
  const complete = original.includes('const qNewDiaries = db.prepare(') &&
    original.includes("'new_diary',") &&
    original.includes("new_diary: '");
  if (!complete) throw Error('Partial diary patch detected. Refusing automatic changes.');
  console.log('Diary wake logic already present. No changes made.');
  process.exit(0);
}

const changes = [
  {
    label: 'diary query',
    before: 'const qNewEntries = db.prepare(`',
    after: `const qNewDiaries = db.prepare(\`
SELECT id, char_id, date, updated_at
FROM diaries
WHERE updated_by='xiaoci' AND deleted=0 AND updated_at > ?
ORDER BY updated_at DESC
LIMIT 8
\`);
const qNewEntries = db.prepare(\``,
  },
  {
    label: 'diary reason label',
    before: "    new_letter: '小词留了一封新信',",
    after: "    new_letter: '小词留了一封新信',\n    new_diary: '小词更新了交换日记',",
  },
  {
    label: 'diary wake decision',
    before: '  const entries = qNewEntries.all(baseline).map(row => ({',
    after: `  const diaries = qNewDiaries.all(baseline).map(row => ({
    id: row.id,
    charId: row.char_id,
    date: row.date,
    updatedAt: row.updated_at,
  }));

  if (diaries.length > 0) {
    const latest = diaries[0];
    if (createSignal(
      'new_diary',
      86,
      { count: diaries.length, latest: diaries },
      now,
      \`diary:\${latest.id}:\${latest.updatedAt}\`,
    )) return;
  }

  const entries = qNewEntries.all(baseline).map(row => ({`,
  },
  {
    label: 'prevent duplicate generic diary alert',
    before: "    const meaningful = fresh.filter(item => item.action !== 'phone.open');",
    after: `    const meaningful = fresh.filter(item =>
      item.action !== 'phone.open' && item.action !== 'diary.save'
    );`,
  },
];

let patched = original;
for (const change of changes) {
  const count = patched.split(change.before).length - 1;
  if (count !== 1) {
    throw Error(`Cannot safely locate ${change.label} (matches: ${count}). No changes made.`);
  }
  patched = patched.replace(change.before, change.after);
}

const tmp = path + '.diary-wake-check.tmp.mjs';
writeFileSync(tmp, patched, { mode: statSync(path).mode });
try {
  execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
} catch (e) {
  throw Error('Syntax check failed. Original file untouched. ' + String(e.stderr || e.message));
} finally {
  rmSync(tmp, { force: true });
}

console.log('Verified 4 targeted edits and Node.js syntax.');
if (!apply) {
  console.log('Dry run only. Re-run with --apply to preserve a backup and update the wake engine.');
  process.exit(0);
}

const backup = path + '.bak.diary-wake-' + new Date().toISOString().replace(/[:.]/g, '-');
copyFileSync(path, backup);
const next = path + '.diary-wake-replace.tmp.mjs';
writeFileSync(next, patched, { mode: statSync(path).mode });
renameSync(next, path);
console.log('Patched: ' + path);
console.log('Backup: ' + backup);
console.log('No service restart or database changes were made.');
