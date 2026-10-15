#!/usr/bin/env node
/**
 * Controlled exchange diary wake test for Xiaoci Phone's production VPS.
 * A successful --send creates exactly one wake signal (never changes diary content).
 * The wake engine service is restarted separately so it can deliver the notification.
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const dbPath = resolve(process.env.SHARED_PHONE_DB || './data/shared-phone.sqlite');
const db = new DatabaseSync(dbPath, { readOnly: true });
const now = Date.now();
try {
  const diary = db.prepare(`
    SELECT id, char_id, date, updated_at
    FROM diaries
    WHERE updated_by='xiaoci' AND deleted=0
      AND updated_at > ?
    ORDER BY updated_at DESC LIMIT 1
  `).get(now - 48 * 60 * 60_000);
  if (!diary) throw Error('No Xiaoci exchange diary update in the past 48 hours; stopped.');

  const active = db.prepare(`
    SELECT id, reason, status FROM wake_signals
    WHERE status IN ('pending','processing')
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at DESC
  `).all(now);
  if (active.length) {
    throw Error('Existing active wake signal(s); stopped to avoid overlap: ' +
      active.map(x => x.id + ' (' + x.reason + '/' + x.status + ')').join(', '));
  }

  const dedupeKey = `diary:${diary.id}:${diary.updated_at}`;
  const prior = db.prepare(`SELECT id, reason, status FROM wake_signals WHERE dedupe_key=? LIMIT 1`).get(dedupeKey);
  if (prior) throw Error(`This diary update already has a wake signal: ${prior.id} (${prior.status})`);

  console.log('Exchange diary found:', diary.date, diary.char_id);
  console.log('Diary updated at:', new Date(diary.updated_at).toISOString());
  console.log('No active or duplicate signals.');
  if (!process.argv.includes('--send')) {
    console.log('Dry run only; re-run with --send to create one wake signal.');
    process.exit(0);
  }
  const signalId = randomUUID();
  const body = {
    id: signalId,
    reason: 'new_diary',
    priority: 86,
    dedupeKey,
    expiresAt: now + 3 * 60 * 60_000,
    payload: {
      count: 1,
      latest: [{
        id: diary.id,
        charId: diary.char_id,
        date: diary.date,
        updatedAt: diary.updated_at,
      }],
      source: 'controlled_diary_test',
    },
  };
  const response = await fetch('http://127.0.0.1:8791/v1/wake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw Error('Wake API returned HTTP ' + response.status);
  const result = await response.json();
  if (result.id !== signalId || result.ok !== true) throw Error('Unexpected Wake API response');

  const saved = db.prepare('SELECT id,reason,status FROM wake_signals WHERE id=?').get(signalId);
  if (!saved || saved.reason !== 'new_diary' || saved.status !== 'pending') {
    throw Error('Wake API reported success but signal was not verified in the database');
  }
  console.log('SUCCESS: pending new_diary WakeSignal created');
  console.log('Signal ID:', signalId);
  console.log('Next: restart xiaoci-phone-wake.service to send Resend doorbell.');
} catch (error) {
  console.error('STOPPED:', error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
