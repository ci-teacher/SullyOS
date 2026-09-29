import React from 'react';
import {
  ArrowLeft, BookOpenText, CalendarBlank, Detective, DiceFive, EnvelopeSimple,
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

const PrivateModulePlaceholder: React.FC<{ module: PrivateModuleId; onBack: () => void }> = ({ module, onBack }) => {
  const item = MODULES[module];

  return (
    <div className="xp-private-app-page">
      <header className="xp-private-app-header">
        <button type="button" className="xp-private-back" onClick={onBack} aria-label="返回桌面">
          <ArrowLeft size={18} weight="bold" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="xp-private-eyebrow">SHARED APP</div>
          <h1 className="xp-private-title">{item.title}</h1>
        </div>
        <div className="xp-private-header-mark">{item.icon}</div>
      </header>

      <div className="xp-private-pattern xp-private-pattern-dots" />

      <main className="xp-private-app-content">
        <p className="xp-private-subtitle">{item.subtitle}</p>
        <section className="xp-private-card">
          <div className="xp-private-card-kicker">UNDER CONSTRUCTION</div>
          <p className="xp-private-body">{item.detail}</p>
        </section>
      </main>
    </div>
  );
};

export default PrivateModulePlaceholder;
