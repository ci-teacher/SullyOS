import { DB } from '../db';
import type { Anniversary, DiaryEntry, GalleryImage, RoomNote, RoomTodo, SocialPost, XhsActivityRecord } from '../../types';
import { deleteSharedDiary, fetchSharedDiaryRecords, mergeDiaryCopies, saveSharedDiary } from './journal';
import { recordSharedActivity } from './activity';
import {
  deleteSharedResource,
  getLocalResourceVersion,
  listSharedResources,
  markLocalResourceVersion,
  mergeSharedResourceRecords,
  putSharedResource,
  type SharedResourceKind,
  type SharedResourceRecord,
} from './resourceStore';
import { deleteSharedGalleryImage, fetchSharedGallery, installSharedGalleryRetry, saveSharedGalleryImage } from './gallery';
import { installSharedMutationQueue } from './syncQueue';

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

async function reconcileRemoteRecords<T extends { id: string }>(
  kind: SharedResourceKind,
  local: T[],
  remote: SharedResourceRecord<T>[],
  saveLocal: (item: T) => Promise<void>,
  deleteLocal: (id: string) => Promise<void>,
): Promise<T[]> {
  for (const record of remote) {
    if (record.updatedAt < getLocalResourceVersion(kind, record.id)) continue;
    if (record.deleted || !record.payload) await deleteLocal(record.id);
    else await saveLocal(record.payload);
  }
  return mergeSharedResourceRecords(kind, local, remote);
}

export function installSharedPhoneFoundation(): void {
  if (installed) return;
  installed = true;

  markFirstUseGuideDone();
  installSharedMutationQueue();
  installSharedGalleryRetry();

  // ── Exchange diary ──────────────────────────────────────────
  const originalGetDiaries = DB.getDiariesByCharId.bind(DB);
  const originalSaveDiary = DB.saveDiary.bind(DB);
  const originalDeleteDiary = DB.deleteDiary.bind(DB);

  DB.getDiariesByCharId = async (charId: string): Promise<DiaryEntry[]> => {
    const local = await originalGetDiaries(charId);
    try {
      const remote = await fetchSharedDiaryRecords(charId);
      const merged = mergeDiaryCopies(local, remote);
      const mergedIds = new Set(merged.map(item => item.id));

      for (const item of local) {
        if (!mergedIds.has(item.id)) await originalDeleteDiary(item.id);
      }

      for (const record of remote) {
        if (record.deleted || !record.diary) continue;
        const diary = record.diary;
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
      recordSharedActivity('diary.save', 'diary', stamped.id, { charId: stamped.charId, date: stamped.date }),
    ]);
  };

  DB.deleteDiary = async (id: string): Promise<void> => {
    await originalDeleteDiary(id);
    void Promise.all([
      deleteSharedDiary(id),
      recordSharedActivity('diary.delete', 'diary', id),
    ]);
  };

  // ── Spark ───────────────────────────────────────────────────
  const originalGetSocialPosts = DB.getSocialPosts.bind(DB);
  const originalSaveSocialPost = DB.saveSocialPost.bind(DB);
  const originalDeleteSocialPost = DB.deleteSocialPost.bind(DB);
  const originalClearSocialPosts = DB.clearSocialPosts.bind(DB);

  DB.getSocialPosts = async (): Promise<SocialPost[]> => {
    const local = await originalGetSocialPosts();
    const remote = await listSharedResources<SocialPost>('social_post');
    return await reconcileRemoteRecords('social_post', local, remote, originalSaveSocialPost, originalDeleteSocialPost);
  };

  DB.saveSocialPost = async (post: SocialPost): Promise<void> => {
    await originalSaveSocialPost(post);
    const updatedAt = markLocalResourceVersion('social_post', post.id);
    void Promise.all([
      putSharedResource('social_post', post.id, post, '', { updatedAt }),
      recordSharedActivity('spark.save', 'social_post', post.id),
    ]);
  };

  DB.deleteSocialPost = async (id: string): Promise<void> => {
    await originalDeleteSocialPost(id);
    void Promise.all([
      deleteSharedResource('social_post', id),
      recordSharedActivity('spark.delete', 'social_post', id),
    ]);
  };

  DB.clearSocialPosts = async (): Promise<void> => {
    const existing = await originalGetSocialPosts();
    await originalClearSocialPosts();
    void Promise.all(existing.map(post => deleteSharedResource('social_post', post.id)));
  };

  // ── Room notes / sticky traces ───────────────────────────────
  const originalGetRoomNotes = DB.getRoomNotes.bind(DB);
  const originalSaveRoomNote = DB.saveRoomNote.bind(DB);
  const originalDeleteRoomNote = DB.deleteRoomNote.bind(DB);

  DB.getRoomNotes = async (charId: string): Promise<RoomNote[]> => {
    const local = await originalGetRoomNotes(charId);
    const remote = await listSharedResources<RoomNote>('room_note', charId);
    return await reconcileRemoteRecords('room_note', local, remote, originalSaveRoomNote, originalDeleteRoomNote);
  };

  DB.saveRoomNote = async (note: RoomNote): Promise<void> => {
    await originalSaveRoomNote(note);
    const updatedAt = markLocalResourceVersion('room_note', note.id);
    void Promise.all([
      putSharedResource('room_note', note.id, note, note.charId, { updatedAt }),
      recordSharedActivity('note.save', 'room_note', note.id, { charId: note.charId, type: note.type }),
    ]);
  };

  DB.deleteRoomNote = async (id: string): Promise<void> => {
    await originalDeleteRoomNote(id);
    void Promise.all([
      deleteSharedResource('room_note', id),
      recordSharedActivity('note.delete', 'room_note', id),
    ]);
  };

  // ── Room daily todos ────────────────────────────────────────
  const originalGetRoomTodo = DB.getRoomTodo.bind(DB);
  const originalSaveRoomTodo = DB.saveRoomTodo.bind(DB);

  DB.getRoomTodo = async (charId: string, date: string): Promise<RoomTodo | null> => {
    const local = await originalGetRoomTodo(charId, date);
    const id = `${charId}_${date}`;
    const remote = await listSharedResources<RoomTodo>('room_todo', charId);
    const record = remote.find(item => item.id === id);

    if (!record) return local;
    const localVersion = getLocalResourceVersion('room_todo', id);
    if (record.updatedAt < localVersion) return local;

    markLocalResourceVersion('room_todo', id, record.updatedAt);
    if (record.deleted || !record.payload) return null;

    await originalSaveRoomTodo(record.payload);
    return record.payload;
  };

  DB.saveRoomTodo = async (todo: RoomTodo): Promise<void> => {
    await originalSaveRoomTodo(todo);
    const updatedAt = markLocalResourceVersion('room_todo', todo.id);
    void Promise.all([
      putSharedResource('room_todo', todo.id, todo, todo.charId, { updatedAt }),
      recordSharedActivity('room.todo.save', 'room_todo', todo.id, { charId: todo.charId, date: todo.date }),
    ]);
  };

  // ── Anniversaries / shared calendar anchors ─────────────────
  const originalGetAnniversaries = DB.getAllAnniversaries.bind(DB);
  const originalSaveAnniversary = DB.saveAnniversary.bind(DB);
  const originalDeleteAnniversary = DB.deleteAnniversary.bind(DB);

  DB.getAllAnniversaries = async (): Promise<Anniversary[]> => {
    const local = await originalGetAnniversaries();
    const remote = await listSharedResources<Anniversary>('anniversary');
    return await reconcileRemoteRecords('anniversary', local, remote, originalSaveAnniversary, originalDeleteAnniversary);
  };

  DB.saveAnniversary = async (anniversary: Anniversary): Promise<void> => {
    await originalSaveAnniversary(anniversary);
    const updatedAt = markLocalResourceVersion('anniversary', anniversary.id);
    void Promise.all([
      putSharedResource('anniversary', anniversary.id, anniversary, anniversary.charId, { updatedAt }),
      recordSharedActivity('anniversary.save', 'anniversary', anniversary.id, { date: anniversary.date }),
    ]);
  };

  DB.deleteAnniversary = async (id: string): Promise<void> => {
    await originalDeleteAnniversary(id);
    void Promise.all([
      deleteSharedResource('anniversary', id),
      recordSharedActivity('anniversary.delete', 'anniversary', id),
    ]);
  };

  // ── Free roam / autonomous activity history ─────────────────
  const originalGetXhsActivities = DB.getXhsActivities.bind(DB);
  const originalGetAllXhsActivities = DB.getAllXhsActivities.bind(DB);
  const originalSaveXhsActivity = DB.saveXhsActivity.bind(DB);
  const originalDeleteXhsActivity = DB.deleteXhsActivity.bind(DB);
  const originalClearXhsActivities = DB.clearXhsActivities.bind(DB);

  DB.getXhsActivities = async (characterId: string, limit?: number): Promise<XhsActivityRecord[]> => {
    const local = await originalGetXhsActivities(characterId);
    const remote = await listSharedResources<XhsActivityRecord>('free_activity', characterId);
    const merged = await reconcileRemoteRecords('free_activity', local, remote, originalSaveXhsActivity, originalDeleteXhsActivity);
    const sorted = merged.sort((a, b) => b.timestamp - a.timestamp);
    return limit ? sorted.slice(0, limit) : sorted;
  };

  DB.getAllXhsActivities = async (): Promise<XhsActivityRecord[]> => {
    const local = await originalGetAllXhsActivities();
    const remote = await listSharedResources<XhsActivityRecord>('free_activity');
    return await reconcileRemoteRecords('free_activity', local, remote, originalSaveXhsActivity, originalDeleteXhsActivity);
  };

  DB.saveXhsActivity = async (activity: XhsActivityRecord): Promise<void> => {
    await originalSaveXhsActivity(activity);
    const updatedAt = markLocalResourceVersion('free_activity', activity.id);
    void Promise.all([
      putSharedResource('free_activity', activity.id, activity, activity.characterId, { updatedAt }),
      recordSharedActivity('free_activity.save', 'free_activity', activity.id, {
        charId: activity.characterId,
        actionType: activity.actionType,
      }),
    ]);
  };

  DB.deleteXhsActivity = async (id: string): Promise<void> => {
    await originalDeleteXhsActivity(id);
    void deleteSharedResource('free_activity', id);
  };

  DB.clearXhsActivities = async (characterId: string): Promise<void> => {
    const existing = await originalGetXhsActivities(characterId);
    await originalClearXhsActivities(characterId);
    void Promise.all(existing.map(item => deleteSharedResource('free_activity', item.id, characterId)));
  };

  // ── Gallery + actual media bytes ─────────────────────────────
  const originalGetGalleryImages = DB.getGalleryImages.bind(DB);
  const originalSaveGalleryImage = DB.saveGalleryImage.bind(DB);
  const originalDeleteGalleryImage = DB.deleteGalleryImage.bind(DB);
  const originalGetGalleryImageById = DB.getGalleryImageById.bind(DB);
  const originalUpdateGalleryImageReview = DB.updateGalleryImageReview.bind(DB);

  DB.getGalleryImages = async (charId?: string): Promise<GalleryImage[]> => {
    const local = await originalGetGalleryImages(charId);
    const merged = await fetchSharedGallery(local, charId);
    const mergedIds = new Set(merged.map(item => item.id));

    for (const item of local) {
      if (!mergedIds.has(item.id)) await originalDeleteGalleryImage(item.id);
    }
    for (const item of merged) {
      const before = local.find(existing => existing.id === item.id);
      if (!before || before.url !== item.url || before.review !== item.review || before.timestamp !== item.timestamp) {
        await originalSaveGalleryImage(item);
      }
    }
    return merged;
  };

  DB.saveGalleryImage = async (image: GalleryImage): Promise<void> => {
    await originalSaveGalleryImage(image);
    void Promise.all([
      saveSharedGalleryImage(image),
      recordSharedActivity('gallery.save', 'gallery', image.id, { charId: image.charId }),
    ]);
  };

  DB.deleteGalleryImage = async (id: string): Promise<void> => {
    const existing = await originalGetGalleryImageById(id);
    await originalDeleteGalleryImage(id);
    void Promise.all([
      deleteSharedGalleryImage(id, existing?.charId || ''),
      recordSharedActivity('gallery.delete', 'gallery', id, { charId: existing?.charId }),
    ]);
  };

  DB.updateGalleryImageReview = async (id: string, review: string): Promise<void> => {
    await originalUpdateGalleryImageReview(id, review);
    const updated = await originalGetGalleryImageById(id);
    if (updated) void saveSharedGalleryImage(updated);
  };

  void recordSharedActivity('phone.open', 'phone');
}
