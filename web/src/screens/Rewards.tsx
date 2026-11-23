import { useState } from 'react';
import { day, latestWeight, setState, useStore } from '../store';
import { SHOP, badges, openDailyChest } from '../game';
import { Ico, Modal, Panel, Title, toast } from '../components/ui';

export default function Rewards() {
  const s = useStore((x) => x);
  const d = day(s);
  const [chest, setChest] = useState<ReturnType<typeof openDailyChest>>(null);
  const canOpen = !d.chestOpened && d.quests.some((q) => q.claimed);
  const p = s.profile!;
  const w = latestWeight(s);

  // 体重里程碑：起点到目标之间每 2kg 一个旗子（最多 4 个）
  const span = p.startWeight - p.targetWeight;
  const n = Math.max(1, Math.min(4, Math.round(span / 2)));
  const flags = Array.from({ length: n }, (_, i) => +(p.startWeight - (span * (i + 1)) / n).toFixed(1));
  const pos = Math.max(0, Math.min(1, (p.startWeight - w) / Math.max(0.1, span)));

  const buy = (id: string, cost: number, name: string) => {
    if (s.hero.coins < cost) return toast('金币不足');
    setState((x) => {
      x.hero.coins -= cost;
      x.tickets[id] = (x.tickets[id] ?? 0) + 1;
    });
    toast(`获得 ${name}`);
  };

  return (
    <div className="screen">
      <div className="row" style={{ justifyContent: 'center' }}>
        <span className="chip" style={{ fontSize: 'var(--fs-m)' }}><Ico n="coin" s={22} /> {s.hero.coins}</span>
        <span className="chip" style={{ fontSize: 'var(--fs-m)' }}><Ico n="gem" s={20} /> {s.hero.gems}</span>
      </div>

      <Panel className="row">
        <Ico n="chest_lg" s={96} className={d.chestOpened ? 'locked' : ''} />
        <div className="grow col center">
          <h2>每日宝箱</h2>
          <span className={canOpen ? 'green' : 'dim small'}>{d.chestOpened ? '今日已开启' : canOpen ? '已可开启' : '完成任意 1 个任务后解锁'}</span>
        </div>
        <button className="btn" disabled={!canOpen} onClick={() => setChest(openDailyChest())}>开启</button>
      </Panel>

      <Panel className="col">
        <Title>成就徽章</Title>
        <div className="grid4">
          {badges(s).map((b) => (
            <Panel key={b.name} className="slot" style={{ padding: 4 }}>
              {b.ok ? <Ico n={b.icon} s={36} /> : <Ico n="lock" s={32} className="locked" />}
              <span className={b.ok ? '' : 'dim'} style={{ fontSize: 'var(--fs-xs)' }}>{b.name}</span>
            </Panel>
          ))}
        </div>
      </Panel>

      <Panel className="col">
        <Title>兑换商店</Title>
        <div className="grid3">
          {SHOP.map((it) => (
            <Panel key={it.id} className="col center" style={{ alignItems: 'center', padding: 8 }}>
              <Ico n={it.icon} s={40} />
              <span style={{ fontSize: 'var(--fs-s)' }}>{it.name}</span>
              <span className="xs dim" style={{ minHeight: '4.5em' }}>{it.desc}</span>
              <span className="gold"><Ico n="coin" s={16} /> {it.cost}</span>
              {s.tickets[it.id] ? <span className="small green">已拥有 ×{s.tickets[it.id]}</span> : null}
              <button className="btn small" style={{ marginTop: 'auto' }} onClick={() => buy(it.id, it.cost, it.name)}>购买</button>
            </Panel>
          ))}
        </div>
      </Panel>

      <Panel className="col">
        <Title>体重里程碑</Title>
        <div style={{ position: 'relative', height: 76, margin: '0 20px' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 52, borderTop: '2px dashed var(--dim)' }} />
          {flags.map((f, i) => (
            <div key={f} style={{ position: 'absolute', left: `${((i + 1) / n) * 100}%`, transform: 'translateX(-50%)', textAlign: 'center', top: 8 }}>
              <div className="small">{f}kg</div>
              <Ico n="flag" s={24} className={w <= f ? '' : 'locked'} />
            </div>
          ))}
          <div style={{ position: 'absolute', left: `${pos * 100}%`, top: 16, transform: 'translateX(-50%)' }}>
            <Ico n="knight" s={36} />
          </div>
        </div>
        <span className="small center">当前 <span className="gold">{w}kg</span> · 已减 {(p.startWeight - w).toFixed(1)}kg · 每到一面旗子奖励一个传说宝箱（开发中）</span>
      </Panel>

      {chest && (
        <Modal onClose={() => setChest(null)}>
          <Panel className="col center" style={{ alignItems: 'center' }}>
            <h1 className="gold">宝箱开启!</h1>
            <Ico n="chest_lg" s={120} />
            <span style={{ fontSize: 'var(--fs-l)' }}><Ico n="coin" s={24} /> +{chest.coins} 金币</span>
            {chest.gems > 0 && <span className="fs-l row"><Ico n="gem" s={24} /> +{chest.gems} 宝石</span>}
            {chest.drop && <span style={{ fontSize: 'var(--fs-m)' }}><Ico n={chest.drop.icon} s={24} /> 掉落：{chest.drop.name}</span>}
            <button className="btn big" onClick={() => setChest(null)}>收下</button>
          </Panel>
        </Modal>
      )}
    </div>
  );
}
