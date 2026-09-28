import React, { Suspense, useEffect } from 'react';
import { House, X } from '@phosphor-icons/react';
import { AppID } from '../../types';
import { useOS } from '../../context/OSContext';
import PrivateLauncher from './PrivateLauncher';
import PrivateSettings from './PrivateSettings';

const Character = React.lazy(() => import('../../apps/Character'));
const Chat = React.lazy(() => import('../../apps/Chat'));
const GroupChat = React.lazy(() => import('../../apps/GroupChat'));
const ThemeMaker = React.lazy(() => import('../chat/LegacyBubbleMakerEntry'));
const Appearance = React.lazy(() => import('../../apps/Appearance'));
const Gallery = React.lazy(() => import('../../apps/Gallery'));
const DateApp = React.lazy(() => import('../../apps/DateApp'));
const UserApp = React.lazy(() => import('../../apps/UserApp'));
const JournalApp = React.lazy(() => import('../../apps/JournalApp'));
const ScheduleApp = React.lazy(() => import('../../apps/ScheduleApp'));
const RoomApp = React.lazy(() => import('../../apps/RoomApp'));
const CheckPhone = React.lazy(() => import('../../apps/CheckPhone'));
const SocialApp = React.lazy(() => import('../../apps/SocialApp'));
const StudyApp = React.lazy(() => import('../../apps/StudyApp'));
const FAQApp = React.lazy(() => import('../../apps/FAQApp'));
const GameApp = React.lazy(() => import('../../apps/GameApp'));
const WorldbookApp = React.lazy(() => import('../../apps/WorldbookApp'));
const NovelApp = React.lazy(() => import('../../apps/NovelApp'));
const BankApp = React.lazy(() => import('../../apps/BankApp'));
const XhsStockApp = React.lazy(() => import('../../apps/XhsStockApp'));
const XhsFreeRoamApp = React.lazy(() => import('../../apps/XhsFreeRoamApp'));
const BrowserApp = React.lazy(() => import('../../apps/BrowserApp'));
const SongwritingApp = React.lazy(() => import('../../apps/SongwritingApp'));
const MusicApp = React.lazy(() => import('../../apps/MusicApp'));
const CallApp = React.lazy(() => import('../../apps/CallApp'));
const VoiceDesignerApp = React.lazy(() => import('../../apps/VoiceDesignerApp'));
const GuidebookApp = React.lazy(() => import('../../apps/GuidebookApp'));
const LifeSimApp = React.lazy(() => import('../../apps/LifeSimApp'));
const MemoryPalaceApp = React.lazy(() => import('../../apps/MemoryPalaceApp'));
const HandbookApp = React.lazy(() => import('../../apps/HandbookApp'));
const QQBridge = React.lazy(() => import('../../apps/QQBridge'));
const HotNewsApp = React.lazy(() => import('../../apps/HotNewsApp'));
const VRWorldApp = React.lazy(() => import('../../apps/VRWorldApp'));
const WorldHomeApp = React.lazy(() => import('../../apps/WorldHomeApp'));
const CharCreatorDevApp = React.lazy(() => import('../../apps/CharCreatorDevApp'));
const SpecialMomentsApp = React.lazy(() => import('../ValentineEvent').then(module => ({ default: module.SpecialMomentsApp })));

const Loading = () => (
  <div className="flex h-full w-full items-center justify-center bg-[#f5f2ee] text-[11px] tracking-[0.16em] text-black/30">
    LOADING
  </div>
);

const PrivatePhoneShell: React.FC = () => {
  const {
    activeApp,
    closeApp,
    isLocked,
    unlock,
    isDataLoaded,
    toasts,
    errorDialog,
    dismissError,
  } = useOS();

  useEffect(() => {
    if (isLocked) unlock();
  }, [isLocked, unlock]);

  if (!isDataLoaded) {
    return <div className="h-full w-full bg-[#f5f2ee]" />;
  }

  const renderApp = () => {
    switch (activeApp) {
      case AppID.Launcher: return <PrivateLauncher />;
      case AppID.Settings: return <PrivateSettings />;
      case AppID.Character: return <Character />;
      case AppID.Chat: return <Chat />;
      case AppID.GroupChat: return <GroupChat />;
      case AppID.ThemeMaker: return <ThemeMaker />;
      case AppID.Appearance: return <Appearance />;
      case AppID.Gallery: return <Gallery />;
      case AppID.Date: return <DateApp />;
      case AppID.User: return <UserApp />;
      case AppID.Journal: return <JournalApp />;
      case AppID.Schedule: return <ScheduleApp />;
      case AppID.Room: return <RoomApp />;
      case AppID.CheckPhone: return <CheckPhone />;
      case AppID.Social: return <SocialApp />;
      case AppID.Study: return <StudyApp />;
      case AppID.FAQ: return <FAQApp />;
      case AppID.Game: return <GameApp />;
      case AppID.Worldbook: return <WorldbookApp />;
      case AppID.Novel: return <NovelApp />;
      case AppID.Bank: return <BankApp />;
      case AppID.XhsStock: return <XhsStockApp />;
      case AppID.SpecialMoments: return <SpecialMomentsApp />;
      case AppID.XhsFreeRoam: return <XhsFreeRoamApp />;
      case AppID.Songwriting: return <SongwritingApp />;
      case AppID.Call: return <CallApp />;
      case AppID.VoiceDesigner: return <VoiceDesignerApp />;
      case AppID.Guidebook: return <GuidebookApp />;
      case AppID.LifeSim: return <LifeSimApp />;
      case AppID.MemoryPalace: return <MemoryPalaceApp />;
      case AppID.Handbook: return <HandbookApp />;
      case AppID.QQBridge: return <QQBridge />;
      case AppID.HotNews: return <HotNewsApp />;
      case AppID.VRWorld: return <VRWorldApp />;
      case AppID.WorldHome: return <WorldHomeApp />;
      case AppID.CharCreatorDev: return <CharCreatorDevApp />;
      default: return <PrivateLauncher />;
    }
  };

  return (
    <div className="xiaoci-private relative h-full w-full overflow-hidden bg-[#fff8e8] text-[#2c2220]">
      <Suspense fallback={<Loading />}>
        <div key={activeApp} className="h-full w-full">
          {renderApp()}
        </div>
      </Suspense>

      {activeApp !== AppID.Launcher && (
        <button
          aria-label="返回小手机首页"
          onClick={closeApp}
          className="fixed bottom-[max(0.9rem,var(--safe-bottom,0px))] left-1/2 z-[80] flex h-10 -translate-x-1/2 items-center gap-2 rounded-full border border-black/[0.08] bg-[#fffdfa]/95 px-4 text-[11px] font-medium text-black/55 shadow-[0_8px_28px_rgba(30,20,16,0.12)] backdrop-blur-md active:scale-95"
        >
          <House size={15} weight="fill" />
          小手机
        </button>
      )}

      <div className="pointer-events-none fixed left-1/2 top-[max(1rem,var(--safe-top,0px))] z-[150] flex w-[min(88vw,390px)] -translate-x-1/2 flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="rounded-[18px] border border-black/[0.08] bg-[#fffdfa]/95 px-4 py-3 text-xs text-black/70 shadow-[0_12px_35px_rgba(35,20,15,0.12)] backdrop-blur-xl"
          >
            <span className={toast.type === 'error' ? 'font-semibold text-[#9f2f2a]' : 'font-semibold text-black/75'}>
              {toast.type === 'error' ? '出错了 · ' : toast.type === 'success' ? '好了 · ' : ''}
            </span>
            {toast.message}
          </div>
        ))}
      </div>

      {errorDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-black/[0.08] bg-[#fffdfa] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold">{errorDialog.title}</div>
                <div className="mt-3 max-h-[45vh] overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-black/50">
                  {errorDialog.details}
                </div>
              </div>
              <button onClick={dismissError} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.05]">
                <X size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivatePhoneShell;
