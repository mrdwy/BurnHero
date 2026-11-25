import type { Go } from '../App';
import { useStore } from '../store';
import { ATTR_LABEL, ITEMS, RARITY_COLOR, SLOTS, power } from '../game';
import { Bar, Ico, Panel } from '../components/ui';
import { clsSprite } from './Onboarding';
import { clsLabel } from '../llm';
import type { Attr } from '../types';

const ATTR_META: Record<Attr, { icon: string; color: string; src: string }> = {
  str: { icon: 'dumbbell', color: 'var(--hp)', src: '力量训练' },
  end: { icon: 'boot', color: 'var(--stamina)', src: '步数、有氧' },
  agi: { icon: 'moon', color: 'var(--water)', src: '睡眠' },
  wil: { icon: 'bolt', color: 'var(--xp)', src: '饮食、喝水、记录' },
};

export default function Character({ go }: { go: Go }) {
  const s = useStore((x) => x);
  const p = s.profile!;
  const maxAttr = Math.max(20, ...Object.values(s.hero.attrs));
  const flames = Math.min(7, s.hero.streak);

  return (
    <div className="screen">
      <div className="row between">
        <button className="btn ghost small" onClick={() => go('onlineGuild')}>线上战队</button>
        <button className="btn ghost small" onClick={() => go('settings')}><Ico n="gear" s={20} />设置</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 12, alignItems: 'center' }}>
        <div className="stage" style={{ width: 128, height: 136 }}>
          <Ico n="stage" s={128} h={64} className="base" />
          <Ico n={clsSprite(p.cls, true)} s={112} className="bounce" style={{ position: 'relative', marginBottom: 28 }} />
        </div>
        <div className="col g8">
          <span className="fs-l nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
          <span className="row" style={{ gap: 8 }}>
            <span className="gold">Lv.{s.hero.level}</span>
            <span className="small dim">{clsLabel(p.cls)}</span>
          </span>
          <span className="chip" style={{ border: '2px solid var(--accent)', alignSelf: 'flex-start' }}>称号：{s.hero.title}</span>
        </div>
      </div>

      <Panel className="row between">
        <span className="row gold" style={{ gap: 4 }}><Ico n="bolt" s={32} /><span className="fs-l">战力</span></span>
        <span className="gold fs-xxl nowrap">{power(s)}</span>
      </Panel>

      <Panel className="col g8">
        {(Object.keys(ATTR_LABEL) as Attr[]).map((k) => (
          <div key={k} className="row">
            <Ico n={ATTR_META[k].icon} s={24} />
            <span style={{ width: 40 }}>{ATTR_LABEL[k]}</span>
            <span className="xs dim" style={{ width: 32 }}>{k.toUpperCase()}</span>
            <span style={{ width: 32, textAlign: 'right' }}>{Math.floor(s.hero.attrs[k])}</span>
            <div className="grow"><Bar v={s.hero.attrs[k]} max={maxAttr} color={ATTR_META[k].color} /></div>
          </div>
        ))}
        <div className="grid2 xs dim" style={{ gap: 4 }}>
          {(Object.keys(ATTR_META) as Attr[]).map((k) => <span key={k}>{ATTR_LABEL[k]} ← {ATTR_META[k].src}</span>)}
        </div>
      </Panel>

      <div className="grid3">
        {SLOTS.map((slot) => {
          const it = ITEMS[s.equipped[slot]];
          return (
            <Panel key={slot} className="slot" style={{ padding: 8, ...(it ? { borderColor: RARITY_COLOR[it.rarity] } : {}) }}>
              {it ? <Ico n={it.icon} s={32} /> : <span className="dim fs-xl">＋</span>}
              <span className="small">{it ? it.name : slot}</span>
              {it && <span className="xs gold">+{it.power}</span>}
            </Panel>
          );
        })}
      </div>
      <span className="small dim center">完成任务有概率掉落装备，掉落后自动穿戴。</span>

      <Panel className="row between">
        <span>连续打卡 <span className="gold fs-xl">{s.hero.streak}</span> 天</span>
        <div className="row" style={{ gap: 4 }}>
          {Array.from({ length: 7 }, (_, i) => <Ico key={i} n="bolt" s={20} className={i < flames ? '' : 'locked'} />)}
        </div>
      </Panel>
    </div>
  );
}
