import React, { useState } from 'react';
import {
  CalendarBlank, Clock, EnvelopeSimple, Gear, Heart, House,
  ImageSquare, MusicNote, NotePencil, Sparkle, ListHeart, Shapes,
  FlowerTulip, ChatCircleDots, Compass, GridFour, BookOpenText,
  FilmStrip, DiceFive, Detective,
} from '@phosphor-icons/react';
import { AppID } from '../../types';
import { useOS } from '../../context/OSContext';
import PrivateAppIcon from './PrivateAppIcon';

export type PrivateModuleId =
  | 'mailbox'
  | 'calendar'
  | 'memory'
  | 'listening'
  | 'reading'
  | 'movie'
  | 'cedar'
  | 'coc';

type Tile = {
  key: string;
  label: string;
  icon: React.ReactNode;
  variant?: 'paper' | 'red' | 'pink' | 'map';
  appId?: AppID;
  privateModule?: PrivateModuleId;
};

interface Props {
  onOpenPrivateModule: (module: PrivateModuleId) => void;
}

const APPS: Tile[] = [
  { key: 'journal', appId: AppID.Journal, label: '交换日记', icon: <NotePencil size={31} weight="duotone" /> },
  { key: 'gallery', appId: AppID.Gallery, label: '相册', icon: <FlowerTulip size={31} weight="duotone" /> },
  { key: 'mailbox', privateModule: 'mailbox', label: '信箱', icon: <EnvelopeSimple size={31} weight="regular" />, variant: 'red' },
  { key: 'calendar', privateModule: 'calendar', label: '日历', icon: <CalendarBlank size={31} weight="duotone" /> },

  { key: 'social', appId: AppID.Social, label: '动态', icon: <ChatCircleDots size={31} weight="fill" />, variant: 'pink' },
  { key: 'memory', privateModule: 'memory', label: '记忆', icon: <Heart size={31} weight="fill" />, variant: 'red' },
  { key: 'room', appId: AppID.Room, label: '小小窝', icon: <House size={31} weight="fill" /> },
  { key: 'check-phone', appId: AppID.CheckPhone, label: '查手机', icon: <GridFour size={31} weight="fill" /> },

  { key: 'listening', privateModule: 'listening', label: '一起听', icon: <MusicNote size={31} weight="fill" />, variant: 'red' },
  { key: 'reading', privateModule: 'reading', label: '共读', icon: <BookOpenText size={31} weight="duotone" /> },
  { key: 'movie', privateModule: 'movie', label: '电影', icon: <FilmStrip size={31} weight="duotone" />, variant: 'pink' },
  { key: 'cedar', privateModule: 'cedar', label: '双弈', icon: <DiceFive size={31} weight="fill" /> },

  { key: 'coc', privateModule: 'coc', label: 'COC', icon: <Detective size={31} weight="duotone" /> },
  { key: 'handbook', appId: AppID.Handbook, label: '手账', icon: <ListHeart size={31} weight="duotone" /> },
  { key: 'special', appId: AppID.SpecialMoments, label: '特别日子', icon: <Sparkle size={31} weight="fill" />, variant: 'pink' },
  { key: 'settings', appId: AppID.Settings, label: '设置', icon: <Gear size={31} weight="fill" /> },
];

const DOCK: Tile[] = [
  { key: 'dock-journal', appId: AppID.Journal, label: '交换日记', icon: <NotePencil size={31} weight="duotone" /> },
  { key: 'dock-gallery', appId: AppID.Gallery, label: '相册', icon: <ImageSquare size={31} weight="fill" />, variant: 'pink' },
  { key: 'dock-social', appId: AppID.Social, label: '动态', icon: <ChatCircleDots size={31} weight="fill" />, variant: 'red' },
  { key: 'dock-room', appId: AppID.Room, label: '小小窝', icon: <House size={31} weight="fill" /> },
];

const PrivateLauncher: React.FC<Props> = ({ onOpenPrivateModule }) => {
  const { openApp } = useOS();
  const [mascotMissing, setMascotMissing] = useState(false);

  const openTile = (tile: Tile) => {
    if (tile.privateModule) {
      onOpenPrivateModule(tile.privateModule);
      return;
    }
    if (tile.appId) openApp(tile.appId);
  };

  return (
    <div className="xp-home-wallpaper relative h-full w-full overflow-hidden bg-[#FFF8EF] text-[#7D3037]">
      <main className="relative z-10 mx-auto h-full w-full max-w-[430px] px-7 pt-[92px]">
        <div className="grid grid-cols-4 gap-x-5 gap-y-[22px]">
          {APPS.map(tile => (
            <button
              key={tile.key}
              onClick={() => openTile(tile)}
              className="xp-press flex min-w-0 flex-col items-center gap-[7px]"
            >
              <PrivateAppIcon appId={tile.key} fallback={tile.icon} variant={tile.variant} />
              <span className="max-w-[74px] truncate text-center text-[12px] font-semibold tracking-[-0.01em] text-[#9B3C45]">
                {tile.label}
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
          {DOCK.map(tile => (
            <button key={tile.key} onClick={() => openTile(tile)} className="xp-press" aria-label={tile.label}>
              <PrivateAppIcon appId={tile.key} fallback={tile.icon} variant={tile.variant} size="sm" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PrivateLauncher;
