import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpenText, CalendarDots, GearSix, House, ImagesSquare, MusicNotes, Notebook,
  Phone, Sparkle, Wallet, Brain, GameController, Books, ClockCounterClockwise,
} from '@phosphor-icons/react';
import { AppID } from '../../types';
import { useOS } from '../../context/OSContext';
import PrivateAppIcon from './PrivateAppIcon';
import PrivateBrandMark from './PrivateBrandMark';

type Tile = {
  id: AppID;
  label: string;
  icon: React.ReactNode;
  decorated?: 'none' | 'dots' | 'stripes';
};

const APPS: Tile[] = [
  { id: AppID.Journal, label: '交换日记', icon: <Notebook size={26} weight="regular" />, decorated: 'dots' },
  { id: AppID.Gallery, label: '相册', icon: <ImagesSquare size={26} weight="regular" /> },
  { id: AppID.Room, label: '小小窝', icon: <House size={26} weight="regular" />, decorated: 'stripes' },
  { id: AppID.Social, label: '动态', icon: <Sparkle size={26} weight="regular" /> },
  { id: AppID.Schedule, label: '日历', icon: <CalendarDots size={26} weight="regular" /> },
  { id: AppID.CheckPhone, label: '查手机', icon: <Phone size={26} weight="regular" /> },
  { id: AppID.MemoryPalace, label: '记忆', icon: <Brain size={26} weight="regular" />, decorated: 'dots' },
  { id: AppID.Handbook, label: '手账', icon: <BookOpenText size={26} weight="regular" /> },
  { id: AppID.Music, label: '音乐', icon: <MusicNotes size={26} weight="regular" /> },
  { id: AppID.Game, label: '游戏', icon: <GameController size={26} weight="regular" />, decorated: 'stripes' },
  { id: AppID.Novel, label: '阅读', icon: <Books size={26} weight="regular" /> },
  { id: AppID.Bank, label: '存钱罐', icon: <Wallet size={26} weight="regular" /> },
];

const QUICK = [
  { n: 1, label: '日记', app: AppID.Journal },
  { n: 2, label: '照片', app: AppID.Gallery },
  { n: 3, label: '今天', app: AppID.Schedule },
  { n: 4, label: '房间', app: AppID.Room },
  { n: 5, label: '记忆', app: AppID.MemoryPalace },
];

const DOCK: Tile[] = [
  APPS[0],
  APPS[1],
  APPS[2],
  { id: AppID.Settings, label: '设置', icon: <GearSix size={25} weight="regular" /> },
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
    <div className="h-full w-full overflow-y-auto bg-white pb-28 text-[#1F1F1F]">
      <main className="mx-auto w-full max-w-[620px] px-5 pt-[max(1.1rem,var(--safe-top,0px))]">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <PrivateBrandMark className="h-12 w-12" />
            <div>
              <div className="text-[22px] font-black tracking-[-0.03em]">小手机</div>
              <div className="mt-0.5 text-[10px] font-bold tracking-[0.14em] text-[#B5ADAC]">XIAOCI × LAOSHI</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[28px] font-black leading-none tracking-[-0.03em]">{time}</div>
            <div className="mt-1 text-[10px] font-bold text-[#B5ADAC]">{date}</div>
          </div>
        </header>

        <section className="mt-6">
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {QUICK.map((item, index) => (
              <button
                key={item.label}
                onClick={() => openApp(item.app)}
                className="xp-tag xp-press shrink-0"
                data-active={index === 0}
              >
                <span className="xp-tag-number">{item.n}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="relative mt-7 overflow-hidden rounded-[22px] border border-[#B5ADAC]/25 bg-white px-5 py-5">
          <div className="xp-dots-gray absolute right-0 top-0 h-full w-[32%] opacity-80" />
          <div className="relative z-10 max-w-[68%]">
            <div className="text-[18px] font-black leading-snug">我们的小手机</div>
            <div className="mt-2 text-[12px] leading-5 text-[#77716F]">
              放日记、照片和那些平常的小事。
            </div>
            <button
              onClick={() => openApp(AppID.Journal)}
              className="xp-press mt-4 inline-flex items-center rounded-full bg-[#FF3300] px-4 py-2 text-[11px] font-black text-white"
            >
              写点东西
            </button>
          </div>
          <div className="absolute bottom-4 right-5 h-10 w-16 rounded-[10px] border border-[#B5ADAC]/30 bg-white">
            <div className="xp-stripes-gray h-full w-full rounded-[10px] opacity-80" />
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="xp-section-title">应用</div>
            <ClockCounterClockwise size={18} className="text-[#B5ADAC]" />
          </div>

          <div className="grid grid-cols-4 gap-x-4 gap-y-6">
            {APPS.map(app => (
              <button
                key={app.id}
                onClick={() => openApp(app.id)}
                className="xp-press flex min-w-0 flex-col items-center gap-2"
              >
                <PrivateAppIcon
                  appId={app.id}
                  fallback={app.icon}
                  decorated={app.decorated}
                />
                <span className="w-full truncate text-center text-[11px] font-bold text-[#3C3938]">
                  {app.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8 grid grid-cols-2 gap-3">
          <button
            onClick={() => openApp(AppID.Gallery)}
            className="xp-press relative overflow-hidden rounded-[18px] border border-[#B5ADAC]/25 bg-white p-4 text-left"
          >
            <div className="xp-stripes absolute inset-x-0 top-0 h-4" />
            <div className="mt-3 text-[13px] font-black">最近相册</div>
            <div className="mt-1 text-[10px] leading-4 text-[#8A8583]">看看最近存下来的东西。</div>
          </button>

          <button
            onClick={() => openApp(AppID.Room)}
            className="xp-press relative overflow-hidden rounded-[18px] border border-[#B5ADAC]/25 bg-white p-4 text-left"
          >
            <div className="xp-dots absolute right-2 top-2 h-10 w-10 rounded-full opacity-80" />
            <div className="text-[13px] font-black">小小窝</div>
            <div className="mt-1 max-w-[72%] text-[10px] leading-4 text-[#8A8583]">进去待一会儿。</div>
          </button>
        </section>
      </main>

      <div className="fixed bottom-[max(.7rem,var(--safe-bottom,0px))] left-1/2 z-40 -translate-x-1/2 rounded-[24px] border border-[#B5ADAC]/25 bg-white/96 px-4 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,.07)] backdrop-blur-md">
        <div className="flex items-center gap-4">
          {DOCK.map(app => (
            <button key={app.id} onClick={() => openApp(app.id)} className="xp-press">
              <PrivateAppIcon appId={app.id} fallback={app.icon} size="sm" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PrivateLauncher;
