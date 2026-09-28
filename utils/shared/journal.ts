import type { DiaryEntry } from '../../types';
import { resolveSharedActor } from './identity';
import { sharedRequest } from './sharedClient';
import type { SharedDiaryRecord, SharedListResponse } from './types';

function normalizeRecords(payload: SharedListResponse<SharedDiaryRecord> | SharedDiaryRecord[] | null): SharedDiaryRecord[] {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
}

export function mergeDiaryCopies(local: DiaryEntry[], remote: DiaryEntry[]): DiaryEntry[] {
  const byDay = new Map<string, DiaryEntry>();

  for (const diary of [...local, ...remote]) {
    const key = `${diary.charId}:${diary.date}`;
    const existing = byDay.get(key);
    if (!existing || (diary.timestamp || 0) >= (existing.timestamp || 0)) byDay.set(key, diary);
  }

  return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchSharedDiaries(charId: string): Promise<DiaryEntry[]> {
  const payload = await sharedRequest<SharedListResponse<SharedDiaryRecord> | SharedDiaryRecord[]>(
    `/v1/diaries?charId=${encodeURIComponent(charId)}`,
    { method: 'GET' },
  );
  return normalizeRecords(payload).map(record => record.diary);
}

export async function saveSharedDiary(diary: DiaryEntry): Promise<void> {
  const record: SharedDiaryRecord = {
    diary: { ...diary, timestamp: Date.now() },
    updatedBy: resolveSharedActor(),
    updatedAt: Date.now(),
  };

  await sharedRequest(`/v1/diaries/${encodeURIComponent(diary.id)}`, {
    method: 'PUT',
    body: JSON.stringify(record),
  });
}

export async function deleteSharedDiary(id: string): Promise<void> {
  await sharedRequest(`/v1/diaries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
