import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarBlank, Camera, Clock, EnvelopeSimple, FolderSimple, Gear,
  Heart, House, ImageSquare, MapPin, MusicNote, NotePencil, Phone,
  Sparkle, Storefront, Wallet, CloudSun, ListHeart, Shapes, FlowerTulip,
  ChatCircleDots, Compass, GridFour,
} from '@phosphor-icons/react';
import { AppID } from '../../types';
import { useOS } from '../../context/OSContext';
import PrivateAppIcon from './PrivateAppIcon';

type Tile = {
  id: AppID;
  label: string;
  icon: React.ReactNode;
  variant?: 'paper' | 'red' | 'pink' | 'map';
};

const APPS: Tile[] = [
  { id: AppID.Schedule, label: 'Calendar', icon: <CalendarBlank size={31} weight="duotone" /> },
  { id: AppID.Gallery, label: 'Photos', icon: <FlowerTulip size={31} weight="duotone" /> },
  { id: AppID.Date, label: 'Camera', icon: <Camera size={31} weight="duotone" /> },
  { id: AppID.HotNews, label: 'Weather', icon: <CloudSun size={31} weight="fill" />, variant: 'red' },

  { id: AppID.Journal, label: 'Notes', icon: <NotePencil size={31} weight="duotone" /> },
  { id: AppID.SpecialMoments, label: 'Clock', icon: <Clock size={31} weight="duotone" /> },
  { id: AppID.Browser, label: 'Maps', icon: <MapPin size={31} weight="fill" />, variant: 'map' },
  { id: AppID.Handbook, label: 'Reminders', icon: <ListHeart size={31} weight="duotone" /> },

  { id: AppID.Music, label: 'Music', icon: <MusicNote size={31} weight="fill" />, variant: 'red' },
  { id: AppID.Game, label: 'App Store', icon: <Shapes size={31} weight="fill" />, variant: 'pink' },
  { id: AppID.Settings, label: 'Settings', icon: <Gear size={31} weight="fill" /> },
  { id: AppID.Bank, label: 'Files', icon: <FolderSimple size={31} weight="fill" />, variant: 'pink' },

  { id: AppID.Chat, label: 'Mail', icon: <EnvelopeSimple size={31} weight="regular" /> },
  { id: AppID.MemoryPalace, label: 'Health', icon: <Heart size={31} weight="fill" />, variant: 'red' },
  { id: AppID.CheckPhone, label: 'Wallet', icon: <Wallet size={31} weight="fill" /> },
  { id: AppID.Worldbook, label: 'Shortcuts', icon: <Shapes size={31} weight="fill" />, variant: 'pink' },
];

const DOCK: Tile[] = [
  { id: AppID.Call, label: 'Phone', icon: <Phone size={31} weight="fill" />, variant: 'paper' },
  { id: AppID.Social, label: 'Messages', icon: <ChatCircleDots size={31} weight="fill" />, variant: 'pink' },
  { id: AppID.Browser, label: 'Safari', icon: <Compass size={31} weight="fill" />, variant: 'paper' },
  { id: AppID.Music, label: 'Music', icon: <MusicNote size={31} weight="fill" />, variant: 'paper' },
];

const PrivateLauncher: React.FC = () => {
  const { openApp } = useOS();
  const [now, setNow] = useState(() => new Date());
  const [mascotMissing, setMascotMissing] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const time = useMemo(
    () => now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    [now],
  );

  return (
    <div className="xp-home-wallpaper relative h-full w-full overflow-hidden bg-[#FFF8EF] text-[#7D3037]">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-7 pt-[max(1.05rem,var(--safe-top,0px))] text-[17px] font-bold text-[#B8424E]">
        <span>{time}</span>
        <div className="flex items-center gap-2 text-[15px]">
          <span className="tracking-[-.14em]">▮▮▮</span>
          <span className="text-[16px]">⌁</span>
          <span className="inline-block h-[13px] w-[23px] rounded-[4px] border-2 border-[#B8424E]">
            <span className="m-[2px] block h-[5px] rounded-[2px] bg-[#B8424E]" />
          </span>
        </div>
      </div>

      <main className="relative z-10 mx-auto h-full w-full max-w-[430px] px-7 pt-[max(8.7rem,calc(var(--safe-top,0px)+7.5rem))]">
        <div className="grid grid-cols-4 gap-x-5 gap-y-[22px]">
          {APPS.map(app => (
            <button
              key={app.id + app.label}
              onClick={() => openApp(app.id)}
              className="xp-press flex min-w-0 flex-col items-center gap-[7px]"
            >
              <PrivateAppIcon appId={app.id + '-' + app.label.toLowerCase().replace(/\s+/g,'-')} fallback={app.icon} variant={app.variant} />
              <span className="max-w-[74px] truncate text-center text-[12px] font-semibold tracking-[-0.01em] text-[#9B3C45]">
                {app.label}
              </span>
            </button>
          ))}
        </div>

        <div className="absolute bottom-[136px] left-1/2 flex -translate-x-1/2 items-center gap-2">
          <span className="h-[7px] w-[7px] rounded-full bg-[#D74B56]" />
          <span className="h-[7px] w-[7px] rounded-full bg-[#D8C7C4]" />
        </div>
      </main>

      {!mascotMissing && (
        <img
          src="/media/private/brand/peek.png"
          alt=""
          onError={() => setMascotMissing(true)}
          className="pointer-events-none absolute bottom-[99px] right-[18px] z-[15] w-[150px] select-none object-contain"
        />
      )}

      {mascotMissing && (
        <div className="pointer-events-none absolute bottom-[105px] right-[26px] z-[15] h-[112px] w-[142px]">
          <div className="absolute bottom-0 right-2 h-[92px] w-[118px] rounded-t-[58px] border-[5px] border-[#C65C65] border-b-0 bg-[#FFF8EF]" />
          <div className="absolute bottom-[38px] right-[30px] h-[8px] w-[8px] rounded-full bg-[#B8424E]" />
          <div className="absolute bottom-[38px] right-[78px] h-[8px] w-[8px] rounded-full bg-[#B8424E]" />
          <div className="absolute bottom-[22px] right-[53px] h-[5px] w-[5px] rounded-full bg-[#E1A84B]" />
          <div className="absolute right-0 top-0 h-[40px] w-[56px] rounded-[16px] bg-[#D94B55]" />
        </div>
      )}

      <div className="xp-dock absolute bottom-[max(1.05rem,var(--safe-bottom,0px))] left-1/2 z-30 w-[calc(100%-34px)] max-w-[396px] -translate-x-1/2 rounded-[34px] px-5 py-[12px]">
        <div className="flex items-center justify-between">
          {DOCK.map(app => (
            <button key={app.id + app.label} onClick={() => openApp(app.id)} className="xp-press">
              <PrivateAppIcon appId={'dock-' + app.id} fallback={app.icon} variant={app.variant} size="sm" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PrivateLauncher;
