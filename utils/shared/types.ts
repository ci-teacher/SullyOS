import type { DiaryEntry } from '../../types';
import type { SharedActor } from './identity';

export interface SharedActivity {
  id: string;
  actor: SharedActor;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface SharedDiaryRecord {
  diary: DiaryEntry | null;
  updatedBy: SharedActor;
  updatedAt: number;
  deleted?: boolean;
}

export interface SharedListResponse<T> {
  items: T[];
}
