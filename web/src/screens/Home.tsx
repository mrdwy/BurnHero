import { useState } from 'react';
import type { Go } from '../App';
import { day, dayMut, latestWeight, setState, today, useStore, weekday } from '../store';
import { bossCheckIn, claimQuest, isManual, power, questProgress, xpNeed, RewardResult } from '../game';
import { Bar, Ico, Panel, RewardModal } from '../components/ui';
import { clsSprite } from './Onboarding';
import type { Quest } from '../types';

const QUEST_ICON: Record<string, string> = { steps: 'boot', water: 'water', meal: 'meal', workout: 'dumbbell', sleep: 'moon', record: 'scroll' };

export default function Home({ go }: { go: Go }) {
  const s = useStore((x) => x);
  const d = day(s);
  const [reward, setReward] = useState<RewardResult | null>(null);
  const p = s.profile!;
  const w = latestWeight(s);
  const lostPct = ((p.startWeight - w) / Math.max(0.1, p.startWeight - p.targetWeight)) * 100;
  const t = today();

  const claim = (q: Quest) => {
    const r = claimQuest(q.id);
    if (r) setReward(r);
  };

  return (
    <div className="screen">
      <Panel className="row" style={{ alignItems: 'stretch' }}>
        <Ico n={clsSprite(p.cls)} s={64} className="bounce" />
        <div className="grow col" style={{ gap: 4 }}>
          <div className="row" style={{ gap: 8 }}><span className="fs-l nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span><span className="gold nowrap">Lv.{s.hero.level}</span></div>
          <div className="row"><div className="grow"><Bar v={s.hero.xp} max={xpNeed(s.hero.level)} color="var(--xp)" /></div><span className="small">XP</span></div>
          <div className="small row" style={{ gap: 4 }}><Ico n="scale" s={16} />体重 {w}kg → 目标 {p.targetWeight}kg</div>
          <Bar v={lostPct} max={100} color="var(--hp)" h={8} />
        </div>
        <div className="col center" style={{ justifyContent: 'center', alignItems: 'center', borderLeft: '2px solid var(--outline)', paddingLeft: 8 }}>
          <Ico n="coin" s={32} />
          <span className="gold">{s.hero.coins}</span>
        </div>
      </Panel>

      <Panel className="row between">
        <h1>今日任务</h1>
        <span className="chip">{t.slice(5).replace('-', '/')} {weekday(t)}</span>
        <span className="row gold" style={{ gap: 4 }}><Ico n="bolt" s={24} />战力 {power(s)}</span>
      </Panel>

      {!d.quests.length && (
        <Panel className="row">
          <Ico n="sage_lg" s={64} />
          <div className="dialog col">
            <span>勇者，身体评估已完成。去计划页根据测量数据与身体状况生成今天的任务吧。</span>
            <div className="row">
              <button className="btn small" onClick={() => go('plan')}>领取今日计划</button>
              <button className="btn small ghost" onClick={() => go('import')}>导入截图</button>
            </div>
          </div>
        </Panel>
      )}

      {d.quests.map((q) => {
        const prog = questProgress(q, d);
        const done = prog >= q.target;
        return (
          <Panel key={q.id} className="row">
            <Ico n={QUEST_ICON[q.type] ?? 'star'} s={44} />
            <div className="grow col" style={{ gap: 4 }}>
              <span>{q.title}</span>
              {q.type === 'water' ? (
                <div className="row wrap" style={{ gap: 4 }}>
                  {Array.from({ length: q.target }, (_, i) => (
                    <Ico key={i} n="cup" s={16} className={i < prog ? '' : 'locked'} />
                  ))}
                </div>
              ) : (
                <Bar v={prog} max={q.target} />
              )}
              <span className="small dim" aria-live={q.type === 'water' ? 'polite' : undefined}>
                {q.auto_check.startsWith('meal:') ? (done ? '达标' : `提交餐饮后自动判定（≤${q.target}kcal）`) : `${Math.min(prog, q.target)} / ${q.target} ${q.unit}`}
              </span>
            </div>
            <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
              {q.claimed ? (
                <span className="stamp">已完成</span>
              ) : done ? (
                <button className="btn green small" onClick={() => claim(q)}>领取</button>
              ) : q.type === 'water' ? (
                <button className="btn small" onClick={() => setState((state) => { const entry = dayMut(state); entry.water = (Number(entry.water) || 0) + 1; })}>+1 杯</button>
              ) : isManual(q) ? (
                <button className="btn small" onClick={() => setState((x) => { const qq = dayMut(x).quests.find((y) => y.id === q.id)!; qq.manualProgress = q.target; })}>完成</button>
              ) : q.auto_check === 'steps' || q.auto_check === 'sleep' ? (
                <button className="btn small ghost" onClick={() => go('import')}>导入</button>
              ) : q.auto_check.startsWith('meal') ? (
                <button className="btn small ghost" onClick={() => go('meal', q.auto_check.slice(5))}>记录</button>
              ) : (
                <button className="btn small ghost" onClick={() => go('record')}>记录</button>
              )}
              <span className="small gold">+{q.reward_power} 战力</span>
              <span className="small dim">+{q.reward_coin} 金币</span>
            </div>
          </Panel>
        );
      })}

      {s.boss && (
        <Panel className="row boss">
          <Ico n="skull" s={52} />
          <div className="grow col" style={{ gap: 4 }}>
            <span style={{ color: 'var(--accent)' }}>每周BOSS: {s.boss.name}</span>
            <span className="small">{s.boss.desc}</span>
            <Bar v={s.boss.progress} max={s.boss.days} color="var(--accent)" />
            <span className="small dim">{s.boss.done ? '已击败！' : `进度 ${s.boss.progress}/${s.boss.days} 天`}</span>
          </div>
          {s.boss.done ? (
            <Ico n="chest" s={44} />
          ) : (
            <button className="btn small" disabled={d.bossChecked} onClick={() => { const r = bossCheckIn(); if (r) setReward(r); }}>
              {d.bossChecked ? '今日已打卡' : '今日达成'}
            </button>
          )}
        </Panel>
      )}

      {reward && <RewardModal r={reward} onClose={() => setReward(null)} />}
    </div>
  );
}
