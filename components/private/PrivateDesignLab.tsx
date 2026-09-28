import React, { useMemo, useState } from 'react';

type LabState = {
  accent: string;
  logo: string;
  iconSize: number;
  iconRadius: number;
  gridGapX: number;
  gridGapY: number;
  shadowAlpha: number;
  dockBlur: number;
  dotSpacing: number;
  patternOpacity: number;
  pagePadding: number;
  titleSize: number;
};

const DEFAULT: LabState = {
  accent: '#FF3300',
  logo: '#B5ADAC',
  iconSize: 60,
  iconRadius: 14,
  gridGapX: 22,
  gridGapY: 24,
  shadowAlpha: 0.055,
  dockBlur: 18,
  dotSpacing: 13,
  patternOpacity: 0.16,
  pagePadding: 22,
  titleSize: 17,
};

const PRESETS: Array<{ name: string; note: string; value: Partial<LabState> }> = [
  { name: 'A · 干净', note: '先看比例和留白', value: { iconSize: 60, iconRadius: 14, gridGapX: 22, gridGapY: 24, shadowAlpha: 0.04, patternOpacity: 0.10 } },
  { name: 'B · 更软', note: '圆角稍大', value: { iconSize: 61, iconRadius: 16, gridGapX: 21, gridGapY: 25, shadowAlpha: 0.03, patternOpacity: 0.16 } },
  { name: 'C · 利落', note: '收圆角、放间距', value: { iconSize: 59, iconRadius: 12, gridGapX: 25, gridGapY: 27, shadowAlpha: 0.025, patternOpacity: 0.08 } },
];

const marks = ['circle','bar','double','dotgrid','ring','corner','pill','cross','line','tiny','square','pair'];

const Mark: React.FC<{ kind: string; color: string }> = ({ kind, color }) => {
  if (kind === 'circle') return <span style={{ width: 18, height: 18, borderRadius: 999, border: '2px solid ' + color }} />;
  if (kind === 'bar') return <span style={{ width: 22, height: 8, borderRadius: 999, background: color }} />;
  if (kind === 'double') return <span style={{ position: 'relative', width: 24, height: 20 }}><i style={{ position:'absolute', left:1, top:3, width:14, height:14, borderRadius:4, border:'2px solid ' + color }} /><i style={{ position:'absolute', right:1, bottom:1, width:11, height:11, borderRadius:999, background:color, opacity:.55 }} /></span>;
  if (kind === 'dotgrid') return <span style={{ width: 22, height: 22, backgroundImage:'radial-gradient(circle, ' + color + ' 2px, transparent 2.2px)', backgroundSize:'8px 8px' }} />;
  if (kind === 'ring') return <span style={{ width: 21, height: 21, borderRadius:999, boxShadow:'inset 0 0 0 5px ' + color }} />;
  if (kind === 'corner') return <span style={{ width: 20, height: 20, borderLeft:'3px solid ' + color, borderBottom:'3px solid ' + color, borderRadius:'0 0 0 6px' }} />;
  if (kind === 'pill') return <span style={{ width: 12, height: 24, borderRadius:999, background:color }} />;
  if (kind === 'cross') return <span style={{ position:'relative', width:22, height:22 }}><i style={{ position:'absolute', left:9, top:1, width:4, height:20, borderRadius:999, background:color }} /><i style={{ position:'absolute', left:1, top:9, width:20, height:4, borderRadius:999, background:color }} /></span>;
  if (kind === 'line') return <span style={{ width:24, height:2, borderRadius:999, background:color }} />;
  if (kind === 'tiny') return <span style={{ width:8, height:8, borderRadius:3, background:color }} />;
  if (kind === 'square') return <span style={{ width:18, height:18, borderRadius:4, background:color }} />;
  return <span style={{ display:'flex', gap:4 }}><i style={{ width:8, height:18, borderRadius:4, background:color }} /><i style={{ width:8, height:18, borderRadius:4, background:color, opacity:.55 }} /></span>;
};

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
}> = ({ label, value, min, max, step = 1, onChange, suffix = '' }) => (
  <label className="block">
    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
      <span className="font-semibold text-black/65">{label}</span>
      <span className="font-mono text-[11px] text-black/35">{Number(value.toFixed(3))}{suffix}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={event => onChange(Number(event.target.value))}
      className="w-full accent-[#FF3300]"
    />
  </label>
);

const PrivateDesignLab: React.FC = () => {
  const [state, setState] = useState<LabState>(() => {
    try {
      const raw = localStorage.getItem('xiaoci_design_lab_v1');
      return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
    } catch {
      return DEFAULT;
    }
  });

  const update = (key: keyof LabState, value: string | number) => {
    setState(prev => {
      const next = { ...prev, [key]: value } as LabState;
      try { localStorage.setItem('xiaoci_design_lab_v1', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const previewStyle = useMemo<React.CSSProperties>(() => ({
    ['--lab-accent' as string]: state.accent,
    ['--lab-logo' as string]: state.logo,
    ['--lab-icon' as string]: state.iconSize + 'px',
    ['--lab-icon-radius' as string]: state.iconRadius + 'px',
    ['--lab-gap-x' as string]: state.gridGapX + 'px',
    ['--lab-gap-y' as string]: state.gridGapY + 'px',
    ['--lab-shadow' as string]: '0 3px 14px rgba(24,20,18,' + state.shadowAlpha + ')',
    ['--lab-pad' as string]: state.pagePadding + 'px',
    ['--lab-title' as string]: state.titleSize + 'px',
    ['--lab-dot-space' as string]: state.dotSpacing + 'px',
    ['--lab-pattern-opacity' as string]: state.patternOpacity,
    ['--lab-dock-blur' as string]: state.dockBlur + 'px',
  }), [state]);

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setState(prev => {
      const next = { ...prev, ...preset.value };
      try { localStorage.setItem('xiaoci_design_lab_v1', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const reset = () => {
    setState(DEFAULT);
    try { localStorage.setItem('xiaoci_design_lab_v1', JSON.stringify(DEFAULT)); } catch {}
  };

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
  };

  const names = ['日记','相册','房间','动态','日历','查手机','记忆','手账','音乐','游戏','阅读','设置'];

  return (
    <div className="min-h-full overflow-y-auto bg-[#f5f5f5] text-[#1b1b1b]">
      <div className="mx-auto grid min-h-full max-w-[1180px] gap-5 p-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:p-6">
        <aside className="h-fit rounded-[22px] border border-black/[0.07] bg-white p-5 shadow-sm lg:sticky lg:top-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold tracking-[0.18em] text-black/30">PRIVATE UI</div>
              <h1 className="mt-1 text-xl font-bold">Design Lab</h1>
              <p className="mt-2 text-xs leading-5 text-black/45">先调骨架。右边故意没有正式 icon，也不放插画。</p>
            </div>
            <a href="/" className="rounded-full border border-black/10 px-3 py-2 text-[11px] font-semibold text-black/50">回首页</a>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {PRESETS.map(preset => (
              <button key={preset.name} onClick={() => applyPreset(preset)} className="rounded-[14px] border border-black/[0.08] px-2 py-3 text-left active:scale-[.98]">
                <div className="text-[11px] font-bold">{preset.name}</div>
                <div className="mt-1 text-[9px] leading-3 text-black/35">{preset.note}</div>
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-5">
            <Slider label="App icon size" value={state.iconSize} min={52} max={68} onChange={v => update('iconSize', v)} suffix="px" />
            <Slider label="Icon radius" value={state.iconRadius} min={9} max={20} onChange={v => update('iconRadius', v)} suffix="px" />
            <Slider label="Grid gap X" value={state.gridGapX} min={12} max={32} onChange={v => update('gridGapX', v)} suffix="px" />
            <Slider label="Grid gap Y" value={state.gridGapY} min={16} max={34} onChange={v => update('gridGapY', v)} suffix="px" />
            <Slider label="Shadow" value={state.shadowAlpha} min={0} max={0.14} step={0.005} onChange={v => update('shadowAlpha', v)} />
            <Slider label="Page padding" value={state.pagePadding} min={16} max={30} onChange={v => update('pagePadding', v)} suffix="px" />
            <Slider label="Title size" value={state.titleSize} min={15} max={22} onChange={v => update('titleSize', v)} suffix="px" />
            <Slider label="Dot spacing" value={state.dotSpacing} min={8} max={20} onChange={v => update('dotSpacing', v)} suffix="px" />
            <Slider label="Pattern opacity" value={state.patternOpacity} min={0} max={0.45} step={0.01} onChange={v => update('patternOpacity', v)} />
            <Slider label="Dock blur" value={state.dockBlur} min={0} max={30} onChange={v => update('dockBlur', v)} suffix="px" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <label className="text-[11px] font-semibold text-black/55">
              Accent
              <input type="color" value={state.accent} onChange={e => update('accent', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-black/10 bg-white p-1" />
            </label>
            <label className="text-[11px] font-semibold text-black/55">
              Logo
              <input type="color" value={state.logo} onChange={e => update('logo', e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-black/10 bg-white p-1" />
            </label>
          </div>

          <div className="mt-5 flex gap-2">
            <button onClick={reset} className="flex-1 rounded-full border border-black/10 py-2.5 text-xs font-semibold">重置</button>
            <button onClick={() => void copy()} className="flex-1 rounded-full bg-black py-2.5 text-xs font-semibold text-white">复制参数</button>
          </div>
        </aside>

        <main className="flex min-h-[820px] items-start justify-center rounded-[28px] border border-black/[0.06] bg-white p-4 sm:p-8">
          <div style={previewStyle} className="relative h-[760px] w-[360px] overflow-hidden rounded-[38px] border border-black/[0.10] bg-white shadow-[0_20px_80px_rgba(0,0,0,.08)]">
            <div className="flex items-center justify-between px-[var(--lab-pad)] pt-5 text-[12px] font-semibold">
              <span>9:41</span>
              <span className="tracking-[.12em]">•••</span>
            </div>

            <div className="px-[var(--lab-pad)] pt-11">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-black/35">9月28日 星期一</div>
                  <div className="mt-1 text-[46px] font-semibold leading-none tracking-[-.055em]">20:53</div>
                  <div className="mt-3 text-[var(--lab-title)] font-bold">小手机</div>
                </div>
                <div
                  className="h-[76px] w-[76px] rounded-full"
                  style={{
                    opacity: 'var(--lab-pattern-opacity)' as any,
                    backgroundImage: 'radial-gradient(circle, var(--lab-logo) 2px, transparent 2.2px)',
                    backgroundSize: 'var(--lab-dot-space) var(--lab-dot-space)',
                  }}
                />
              </div>

              <div className="mt-9 grid grid-cols-4" style={{ columnGap: 'var(--lab-gap-x)', rowGap: 'var(--lab-gap-y)' }}>
                {marks.map((kind, index) => (
                  <div key={kind + index} className="flex flex-col items-center gap-2">
                    <div
                      className="flex h-[var(--lab-icon)] w-[var(--lab-icon)] items-center justify-center border border-black/[0.055] bg-white"
                      style={{ borderRadius: 'var(--lab-icon-radius)', boxShadow: 'var(--lab-shadow)' }}
                    >
                      <Mark kind={kind} color="var(--lab-logo)" />
                    </div>
                    <span className="max-w-[68px] truncate text-center text-[10px] font-medium text-black/72">{names[index]}</span>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex items-center justify-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--lab-accent)]" />
                <span className="h-1.5 w-1.5 rounded-full bg-black/10" />
                <span className="h-1.5 w-1.5 rounded-full bg-black/10" />
              </div>
            </div>

            <div className="absolute bottom-5 left-1/2 w-[306px] -translate-x-1/2 rounded-[26px] border border-black/[0.07] bg-white/80 px-5 py-3 shadow-[0_10px_30px_rgba(0,0,0,.055)] backdrop-blur-[var(--lab-dock-blur)]">
              <div className="flex items-center justify-between">
                {['circle','bar','ring','dotgrid'].map((kind, index) => (
                  <div key={kind} className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-black/[0.045] bg-white/80">
                    <Mark kind={kind} color={index === 0 ? 'var(--lab-accent)' : 'var(--lab-logo)'} />
                  </div>
                ))}
              </div>
            </div>

            <div
              className="absolute bottom-0 right-0 h-20 w-20 opacity-[var(--lab-pattern-opacity)]"
              style={{ backgroundImage: 'repeating-linear-gradient(-45deg, var(--lab-accent) 0, var(--lab-accent) 5px, transparent 5px, transparent 12px)' }}
            />
          </div>
        </main>
      </div>
    </div>
  );
};

export default PrivateDesignLab;
