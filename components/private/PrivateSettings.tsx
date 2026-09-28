import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle, CircleNotch, Trash, UserCircle, HardDrives } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { resolveSharedActor } from '../../utils/shared/identity';
import { isSharedApiEnabled, sharedRequest } from '../../utils/shared/sharedClient';

type Health = { ok: boolean; service?: string; now?: number };

const PrivateSettings: React.FC = () => {
  const { closeApp, systemLogs, clearLogs } = useOS();
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);
  const actor = resolveSharedActor();

  const check = async () => {
    setChecking(true);
    try {
      const result = await sharedRequest<Health>('/health', { method: 'GET' });
      setHealth(result);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { void check(); }, []);

  return (
    <div className="h-full w-full overflow-y-auto bg-[#f5f2ee] text-[#221d1a]">
      <div className="mx-auto min-h-full w-full max-w-[680px] px-5 pb-16 pt-[max(1.25rem,var(--safe-top,0px))]">
        <header className="flex items-center gap-4">
          <button onClick={closeApp} className="flex h-10 w-10 items-center justify-center rounded-full border border-black/[0.07] bg-white/70">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-semibold">设置</h1>
            <p className="mt-0.5 text-[11px] text-black/40">只保留这台小手机自己需要的东西。</p>
          </div>
        </header>

        <section className="mt-8 overflow-hidden rounded-[24px] border border-black/[0.07] bg-[#fffdfa]">
          <div className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eee9e3]"><UserCircle size={24} /></div>
            <div className="flex-1">
              <div className="text-sm font-semibold">当前身份</div>
              <div className="mt-1 text-xs text-black/45">{actor === 'laoshi' ? '老师' : '小词'}</div>
            </div>
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-[24px] border border-black/[0.07] bg-[#fffdfa]">
          <div className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eee9e3]"><HardDrives size={23} /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">共享服务器</div>
              <div className="mt-1 text-xs text-black/45">
                {!isSharedApiEnabled() ? '未配置' : health?.ok ? '连接正常 · shared-phone' : checking ? '检查中…' : '暂时没有连上'}
              </div>
            </div>
            {health?.ok ? <CheckCircle size={22} className="text-[#8d2b24]" weight="fill" /> : checking ? <CircleNotch size={22} className="animate-spin text-black/30" /> : null}
          </div>
          <button onClick={() => void check()} className="w-full border-t border-black/[0.06] px-5 py-3 text-left text-xs text-black/45">
            重新检查连接
          </button>
        </section>

        <section className="mt-4 overflow-hidden rounded-[24px] border border-black/[0.07] bg-[#fffdfa]">
          <div className="p-5">
            <div className="text-sm font-semibold">本机错误日志</div>
            <div className="mt-1 text-xs text-black/45">{systemLogs.length ? '当前有 ' + systemLogs.length + ' 条记录' : '目前干净。'}</div>
          </div>
          <button
            disabled={!systemLogs.length}
            onClick={clearLogs}
            className="flex w-full items-center gap-2 border-t border-black/[0.06] px-5 py-3 text-left text-xs text-[#9f2f2a] disabled:text-black/20"
          >
            <Trash size={15} />
            清空日志
          </button>
        </section>

        <div className="mt-8 px-1 text-[11px] leading-5 text-black/35">
          糯米机的数据库、媒体、App 生命周期和底层能力仍在工作；这里不再暴露它原来的模型配置、作者入口和产品设置。
        </div>
      </div>
    </div>
  );
};

export default PrivateSettings;
