import React from 'react';
import {
  BookOpenText, CalendarBlank, Detective, DiceFive, EnvelopeSimple,
  FilmStrip, Heart, MusicNote,
} from '@phosphor-icons/react';
import type { PrivateModuleId } from './PrivateLauncher';

const MODULES: Record<PrivateModuleId, {
  title: string;
  subtitle: string;
  detail: string;
  icon: React.ReactNode;
}> = {
  mailbox: {
    title: '信箱',
    subtitle: '给彼此留长一点的话',
    detail: '共享信件的持久化和同步已经接好，正式信箱界面还在缝。',
    icon: <EnvelopeSimple size={34} weight="regular" />,
  },
  calendar: {
    title: '日历',
    subtitle: '共同的日期、计划和纪念日',
    detail: '共享日历数据层已经接好，后面会把事件、纪念日和未来计划统一放进这里。',
    icon: <CalendarBlank size={34} weight="duotone" />,
  },
  memory: {
    title: '记忆',
    subtitle: '能找回以前发生过的东西',
    detail: '统一时间线、跨内容搜索和随机旧记忆已经接好。',
    icon: <Heart size={34} weight="fill" />,
  },
  listening: {
    title: '一起听',
    subtitle: '共享正在听的东西和进度',
    detail: 'listening session 已经能持久保存当前资源、进度和状态。',
    icon: <MusicNote size={34} weight="fill" />,
  },
  reading: {
    title: '共读',
    subtitle: '读到哪里，下次继续',
    detail: 'reading session 已经能保存书目、章节、位置和共同备注。',
    icon: <BookOpenText size={34} weight="duotone" />,
  },
  movie: {
    title: '电影',
    subtitle: '一起看过和正在看的片子',
    detail: 'movie session 已经能保存资源、观看位置和状态。',
    icon: <FilmStrip size={34} weight="duotone" />,
  },
  cedar: {
    title: '双弈',
    subtitle: 'CedarDuet 的共同游戏入口',
    detail: '房间引用和公开局面 session 已经接好，规则服务后面独立部署。',
    icon: <DiceFive size={34} weight="fill" />,
  },
  coc: {
    title: 'COC',
    subtitle: '可以长期续上的跑团入口',
    detail: '调查员状态、已公开线索、讲义和战报的共享存档已经接好。',
    icon: <Detective size={34} weight="duotone" />,
  },
};

const PrivateModulePlaceholder: React.FC<{ module: PrivateModuleId }> = ({ module }) => {
  const item = MODULES[module];

  return (
    <div className="relative h-full w-full overflow-y-auto bg-[#FFF8EF] px-7 pb-24 pt-[max(5rem,calc(var(--safe-top,0px)+4rem))] text-[#7D3037]">
      <div className="pointer-events-none absolute right-[-18px] top-8 h-40 w-40 rounded-full bg-[#D94B55]/10" />
      <div className="relative mx-auto max-w-[360px]">
        <div className="flex h-[68px] w-[68px] items-center justify-center rounded-[18px] border border-[#7D3037]/[0.08] bg-white/85 text-[#C65C65] shadow-[0_8px_20px_rgba(145,91,91,.08)]">
          {item.icon}
        </div>
        <h1 className="mt-6 text-[28px] font-bold tracking-[-0.04em]">{item.title}</h1>
        <p className="mt-2 text-[13px] font-semibold text-[#9B3C45]/70">{item.subtitle}</p>
        <div className="mt-8 rounded-[22px] border border-[#7D3037]/[0.07] bg-white/78 p-5 text-[13px] leading-6 text-[#7D3037]/65 shadow-[0_8px_26px_rgba(145,91,91,.055)]">
          {item.detail}
        </div>
      </div>
    </div>
  );
};

export default PrivateModulePlaceholder;
