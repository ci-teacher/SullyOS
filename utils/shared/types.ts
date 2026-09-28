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
  id: string;
  diary: DiaryEntry | null;
  updatedBy: SharedActor;
  updatedAt: number;
  deleted?: boolean;
}

export interface SharedListResponse<T> {
  items: T[];
}

export type SharedEntryType =
  | 'letter'
  | 'memory'
  | 'calendar'
  | 'note'
  | 'timeline'
  | 'special';

export type SharedVisibility = 'shared' | 'xiaoci' | 'laoshi';

export interface SharedEntry {
  id: string;
  author: SharedActor;
  appType: SharedEntryType;
  title?: string;
  body: string;
  payload?: Record<string, unknown>;
  visibility: SharedVisibility;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface SharedEvent {
  id: string;
  type: string;
  source: string;
  payload?: Record<string, unknown>;
  createdAt: number;
  expiresAt?: number;
  consumedAt?: number;
}

export type SharedSessionKind = 'cedar' | 'coc' | 'game' | 'reading' | 'movie' | 'listening';
export type SharedSessionStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface SharedSession {
  id: string;
  kind: SharedSessionKind;
  title?: string;
  status: SharedSessionStatus;
  payload: Record<string, unknown>;
  updatedBy: SharedActor;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}
