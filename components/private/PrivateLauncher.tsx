import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpenText, CalendarDots, Camera, House, ImagesSquare, MusicNotes, Notebook,
  Phone, Sparkle, SquaresFour, Wallet, Wrench, Brain, GameController, Books,
  Globe, Heart, GearSix, UsersThree, PenNib, ClockCounterClockwise,
} from '@phosphor-icons/react';
import { AppID } from '../../types';
import { useOS } from '../../context/OSContext';

type AppTile = {
  id: AppID;
  label: string;
  sub?: string;
  icon: React.ReactNode;
};

const PRIMARY: AppTile[] = [
  { id: AppID.Journal, label: '交换日记', sub: '今天写一点给对方', icon: <Notebook size={24} weight="light" /> },
  { id: AppID.Gallery, label: '相册', sub: '共同留下的照片', icon: <ImagesSquare size={24} weight="light" /> },
  { id: AppID.Room, label: '小小窝', sub: '我们放东西的房间', icon: <House size={24} weight="light" /> },
  { id: AppID.Social, label: '动态', sub: '随手发一点生活', icon: <Sparkle size={24} weight="light" /> },
  { id: AppID.Schedule, label: '日历', sub: '纪念日和未来安排', icon: <CalendarDots size={24} weight="light" /> },
  { id: AppID.CheckPhone, label: '查手机', sub: '看看彼此留下的痕迹', icon: <Phone size={24} weight="light" /> },
];

const SECONDARY: AppTile[] = [
  { id: AppID.MemoryPalace, label: '记忆', icon: <Brain size={22} weight="light" /> },
  { id: AppID.Handbook, label: '手账', icon: <BookOpenText size={22} weight="light" /> },
  { id: AppID.Music, label: '音乐', icon: <MusicNotes size={22} weight="light" /> },
  { id: AppID.Game, label: '游戏', icon: <GameController size={22} weight="light" /> },
  { id: AppID.Novel, label: '阅读', icon: <Books size={22} weight="light" /> },
  { id: AppID.Bank, label: '存钱罐', icon: <Wallet size={22} weight="light" /> },
];

const TOOLBOX: AppTile[] = [
  { id: AppID.Chat, label: '聊天', icon: <Heart size={20} weight="light" /> },
  { id: AppID.GroupChat, label: '群聊', icon: <UsersThree size={20} weight="light" /> },
  { id: AppID.Date, label: '见面', icon: <Camera size={20} weight="light" /> },
  { id: AppID.XhsFreeRoam, label: '自由活动', icon: <Globe size={20} weight="light" /> },
  { id: AppID.Study, label: '共读 / 学习', icon: <BookOpenText size={20} weight="light" /> },
  { id: AppID.LifeSim, label: '都市人生', icon: <SquaresFour size={20} weight="light" /> },
  { id: AppID.VRWorld, label: '彼方', icon: <ClockCounterClockwise size={20} weight="light" /> },
  { id: AppID.Songwriting, label: '写歌', icon: <PenNib size={20} weight="light" /> },
  { id: AppID.Worldbook, label: '世界书', icon: <BookOpenText size={20} weight="light" /> },
  { id: AppID.Browser, label: '浏览器', icon: <Globe size={20} weight="light" /> },
  { id: AppID.Settings, label: '设置', icon: <GearSix size={20} weight="light" /> },
];

const formatDate = (d: Date) =>
  new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(d);

const PrivateLauncher: React.FC = () => {
  const { openApp } = useOS();
  const [now, setNow] = useState(() => new Date());
  const [toolboxOpen, setToolboxOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const time = useMemo(
    () => now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    [now],
  );

  return (
    <div className="h-full w-full overflow-y-auto bg-[#f5f2ee] text-[#221d1a]">
      <div className="mx-auto min-h-full w-full max-w-[760px] px-5 pb-28 pt-[max(2rem,var(--safe-top,0px))]">
        <header className="flex items-start justify-between gap-6">
          <div>
            <div className="text-[11px] font-medium tracking-[0.28em] text-black/35">小词 × 老师</div>
            <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.04em]">小手机</h1>
            <div className="mt-1 text-sm text-black/45">{formatDate(now)}</div>
          </div>
          <div className="text-right">
            <div className="text-[42px] font-light leading-none tracking-[-0.06em]">{time}</div>
            <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-black/40">
              <span className="h-1.5 w-1.5 rounded-full bg-[#b91c1c]" />
              shared
            </div>
          </div>
        </header>

        <section className="mt-9">
          <div className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-black/35">一起生活</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {PRIMARY.map((app, index) => (
              <button
                key={app.id}
                onClick={() => openApp(app.id)}
                className="group min-h-[150px] rounded-[24px] border border-black/[0.07] bg-[#fffdfa] p-4 text-left shadow-[0_8px_28px_rgba(39,28,20,0.045)] transition active:scale-[0.985]"
              >
                <div className={index === 0
                  ? 'flex h-10 w-10 items-center justify-center rounded-2xl bg-[#b91c1c] text-white'
                  : 'flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eee9e3] text-black/70'}>
                  {app.icon}
                </div>
                <div className="mt-6 text-[15px] font-semibold">{app.label}</div>
                <div className="mt-1 text-[11px] leading-4 text-black/40">{app.sub}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-black/35">慢慢积起来的东西</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {SECONDARY.map(app => (
              <button
                key={app.id}
                onClick={() => openApp(app.id)}
                className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-[20px] border border-black/[0.06] bg-white/55 text-black/65 transition active:scale-[0.98]"
              >
                {app.icon}
                <span className="text-[11px] font-medium">{app.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-[26px] border border-black/[0.07] bg-[#ebe5de]/75">
          <button
            onClick={() => setToolboxOpen(v => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div>
              <div className="text-sm font-semibold">工具箱</div>
              <div className="mt-0.5 text-[11px] text-black/40">技术底座里还保留的功能，收在这里。</div>
            </div>
            <Wrench size={20} weight="light" className="text-black/50" />
          </button>
          {toolboxOpen && (
            <div className="grid grid-cols-2 gap-px overflow-hidden border-t border-black/[0.06] bg-black/[0.05] sm:grid-cols-3">
              {TOOLBOX.map(app => (
                <button
                  key={app.id}
                  onClick={() => openApp(app.id)}
                  className="flex items-center gap-3 bg-[#f5f2ee] px-4 py-4 text-left text-xs text-black/65"
                >
                  {app.icon}
                  <span>{app.label}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-10 border-t border-black/[0.06] pt-4 text-[10px] tracking-[0.08em] text-black/25">
          shared phone · private build
        </footer>
      </div>
    </div>
  );
};

export default PrivateLauncher;
