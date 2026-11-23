import { ReactNode, useEffect, useState } from 'react';
import type { RewardResult } from '../game';
import { RARITY_COLOR, RARITY_LABEL } from '../game';
import { day, previousWeight, useStore } from '../store';

/** 素材网格边长（px）：普通图标 32，大图 64，见 tools/pixelate_assets.py */
const gridOf = (n: string) => (n.endsWith('_lg') || n === 'sleep' || n === 'stage' ? (n === 'skull_lg' ? 48 : 64) : 32);

/** 把显示尺寸取整到「素材像素 × 设备像素比」的整数倍，保证每个素材像素占整数个物理像素 */
export function snapSize(s: number, grid: number) {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const unit = grid / dpr; // 1 倍放大时的 CSS 尺寸
  return Math.max(1, Math.round(s / unit)) * unit;
}

export const Ico = ({ n, s = 32, className = '', style, h }: { n: string; s?: number; className?: string; style?: React.CSSProperties; h?: number }) => {
  const w = snapSize(s, gridOf(n));
  return <img className={'ico ' + className} src={`/img/${n}.png`} width={w} height={h ? (w * h) / s : w} alt="" style={style} />;
};

export const Panel = ({ children, className = '', onClick, style }: { children: ReactNode; className?: string; onClick?: () => void; style?: React.CSSProperties }) => (
  <div className={'panel ' + className} onClick={onClick} style={style}>
    {children}
  </div>
);

export const Bar = ({ v, max, color = 'var(--stamina)', h }: { v: number; max: number; color?: string; h?: number }) => (
  <div className="bar" style={h ? { height: h } : undefined}>
    <i style={{ width: `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`, backgroundColor: color }} />
  </div>
);

export const Title = ({ children, icon }: { children: ReactNode; icon?: string }) => (
  <h3 className="section-title">{icon && <Ico n={icon} s={24} />}{children}</h3>
);

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function RewardModal({ r, onClose }: { r: RewardResult; onClose: () => void }) {
  const todayW = useStore((s) => day(s).weight);
  const prevW = useStore((s) => previousWeight(s));
  return (
    <Modal onClose={onClose}>
      <Panel className="col" style={{ gap: 12 }}>
        <h1 className="center gold fs-xxl">{r.levelUp ? '升级了!' : '任务完成!'}</h1>
        <div className="row" style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
          <Ico n="star" s={24} style={{ marginTop: 16 }} />
          <Ico n="knight_lg" s={128} />
          <Ico n="star" s={24} style={{ marginTop: 48 }} />
        </div>
        <div className="panel center" style={{ background: 'var(--outline)' }}>{r.title}</div>
        <div className="col" style={{ gap: 8 }}>
          <div className="row"><Ico n="bolt" s={28} /><span className="fs-l">+{r.power} 战力</span></div>
          <div className="row">
            <Ico n="star" s={28} />
            <span className="fs-l">+{r.xp} XP</span>
            <div className="grow col" style={{ gap: 4 }}>
              <span className="small dim" style={{ textAlign: 'right' }}>Lv.{r.level} · {r.xpPct}%</span>
              <Bar v={r.xpPct} max={100} color="var(--xp)" />
            </div>
          </div>
          <div className="row"><Ico n="coin" s={28} /><span className="fs-l">+{r.coins} 金币</span></div>
          {r.drop && (
            <div className="row">
              <Ico n={r.drop.icon} s={28} />
              <span className="grow">掉落：{r.drop.name}</span>
              <span className="tag" style={{ background: RARITY_COLOR[r.drop.rarity] }}>{RARITY_LABEL[r.drop.rarity]}</span>
            </div>
          )}
          {r.levelUp && <div className="center gold">等级提升到 Lv.{r.levelUp}！</div>}
          <div className="panel deep row" style={{ padding: 8 }}>
            <Ico n="scale" s={24} />
            <span className="grow nowrap">今日体重</span>
            {todayW ? (
              <span className="fs-l">
                {todayW} kg
                {prevW ? <span className={todayW <= prevW ? 'green' : ''}> {todayW <= prevW ? '' : '+'}{(todayW - prevW).toFixed(1)}</span> : null}
              </span>
            ) : (
              <span className="small dim" style={{ textAlign: 'right' }}>未记录<br />去「＋记录」称一下</span>
            )}
          </div>
        </div>
        <button className="btn big" onClick={onClose}>领取奖励</button>
      </Panel>
    </Modal>
  );
}

let toastSet: ((s: string) => void) | null = null;
export const toast = (s: string) => toastSet?.(s);
export function ToastHost() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    toastSet = setMsg;
    return () => void (toastSet = null);
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 1800);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? <div className="toast">{msg}</div> : null;
}

/** 读取图片并压缩到最长边 maxSide，返回 JPEG data URL（发给视觉模型用） */
export function fileToDataUrl(file: File, maxSide = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export const fmtMin = (m?: number | null) => (m == null ? '--' : `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}m`);
