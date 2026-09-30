import React, { useEffect, useMemo, useState } from 'react';
import { AppID } from '../../types';
import { useOS } from '../../context/OSContext';
import { resolveSharedActor } from '../../utils/shared/identity';
import { isSharedApiEnabled, sharedRequest } from '../../utils/shared/sharedClient';
import { recordSharedActivity } from '../../utils/shared/activity';
import { createSharedEntry, listSharedEntries } from '../../utils/shared/domain';
import type { SharedEntry } from '../../utils/shared/types';
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

  if (!visible) return null;

  const enterApp = (id: AppID) => {
    void recordSharedActivity('teacher.enter_app', 'app', id);
    openApp(id);
    setVisible(false);
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

        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
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

        {claimedWake && (
          <section className="mt-4 rounded-[24px] border border-red-900/10 bg-red-50 p-4">
            <div className="text-xs text-black/55">这次把老师叫回来的原因</div>
            <div className="mt-1 text-sm font-semibold">{claimedWake.reason}</div>
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
