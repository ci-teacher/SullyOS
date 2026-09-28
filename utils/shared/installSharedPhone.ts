import { DB } from '../db';
import type { DiaryEntry } from '../../types';
import { deleteSharedDiary, fetchSharedDiaries, mergeDiaryCopies, saveSharedDiary } from './journal';
import { recordSharedActivity } from './activity';

let installed = false;

function markFirstUseGuideDone(): void {
  try {
    if (localStorage.getItem('os_first_use_memory_guide_v1') === null) {
      localStorage.setItem('os_first_use_memory_guide_v1', 'done');
      window.dispatchEvent(new Event('sully:first-use-guide'));
    }
  } catch {
    // Storage restrictions should not block app startup.
  }
}

export function installSharedPhoneFoundation(): void {
  if (installed) return;
  installed = true;

  markFirstUseGuideDone();

  const originalGetDiaries = DB.getDiariesByCharId.bind(DB);
  const originalSaveDiary = DB.saveDiary.bind(DB);
  const originalDeleteDiary = DB.deleteDiary.bind(DB);

  DB.getDiariesByCharId = async (charId: string): Promise<DiaryEntry[]> => {
    const local = await originalGetDiaries(charId);

    try {
      const remote = await fetchSharedDiaries(charId);
      const merged = mergeDiaryCopies(local, remote);

      for (const diary of remote) {
        const localMatch = local.find(item => item.id === diary.id || (item.charId === diary.charId && item.date === diary.date));
        if (!localMatch || (diary.timestamp || 0) > (localMatch.timestamp || 0)) {
          await originalSaveDiary(diary);
        }
      }

      return merged;
    } catch (error) {
      console.warn('[SharedPhone] diary pull failed; using local copy.', error);
      return local;
    }
  };

  DB.saveDiary = async (diary: DiaryEntry): Promise<void> => {
    const stamped = { ...diary, timestamp: Date.now() };
    await originalSaveDiary(stamped);

    void Promise.all([
      saveSharedDiary(stamped),
      recordSharedActivity('diary.save', 'diary', stamped.id, {
        charId: stamped.charId,
        date: stamped.date,
      }),
    ]);
  };

  DB.deleteDiary = async (id: string): Promise<void> => {
    await originalDeleteDiary(id);

    void Promise.all([
      deleteSharedDiary(id),
      recordSharedActivity('diary.delete', 'diary', id),
    ]);
  };

  void recordSharedActivity('phone.open', 'phone');
}
