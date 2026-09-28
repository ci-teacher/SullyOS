import type { DiaryEntry } from '../../types';
import { resolveSharedActor } from './identity';
import { sharedRequest } from './sharedClient';
import { mutateSharedOrQueue } from './syncQueue';
import type { SharedDiaryRecord, SharedListResponse } from './types';

function normalizeRecords(payload: SharedListResponse<SharedDiaryRecord> | SharedDiaryRecord[] | null): SharedDiaryRecord[] {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
}

export function mergeDiaryCopies(local: DiaryEntry[], remote: SharedDiaryRecord[]): DiaryEntry[] {
  const byDay = new Map<string, DiaryEntry>();
  for (const diary of local) byDay.set(`${diary.charId}:${diary.date}`, diary);

  for (const record of remote) {
    const diary = record.diary;
    if (record.deleted || !diary) {
      for (const [key, existing] of byDay) {
        if (existing.id === (diary?.id || '') && (existing.timestamp || 0) <= record.updatedAt) byDay.delete(key);
      }
      continue;
    }

    const key = `${diary.charId}:${diary.date}`;
    const existing = byDay.get(key);
    if (!existing || (diary.timestamp || 0) >= (existing.timestamp || 0)) byDay.set(key, diary);
  }

  return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchSharedDiaryRecords(charId: string): Promise<SharedDiaryRecord[]> {
  const payload = await sharedRequest<SharedListResponse<SharedDiaryRecord> | SharedDiaryRecord[]>(
    `/v1/diaries?charId=${encodeURIComponent(charId)}`,
    { method: 'GET' },
  );
  return normalizeRecords(payload);
}

export async function saveSharedDiary(diary: DiaryEntry): Promise<void> {
  const now = Date.now();
  const record: SharedDiaryRecord = {
    diary: { ...diary, timestamp: now },
    updatedBy: resolveSharedActor(),
    updatedAt: now,
    deleted: false,
  };

  await mutateSharedOrQueue(`/v1/diaries/${encodeURIComponent(diary.id)}`, {
    method: 'PUT',
    body: JSON.stringify(record),
  });
}

export async function deleteSharedDiary(id: string): Promise<void> {
  await mutateSharedOrQueue(`/v1/diaries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({ updatedBy: resolveSharedActor(), updatedAt: Date.now() }),
  });
}
