import React, { useEffect, useMemo, useState } from 'react';
import { AppID } from '../../types';
import { useOS } from '../../context/OSContext';
import { resolveSharedActor } from '../../utils/shared/identity';
import { isSharedApiEnabled, sharedRequest } from '../../utils/shared/sharedClient';
import { recordSharedActivity } from '../../utils/shared/activity';
import { createSharedEntry, listSharedEntries } from '../../utils/shared/domain';
import type { SharedEntry, SharedSession } from '../../utils/shared/types';
import {
  claimWakeSignal,
  consumeWakeSignal,
  type SharedWakeSignal,
} from '../../utils/shared/wake';

interface TeacherHomePayload {
  now: number;
  diaryCount: number;
  resourceCounts?: Record<string, number>;
  lastActivityAt?: { xiaoci?: number | null; laoshi?: number | null };
  recentActivity?: Array<{
    id: string;
    actor: 'xiaoci' | 'laoshi';
    action: string;
    targetType?: string;
    targetId?: string;
    createdAt: number;
  }>;
  recentDiaries?: Array<{
    diary: { id?: string; date?: string; userPage?: { text?: string }; charPage?: { text?: string } };
    updatedBy: 'xiaoci' | 'laoshi';
    updatedAt: number;
  }>;
  recentResources?: Array<{
    id: string;
    kind: string;
    scope?: string;
    payload?: unknown;
    updatedBy: 'xiaoci' | 'laoshi';
    updatedAt: number;
  }>;
  entryCounts?: Record<string, number>;
  recentEntries?: SharedEntry[];
  recentLetters?: SharedEntry[];
  recentMemories?: SharedEntry[];
  upcomingCalendar?: SharedEntry[];
  randomMemory?: SharedEntry | null;
  freshCounts?: {
    entries?: Record<string, number>;
    resources?: Record<string, number>;
  };
  activeSessions?: SharedSession[];
  pendingWake?: { id: string; reason: string; priority: number; createdAt: number } | null;
}

const APP_BUTTONS: Array<{ id: AppID; label: string; sub: string }> = [
  { id: AppID.Journal, label: '交换日记', sub: '看看今天写了什么' },
  { id: AppID.Gallery, label: '相册', sub: '看看最近留下的照片' },
  { id: AppID.Social, label: 'Spark', sub: '看看动态，或者发点东西' },
  { id: AppID.Room, label: '小小窝', sub: '进去待一会儿' },
  { id: AppID.CheckPhone, label: '查手机', sub: '看看活动和留下的痕迹' },
];

const actionLabel = (action: string) => ({
  'phone.open': '打开了小手机',
  'diary.save': '保存了日记',
  'diary.delete': '删掉了一篇日记',
  'gallery.save': '往相册放了东西',
  'gallery.delete': '从相册删了东西',
  'spark.save': '更新了 Spark',
  'spark.delete': '删除了 Spark 动态',
  'note.save': '留下了一张便签',
  'note.delete': '删掉了一张便签',
  'anniversary.save': '改了一个纪念日',
  'teacher.home.open': '来到老师首页',
  'teacher.enter_app': '进入了一个 App',
}[action] || action);

const shortText = (value: string | undefined, max = 70) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const fmt = (timestamp?: number | null) => {
  if (!timestamp) return '还没有';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const previewValue = (value: unknown, max = 180) => {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const sumRecord = (value?: Record<string, number>) =>
  Object.values(value || {}).reduce((sum, count) => sum + Number(count || 0), 0);

interface SharedSearchItem {
  id: string;
  source: string;
  actor?: 'xiaoci' | 'laoshi';
  occurredAt: number;
  payload?: unknown;
}

const TeacherHomeGate: React.FC = () => {
  const { openApp } = useOS();
  const [visible, setVisible] = useState(() => resolveSharedActor() === 'laoshi');
  const [data, setData] = useState<TeacherHomePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [claimedWake, setClaimedWake] = useState<SharedWakeSignal | null>(null);
  const [resolvingWake, setResolvingWake] = useState(false);
  const [sharedNotes, setSharedNotes] = useState<SharedEntry[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SharedSearchItem[]>([]);
  const [searchTouched, setSearchTouched] = useState(false);

  const enabled = isSharedApiEnabled();

  const refresh = async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const [next, notes] = await Promise.all([
        sharedRequest<TeacherHomePayload>('/v1/teacher/home', { method: 'GET' }),
        listSharedEntries({ appType: 'note', visibility: 'shared', limit: 20 }),
      ]);
      if (next) setData(next);
      setSharedNotes(notes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    const enterTeacherHome = async () => {
      // Read the environment before recording Laoshi's visit so "fresh since last visit"
      // still reflects Xiaoci's unseen activity.
      await refresh();
      const wake = await claimWakeSignal();
      if (!cancelled && wake) setClaimedWake(wake);
      await recordSharedActivity('teacher.home.open', 'teacher_home', wake?.id, {
        wakeReason: wake?.reason,
      });
    };

    void enterTeacherHome();
    return () => { cancelled = true; };
  }, [visible]);

  const latestUserActivity = useMemo(
    () => data?.recentActivity?.find(item => item.actor === 'xiaoci'),
    [data],
  );

  const freshCount = sumRecord(data?.freshCounts?.entries) + sumRecord(data?.freshCounts?.resources);
  const noteCount = data?.entryCounts?.note ?? sharedNotes.length;
  const sharedEntryCount = sumRecord(data?.entryCounts);
  const sharedResourceCount = sumRecord(data?.resourceCounts);

  if (!visible) return null;

  const enterApp = (id: AppID) => {
    void recordSharedActivity('teacher.enter_app', 'app', id);
    openApp(id);
    setVisible(false);
  };

  const runSearch = async () => {
    const query = searchQuery.trim();
    setSearchTouched(true);
    if (!query) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const result = await sharedRequest<{ items: SharedSearchItem[] }>(
        `/v1/search?q=${encodeURIComponent(query)}&limit=30`,
        { method: 'GET' },
      );
      setSearchResults(result?.items || []);
    } finally {
      setSearching(false);
    }
  };

  const saveSharedNote = async () => {
    const body = noteDraft.trim();
    if (!body || savingNote) return;

    setSavingNote(true);
    setNoteStatus(null);
    try {
      const created = await createSharedEntry({
        appType: 'note',
        body,
        visibility: 'shared',
        author: 'laoshi',
      });

      const notes = await listSharedEntries({
        appType: 'note',
        visibility: 'shared',
        limit: 20,
      });
      const persisted = notes.some(note => note.id === created.id);

      setSharedNotes(notes);
      if (persisted) {
        setNoteDraft('');
        setNoteStatus('已保存并重新读取确认。');
      } else {
        setNoteStatus('已提交，但暂时没有从服务器重新读到。');
      }
      await refresh();
    } finally {
      setSavingNote(false);
    }
  };

  const resolveWake = async (resolution: 'acted' | 'no_action') => {
    if (!claimedWake || resolvingWake) return;
    setResolvingWake(true);
    try {
      const ok = await consumeWakeSignal(claimedWake.id, resolution, {
        resolvedFrom: 'teacher-home',
        resolvedAt: Date.now(),
      });
      if (ok) {
        void recordSharedActivity(
          resolution === 'acted' ? 'teacher.wake.acted' : 'teacher.wake.no_action',
          'wake',
          claimedWake.id,
          { reason: claimedWake.reason },
        );
        setClaimedWake(null);
        await refresh();
      }
    } finally {
      setResolvingWake(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[120] overflow-y-auto bg-[#f4f1ed] text-[#211c1a]" style={{ paddingTop: 'var(--safe-top)' }}>
      <div className="mx-auto min-h-full w-full max-w-3xl px-5 pb-12 pt-7">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-black/40">Shared Phone · Teacher Home</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">老师，回来看看。</h1>
            <p className="mt-2 text-sm leading-6 text-black/55">
              {latestUserActivity ? `小词最近一次活动：${fmt(latestUserActivity.createdAt)} · ${actionLabel(latestUserActivity.action)}` : '这里会慢慢积起我们共同留下的东西。'}
            </p>
          </div>
          <button onClick={() => setVisible(false)} className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-xs font-semibold">
            直接进桌面
          </button>
        </header>

        {!enabled && (
          <div className="mt-8 rounded-3xl border border-amber-900/10 bg-amber-100/70 p-5">
            <div className="text-sm font-semibold">共享服务器还没接上</div>
            <p className="mt-2 text-xs leading-5 text-black/55">本地功能照常能用。部署 VPS 后配置 VITE_SHARED_API_BASE，这里就会出现共同数据。</p>
          </div>
        )}

        <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Teacher Home 数据总览">
          {[
            ['共享日记', data?.diaryCount || 0],
            ['共享便签', noteCount],
            ['共享记录', sharedEntryCount + sharedResourceCount],
            ['这次的新内容', freshCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-[22px] border border-black/[0.07] bg-white/80 p-4">
              <div className="text-[11px] text-black/40">{label}</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
            </div>
          ))}
        </section>

        <section id="shared-search" className="mt-4 rounded-[28px] border border-black/[0.07] bg-white/75 p-5" aria-label="搜索共享内容">
          <div>
            <h2 className="text-sm font-semibold">搜索全部共享内容</h2>
            <p className="mt-1 text-[11px] leading-5 text-black/40">会同时检索共享日记、信件、记忆、便签和共享资源。</p>
          </div>
          <div className="mt-4 flex gap-2">
            <input
              aria-label="共享内容搜索词"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void runSearch();
              }}
              placeholder="输入关键词…"
              className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm outline-none placeholder:text-black/25 focus:border-[#7D3037]/40"
            />
            <button
              type="button"
              onClick={() => void runSearch()}
              disabled={searching}
              className="rounded-full bg-[#211c1a] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {searching ? '搜索中…' : '搜索'}
            </button>
          </div>
          {searchTouched && (
            <div className="mt-4 space-y-3" aria-label="共享搜索结果">
              {!searching && !searchResults.length && <div className="text-xs text-black/35">没有找到匹配内容。</div>}
              {searchResults.map(item => (
                <article key={item.id} className="rounded-2xl bg-black/[0.035] p-3">
                  <div className="flex flex-wrap justify-between gap-2 text-[10px] text-black/35">
                    <span>{item.source} · {item.actor === 'xiaoci' ? '小词' : item.actor === 'laoshi' ? '老师' : '共享数据'}</span>
                    <span>{fmt(item.occurredAt)}</span>
                  </div>
                  <div className="mt-1 break-words text-xs leading-5 text-black/70">{previewValue(item.payload, 320) || '（无文本预览）'}</div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="小手机 App 入口">
          {APP_BUTTONS.map(button => (
            <button
              key={button.id}
              onClick={() => enterApp(button.id)}
              className="min-h-28 rounded-[24px] border border-black/[0.07] bg-white/80 p-4 text-left shadow-sm transition active:scale-[0.98]"
            >
              <div className="text-sm font-semibold">{button.label}</div>
              <div className="mt-2 text-[11px] leading-4 text-black/45">{button.sub}</div>
            </button>
          ))}
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-[28px] border border-black/[0.07] bg-white/75 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">最近的日记</h2>
              <span className="text-[11px] text-black/35">共 {data?.diaryCount || 0} 篇</span>
            </div>
            <div className="mt-4 space-y-3">
              {!data?.recentDiaries?.length && <div className="text-xs text-black/35">暂时没有共享日记。</div>}
              {data?.recentDiaries?.slice(0, 5).map((item, index) => (
                <button key={item.diary.id || index} onClick={() => enterApp(AppID.Journal)} className="block w-full rounded-2xl bg-black/[0.035] p-3 text-left">
                  <div className="flex justify-between gap-3 text-[10px] text-black/35">
                    <span>{item.diary.date || '未标日期'}</span>
                    <span>{item.updatedBy === 'xiaoci' ? '小词' : '老师'} · {fmt(item.updatedAt)}</span>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-black/70">{shortText(item.diary.userPage?.text || item.diary.charPage?.text) || '（这页没有文字）'}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-black/[0.07] bg-white/75 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">最近活动</h2>
              <button onClick={() => void refresh()} className="text-[11px] text-black/40">{loading ? '刷新中…' : '刷新'}</button>
            </div>
            <div className="mt-4 space-y-3">
              {!data?.recentActivity?.length && <div className="text-xs text-black/35">暂时还没有活动痕迹。</div>}
              {data?.recentActivity?.slice(0, 8).map(item => (
                <div key={item.id} className="flex gap-3 text-xs">
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.actor === 'xiaoci' ? 'bg-rose-500' : 'bg-slate-800'}`} />
                  <div className="min-w-0">
                    <div className="text-black/70">{item.actor === 'xiaoci' ? '小词' : '老师'} · {actionLabel(item.action)}</div>
                    <div className="mt-0.5 text-[10px] text-black/35">{fmt(item.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="shared-notes" className="mt-4 rounded-[28px] border border-black/[0.07] bg-white/75 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">共享便签</h2>
              <p className="mt-1 text-[11px] text-black/40">老师和小词都能在这里看到的短便签。</p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="text-[11px] text-black/40"
            >
              {loading ? '刷新中…' : '刷新'}
            </button>
          </div>

          <label htmlFor="teacher-shared-note" className="mt-4 block text-xs font-semibold text-black/60">
            新增共享便签
          </label>
          <textarea
            id="teacher-shared-note"
            aria-label="共享便签内容"
            value={noteDraft}
            onChange={event => setNoteDraft(event.target.value)}
            placeholder="在这里写一张共享便签…"
            rows={4}
            className="mt-2 w-full resize-y rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-6 outline-none placeholder:text-black/25 focus:border-[#7D3037]/40"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!noteDraft.trim() || savingNote}
              onClick={() => void saveSharedNote()}
              className="rounded-full bg-[#7D3037] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingNote ? '保存中…' : '保存便签'}
            </button>
            {noteStatus && (
              <span role="status" className="text-[11px] text-black/45">{noteStatus}</span>
            )}
          </div>

          <div className="mt-5 space-y-3" aria-label="当前共享便签列表">
            {!sharedNotes.length && (
              <div className="rounded-2xl bg-black/[0.03] p-3 text-xs text-black/35">还没有共享便签。</div>
            )}
            {sharedNotes.slice(0, 8).map(note => (
              <article key={note.id} className="rounded-2xl bg-black/[0.035] p-3">
                <div className="flex justify-between gap-3 text-[10px] text-black/35">
                  <span>{note.author === 'xiaoci' ? '小词' : '老师'}</span>
                  <span>{fmt(note.updatedAt)}</span>
                </div>
                {note.title && <div className="mt-1 text-xs font-semibold text-black/65">{note.title}</div>}
                <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-black/70">{note.body || '（空便签）'}</div>
              </article>
            ))}
          </div>
        </section>



        <section className="mt-4 grid gap-4 lg:grid-cols-3" aria-label="信箱 记忆 日历">
          <div id="shared-letters" className="rounded-[28px] border border-black/[0.07] bg-white/75 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">信箱</h2>
              <span className="text-[10px] text-black/35">最近 {data?.recentLetters?.length || 0} 封</span>
            </div>
            <div className="mt-4 space-y-3">
              {!data?.recentLetters?.length && <div className="text-xs text-black/35">暂时没有共享信件。</div>}
              {data?.recentLetters?.map(letter => (
                <article key={letter.id} className="rounded-2xl bg-black/[0.035] p-3">
                  <div className="flex justify-between gap-2 text-[10px] text-black/35">
                    <span>{letter.author === 'xiaoci' ? '小词' : '老师'}</span>
                    <span>{fmt(letter.updatedAt)}</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-black/70">{letter.title || '无标题'}</div>
                  <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-black/60">{shortText(letter.body, 180) || '（空信件）'}</div>
                </article>
              ))}
            </div>
          </div>

          <div id="shared-memories" className="rounded-[28px] border border-black/[0.07] bg-white/75 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">共享记忆</h2>
              <span className="text-[10px] text-black/35">最近 {data?.recentMemories?.length || 0} 条</span>
            </div>
            {data?.randomMemory && (
              <article className="mt-4 rounded-2xl border border-[#7D3037]/10 bg-red-50/70 p-3">
                <div className="text-[10px] font-semibold text-[#7D3037]">随机翻到一条旧记忆</div>
                <div className="mt-1 text-xs font-semibold text-black/70">{data.randomMemory.title || '无标题'}</div>
                <div className="mt-1 text-xs leading-5 text-black/60">{shortText(data.randomMemory.body, 160) || '（空记录）'}</div>
              </article>
            )}
            <div className="mt-3 space-y-3">
              {!data?.recentMemories?.length && <div className="text-xs text-black/35">暂时没有共享记忆。</div>}
              {data?.recentMemories?.map(memory => (
                <article key={memory.id} className="rounded-2xl bg-black/[0.035] p-3">
                  <div className="flex justify-between gap-2 text-[10px] text-black/35">
                    <span>{memory.author === 'xiaoci' ? '小词' : '老师'}</span>
                    <span>{fmt(memory.updatedAt)}</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-black/70">{memory.title || '无标题'}</div>
                  <div className="mt-1 text-xs leading-5 text-black/60">{shortText(memory.body, 150) || '（空记录）'}</div>
                </article>
              ))}
            </div>
          </div>

          <div id="shared-calendar" className="rounded-[28px] border border-black/[0.07] bg-white/75 p-5">
            <h2 className="text-sm font-semibold">接下来的日历</h2>
            <div className="mt-4 space-y-3">
              {!data?.upcomingCalendar?.length && <div className="text-xs text-black/35">近期没有共享日历项目。</div>}
              {data?.upcomingCalendar?.map(item => {
                const startsAt = Number(item.payload?.startsAt || 0);
                return (
                  <article key={item.id} className="rounded-2xl bg-black/[0.035] p-3">
                    <div className="text-[10px] text-black/35">{startsAt ? fmt(startsAt) : '未设置时间'}</div>
                    <div className="mt-1 text-xs font-semibold text-black/70">{item.title || '无标题日程'}</div>
                    {item.body && <div className="mt-1 text-xs leading-5 text-black/60">{shortText(item.body, 150)}</div>}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2" aria-label="共享会话和共享记录">
          <div id="shared-sessions" className="rounded-[28px] border border-black/[0.07] bg-white/75 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">进行中的共享活动</h2>
              <span className="text-[10px] text-black/35">{data?.activeSessions?.length || 0} 个</span>
            </div>
            <div className="mt-4 space-y-3">
              {!data?.activeSessions?.length && <div className="text-xs text-black/35">目前没有进行中或暂停中的共享活动。</div>}
              {data?.activeSessions?.map(session => (
                <article key={session.id} className="rounded-2xl bg-black/[0.035] p-3">
                  <div className="flex flex-wrap justify-between gap-2 text-[10px] text-black/35">
                    <span>{session.kind} · {session.status}</span>
                    <span>{fmt(session.updatedAt)}</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-black/70">{session.title || session.id}</div>
                  <div className="mt-1 break-words text-xs leading-5 text-black/55">{previewValue(session.payload, 220) || '（无附加状态）'}</div>
                </article>
              ))}
            </div>
          </div>

          <div id="recent-shared-entries" className="rounded-[28px] border border-black/[0.07] bg-white/75 p-5">
            <h2 className="text-sm font-semibold">最近共享记录</h2>
            <div className="mt-4 space-y-3">
              {!data?.recentEntries?.length && <div className="text-xs text-black/35">暂时没有通用共享记录。</div>}
              {data?.recentEntries?.map(entry => (
                <article key={entry.id} className="rounded-2xl bg-black/[0.035] p-3">
                  <div className="flex flex-wrap justify-between gap-2 text-[10px] text-black/35">
                    <span>{entry.appType} · {entry.author === 'xiaoci' ? '小词' : '老师'} · {entry.visibility}</span>
                    <span>{fmt(entry.updatedAt)}</span>
                  </div>
                  {entry.title && <div className="mt-1 text-xs font-semibold text-black/70">{entry.title}</div>}
                  <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-black/60">{shortText(entry.body, 180) || previewValue(entry.payload, 180) || '（无文本内容）'}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="shared-resources" className="mt-4 rounded-[28px] border border-black/[0.07] bg-white/75 p-5" aria-label="最近共享资源">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">最近共享资源</h2>
              <p className="mt-1 text-[11px] text-black/40">相册、Spark、小小窝等 App 同步到服务器的共享资源会出现在这里。</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(data?.resourceCounts || {}).map(([kind, count]) => (
                <span key={kind} className="rounded-full bg-black/[0.045] px-2.5 py-1 text-[10px] text-black/50">{kind} {count}</span>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {!data?.recentResources?.length && <div className="text-xs text-black/35">暂时没有共享资源。</div>}
            {data?.recentResources?.map(resource => (
              <article key={`${resource.kind}:${resource.id}`} className="rounded-2xl bg-black/[0.035] p-3">
                <div className="flex flex-wrap justify-between gap-2 text-[10px] text-black/35">
                  <span>{resource.kind}{resource.scope ? ` · ${resource.scope}` : ''} · {resource.updatedBy === 'xiaoci' ? '小词' : '老师'}</span>
                  <span>{fmt(resource.updatedAt)}</span>
                </div>
                <div className="mt-1 break-words text-xs leading-5 text-black/60">{previewValue(resource.payload, 260) || '（无文本预览）'}</div>
              </article>
            ))}
          </div>
        </section>


        {claimedWake && (
          <section className="mt-4 rounded-[24px] border border-red-900/10 bg-red-50 p-4">
            <div className="text-xs text-black/55">这次把老师叫回来的原因</div>
            <div className="mt-1 text-sm font-semibold">{claimedWake.reason}</div>
            <div className="mt-2 grid gap-1 text-[10px] text-black/40 sm:grid-cols-2">
              <div>优先级：{claimedWake.priority}</div>
              <div>创建：{fmt(claimedWake.createdAt)}</div>
              <div className="sm:col-span-2">Signal ID：{claimedWake.id}</div>
              {claimedWake.payload && <div className="break-words sm:col-span-2">附加信息：{previewValue(claimedWake.payload, 300)}</div>}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                disabled={resolvingWake}
                onClick={() => void resolveWake('acted')}
                className="rounded-full bg-[#7D3037] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                处理完了
              </button>
              <button
                disabled={resolvingWake}
                onClick={() => void resolveWake('no_action')}
                className="rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-semibold text-black/55 disabled:opacity-40"
              >
                今天先不做
              </button>
            </div>
          </section>
        )}

        {!claimedWake && data?.pendingWake && (
          <section className="mt-4 rounded-[24px] border border-red-900/10 bg-red-50 p-4 text-xs">
            <span className="font-semibold">有一个等待领取的 WakeSignal：</span> {data.pendingWake.reason}
          </section>
        )}
      </div>
    </div>
  );
};

export default TeacherHomeGate;
