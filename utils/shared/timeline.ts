import { sharedRequest } from './sharedClient';
import type { SharedListResponse } from './types';

export interface SharedTimelineItem {
  id: string;
  source: string;
  actor?: 'xiaoci' | 'laoshi';
  occurredAt: number;
  payload: unknown;
}

export async function listSharedTimeline(limit = 50): Promise<SharedTimelineItem[]> {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));
  const result = await sharedRequest<SharedListResponse<SharedTimelineItem>>(
    `/v1/timeline?limit=${safeLimit}`,
    { method: 'GET' },
  );
  return result?.items || [];
}

export async function searchSharedContent(
  query: string,
  limit = 40,
): Promise<SharedTimelineItem[]> {
  const q = query.trim();
  if (!q) return [];
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const result = await sharedRequest<SharedListResponse<SharedTimelineItem>>(
    `/v1/search?q=${encodeURIComponent(q)}&limit=${safeLimit}`,
    { method: 'GET' },
  );
  return result?.items || [];
}
