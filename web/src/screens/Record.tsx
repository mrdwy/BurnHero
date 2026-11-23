import { useState } from 'react';
import type { Go } from '../App';
import { day, dayMut, previousWeight, setState, today, useStore } from '../store';
import { MEAL_LABEL, recordCount, smallReward, todayTotals, RewardResult } from '../game';
import { Bar, Ico, Modal, Panel, RewardModal, Title, fmtMin } from '../components/ui';
import type { MealSlot } from '../types';

export default function Record({ go }: { go: Go }) {
  const s = useStore((x) => x);
  const d = day(s);
  const tot = todayTotals(s);
  const [weighing, setWeighing] = useState(false);
  const [w, setW] = useState(String(d.weight ?? previousWeight(s) ?? ''));
  const [reward, setReward] = useState<RewardResult | null>(null);
  const prev = previousWeight(s);
  const h = d.health;
  const t = today();

  const saveWeight = () => {
    const v = +w;
    const first = !d.weight;
    setState((x) => void (dayMut(x).weight = Math.round(v * 10) / 10));
    setWeighing(false);
    if (first) setReward(smallReward('记录今日体重', 5, 5, 'wil'));
  };

  return (
    <div className="screen">
      <Panel className="row between">
        <h1>记录中心</h1>
        <span className="chip">{t.slice(5).replace('-', '/')}</span>
        <span className="chip" style={{ border: '2px solid var(--xp)' }}>已记录 <span className="gold">{recordCount(d)}/6</span></span>
      </Panel>

      <Panel className="col g8">
        <Title icon="scale">体脂秤与身体状况</Title>
        <span>测量体重 {d.bodyAssessment?.metrics.weight_kg ?? '--'} kg · 体脂 {d.bodyAssessment?.metrics.body_fat_pct ?? '未识别'}{d.bodyAssessment?.metrics.body_fat_pct != null ? '%' : ''}</span>
        <span className="small" style={{ overflowWrap: 'anywhere' }}>{d.bodyAssessment?.condition ?? '未完成身体评估'}</span>
        <button className="btn ghost" onClick={() => go('body')}>更新体脂秤 App 报告与身体状况</button>
      </Panel>

      <Panel className="col">
        <Title icon="meal">餐饮</Title>
        <div className="grid2">
          {(Object.keys(MEAL_LABEL) as MealSlot[]).map((k) => {
            const m = d.meals[k];
            return (
              <Panel key={k} className="row" onClick={() => go('meal', k)} style={{ cursor: 'pointer', padding: 8 }}>
                <Ico n={m ? 'meal' : 'camera'} s={36} className={m ? '' : 'locked'} />
                <div className="col" style={{ gap: 0 }}>
                  <span>{MEAL_LABEL[k]} {m && <span className="green">✓</span>}</span>
                  <span className={m ? '' : 'dim small'}>{m ? `${m.total_kcal}kcal` : '待提交'}</span>
                </div>
              </Panel>
            );
          })}
        </div>
        <div className="row">
          <span>已摄入 <span className="gold">{tot.kcal} / {tot.target}</span> kcal</span>
          <div className="grow"><Bar v={tot.kcal} max={tot.target} color={tot.kcal > tot.target ? 'var(--hp)' : 'var(--accent)'} /></div>
        </div>
      </Panel>

      <Panel className="col">
        <Title icon="phone">手环 / 健康数据</Title>
        <div className="row">
          <div className="grow col" style={{ gap: 0 }}>
            <span>导入手环截图</span>
            <span className="small dim">自动识别 步数·心率·消耗·睡眠</span>
            {h && <span className="small">步数 {h.steps ?? '--'} · 消耗 {h.active_kcal ?? '--'}kcal</span>}
          </div>
          <div className="col" style={{ alignItems: 'flex-end' }}>
            <button className="btn" onClick={() => go('import')}>上传截图</button>
            {h?.importedAt && <span className="small dim">上次导入 {h.importedAt}</span>}
          </div>
        </div>
      </Panel>

      <Panel className="col" onClick={() => go('sleep')} style={{ cursor: 'pointer' }}>
        <Title icon="moon">睡眠</Title>
        <div className="row">
          {h?.total_min != null ? (
            <>
              <span>昨晚 <span style={{ fontSize: 'var(--fs-l)' }}>{fmtMin(h.total_min)}</span>{h.score != null && <> 评分 <span className="gold">{h.score}</span></>}</span>
              <div className="grow row" style={{ gap: 0, height: 14 }}>
                {([['deep_min', 'var(--deep)'], ['light_min', 'var(--water)'], ['rem_min', 'var(--xp)'], ['awake_min', 'var(--accent)']] as const).map(([k, c]) => (
                  <span key={k} style={{ flex: h[k] ?? 0, background: c, height: '100%' }} />
                ))}
              </div>
            </>
          ) : (
            <span className="dim">未记录 · 通过手环截图导入</span>
          )}
        </div>
      </Panel>

      <Panel className="col">
        <Title icon="scale">体重</Title>
        <div className="row between">
          <span className="grow" style={{ fontSize: 'var(--fs-l)' }}>
            {d.weight ? `${d.weight} kg` : <span className="dim small">今天还没称</span>}
            {d.weight && prev ? (d.weight <= prev
              ? <span className="green"> {(d.weight - prev).toFixed(1)}</span>
              : <span> <span style={{ color: 'var(--hp)' }} aria-hidden>▲</span>+{(d.weight - prev).toFixed(1)}</span>) : null}
          </span>
          <button className="btn" onClick={() => setWeighing(true)}>记录</button>
        </div>
      </Panel>

      {weighing && (
        <Modal onClose={() => setWeighing(false)}>
          <Panel className="col">
            <h2>今日体重</h2>
            <div className="row"><input className="input" style={{ fontSize: 'var(--fs-xl)' }} type="number" step="0.1" inputMode="decimal" autoFocus value={w} onChange={(e) => setW(e.target.value)} /><span>kg</span></div>
            <button className="btn big" onClick={saveWeight}>保存</button>
          </Panel>
        </Modal>
      )}
      {reward && <RewardModal r={reward} onClose={() => setReward(null)} />}
    </div>
  );
}
