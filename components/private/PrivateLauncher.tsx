import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpenText, CalendarDots, Camera, House, ImagesSquare, MusicNotes, Notebook,
  Phone, Sparkle, Wallet, Brain, GameController, Books, GearSix, ClockCounterClockwise,
} from '@phosphor-icons/react';
import { AppID } from '../../types';
import { useOS } from '../../context/OSContext';
import PrivateAppIcon from './PrivateAppIcon';
import PrivateBrandMark from './PrivateBrandMark';

type Tile = {
  id: AppID;
  label: string;
  icon: React.ReactNode;
  variant: 'red-dots' | 'stripe' | 'gradient' | 'yellow' | 'mint' | 'blue' | 'paper';
};

const APPS: Tile[] = [
  { id: AppID.Journal, label: '交换日记', icon: <Notebook size={25} weight="bold" />, variant: 'red-dots' },
  { id: AppID.Gallery, label: '相册', icon: <ImagesSquare size={25} weight="bold" />, variant: 'gradient' },
  { id: AppID.Room, label: '小小窝', icon: <House size={25} weight="bold" />, variant: 'yellow' },
  { id: AppID.Social, label: '动态', icon: <Sparkle size={25} weight="bold" />, variant: 'stripe' },
  { id: AppID.Schedule, label: '日历', icon: <CalendarDots size={25} weight="bold" />, variant: 'blue' },
  { id: AppID.CheckPhone, label: '查手机', icon: <Phone size={25} weight="bold" />, variant: 'mint' },
  { id: AppID.MemoryPalace, label: '记忆', icon: <Brain size={25} weight="bold" />, variant: 'paper' },
  { id: AppID.Handbook, label: '手账', icon: <BookOpenText size={25} weight="bold" />, variant: 'stripe' },
  { id: AppID.Music, label: '音乐', icon: <MusicNotes size={25} weight="bold" />, variant: 'gradient' },
  { id: AppID.Game, label: '游戏', icon: <GameController size={25} weight="bold" />, variant: 'yellow' },
  { id: AppID.Novel, label: '阅读', icon: <Books size={25} weight="bold" />, variant: 'mint' },
  { id: AppID.Bank, label: '存钱罐', icon: <Wallet size={25} weight="bold" />, variant: 'blue' },
];

const QUICK = [
  { n: 1, label: '#日记', app: AppID.Journal },
  { n: 2, label: '#照片', app: AppID.Gallery },
  { n: 3, label: '#今天', app: AppID.Schedule },
  { n: 4, label: '#房间', app: AppID.Room },
  { n: 5, label: '#记忆', app: AppID.MemoryPalace },
];

const DOCK: Tile[] = [
  APPS[0], APPS[1], APPS[2],
  { id: AppID.Settings, label: '设置', icon: <GearSix size={25} weight="bold" />, variant: 'paper' },
];

const PrivateLauncher: React.FC = () => {
  const { openApp } = useOS();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const time = useMemo(
    () => now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    [now],
  );
  const date = useMemo(
    () => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(now),
    [now],
  );

  return (
    <div className="h-full w-full overflow-y-auto bg-[#fff8e8] pb-28 text-[#2c2220]">
      <header className="xp-dots-red relative overflow-hidden rounded-b-[32px] px-5 pb-5 pt-[max(1.1rem,var(--safe-top,0px))] text-[#fff8e8]">
        <div className="absolute -right-8 -top-7 h-28 w-28 rounded-full bg-[#f6b8d2]/45" />
        <div className="absolute right-10 top-16 h-8 w-8 rotate-12 rounded-[10px] bg-[#f4d878]/90" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PrivateBrandMark className="h-[54px] w-[54px] shadow-[0_4px_0_rgba(126,18,46,.12)]" />
            <div>
              <div className="text-[22px] font-black tracking-[-0.04em]">小手机</div>
              <div className="mt-0.5 text-[10px] font-semibold tracking-[0.18em] text-white/75">XIAOCI × LAOSHI</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[26px] font-black leading-none">{time}</div>
            <div className="mt-1 text-[10px] font-semibold text-white/75">{date}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[620px] px-4 pt-5">
        <section>
          <div className="mb-2 px-1 text-[12px] font-black tracking-[0.04em]">快捷标签</div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {QUICK.map((item, index) => (
              <button
                key={item.label}
                onClick={() => openApp(item.app)}
                className="xp-press flex shrink-0 items-center gap-2 rounded-full bg-[#fffdf7] px-2.5 py-2 text-[12px] font-semibold shadow-[0_2px_0_rgba(80,45,35,.05)]"
              >
                <span className="xp-tag-number" data-active={index === 0}>{item.n}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-4 flex items-end justify-between px-1">
            <div>
              <div className="text-[17px] font-black">我们的东西</div>
              <div className="mt-0.5 text-[10px] text-[#8a7770]">每天打开几次也不会烦的那种。</div>
            </div>
            <ClockCounterClockwise size={18} className="text-[#d92f4f]" weight="bold" />
          </div>

          <div className="grid grid-cols-4 gap-x-3 gap-y-5">
            {APPS.map(app => (
              <button
                key={app.id}
                onClick={() => openApp(app.id)}
                className="xp-press flex min-w-0 flex-col items-center gap-2"
              >
                <PrivateAppIcon appId={app.id} fallback={app.icon} variant={app.variant} />
                <span className="w-full truncate text-center text-[11px] font-bold">{app.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="xp-grid mt-7 overflow-hidden rounded-[24px] border border-[#d92f4f]/15">
          <button onClick={() => openApp(AppID.Journal)} className="xp-press flex w-full items-center gap-4 p-4 text-left">
            <div className="rounded-full bg-[#d92f4f] px-3 py-1 text-[10px] font-black tracking-[0.1em] text-white">TODAY</div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-black">今天也可以留一点东西</div>
              <div className="mt-0.5 text-[10px] text-[#8a7770]">一句话、一张照片、一个没头没尾的小记录都行。</div>
            </div>
          </button>
        </section>
      </main>

      <div className="fixed bottom-[max(.7rem,var(--safe-bottom,0px))] left-1/2 z-40 -translate-x-1/2 rounded-[28px] border border-[#4a2d28]/10 bg-[#fffdf7]/95 px-4 py-2.5 shadow-[0_8px_28px_rgba(75,45,40,.16)] backdrop-blur-md">
        <div className="flex items-center gap-4">
          {DOCK.map(app => (
            <button key={app.id} onClick={() => openApp(app.id)} className="xp-press">
              <PrivateAppIcon appId={app.id} fallback={app.icon} variant={app.variant} size="sm" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PrivateLauncher;
