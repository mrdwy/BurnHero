import type { Go } from '../App';
import { addDays, day, today, useStore, weekday } from '../store';
import { sleepEffect } from '../game';
import { Ico, Panel, fmtMin } from '../components/ui';

const SLEEP_RATIO = 65 / 64; // sleep.png 是 64×65

export default function Sleep({ go }: { go: Go }) {
  const s = useStore((x) => x);
  const d = day(s);
  const h = d.health;
  const eff = sleepEffect(d);
  const t = today();
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6)).map((k) => ({ k, m: s.days[k]?.health?.total_min ?? 0 }));
  const max = Math.max(540, ...week.map((w) => w.m));
  const segs = [
    { k: 'deep_min', n: '深睡', c: 'var(--deep)' },
    { k: 'light_min', n: '浅睡', c: 'var(--water)' },
    { k: 'rem_min', n: 'REM', c: 'var(--xp)' },
    { k: 'awake_min', n: '清醒', c: 'var(--accent)' },
  ] as const;

  if (h?.total_min == null)
    return (
      <div className="screen">
        <Panel className="col center" style={{ alignItems: 'center' }}>
          <Ico n="moon" s={64} />
          <h2>还没有昨晚的睡眠数据</h2>
          <span className="dim small">在手环 App 里截一张睡眠页，导入后自动识别。</span>
          <button className="btn" onClick={() => go('import')}>去导入截图</button>
        </Panel>
      </div>
    );

  return (
    <div className="screen">
      <Panel className="center"><h1>睡眠 · 昨晚</h1></Panel>
      <div className="row">
        <Panel className="center deep" style={{ padding: 4 }}>
          <Ico n="sleep" s={128} h={Math.round(128 * SLEEP_RATIO)} />
        </Panel>
        <div className="col grow center" style={{ alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--fs-xxl)' }}>{fmtMin(h.total_min)}</span>
          {h.score != null && <Panel className="gold" style={{ border: '2px solid var(--gold)' }}>睡眠评分 <span style={{ fontSize: 'var(--fs-xl)' }}>{h.score}</span></Panel>}
        </div>
      </div>
      <Panel className="col">
        <div className="row between small"><span>{h.bed_time ?? '--:--'}</span><span>{h.wake_time ?? '--:--'}</span></div>
        <div className="row" style={{ gap: 4, height: 24 }}>
          {segs.map((g) => <span key={g.k} style={{ flex: h[g.k] ?? 0, background: g.c, height: '100%' }} />)}
        </div>
        <div className="row wrap small" style={{ gap: 12 }}>
          {segs.map((g) => (
            <span key={g.k} className="row" style={{ gap: 4 }}><i style={{ width: 12, height: 12, background: g.c, display: 'inline-block' }} />{g.n} {fmtMin(h[g.k])}</span>
          ))}
        </div>
        <span className="small dim">各阶段时长来自手环，阶段顺序为示意。</span>
      </Panel>
      <Panel className="col">
        <div className="row between"><span className="gold">近 7 天睡眠</span><span className="small dim">- - 7h 目标</span></div>
        <div className="row" style={{ alignItems: 'flex-end', height: 120, gap: 8, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(420 / max) * 100}%`, borderTop: '2px dashed var(--dim)' }} />
          {week.map((w) => (
            <div key={w.k} className="grow col" style={{ alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ width: '70%', height: `${(w.m / max) * 100}%`, background: w.m >= 420 ? 'var(--water)' : w.m ? 'var(--deep)' : 'transparent' }} />
            </div>
          ))}
        </div>
        <div className="row small">{week.map((w) => <span key={w.k} className="grow center">{weekday(w.k)}</span>)}</div>
      </Panel>
      {eff && (
        <Panel className="row" style={{ borderColor: eff.good ? 'var(--stamina)' : 'var(--accent)' }}>
          <Ico n={eff.good ? 'star' : 'moon'} s={48} />
          <div className="col">
            <span>状态：<span style={{ color: eff.good ? 'var(--stamina)' : 'var(--accent)', fontSize: 'var(--fs-l)' }}>{eff.name}</span></span>
            <span className="small">{eff.text}</span>
            {!eff.good && <span className="small gold">今晚 23:30 前入睡可获得【精力充沛】增益</span>}
          </div>
        </Panel>
      )}
      <span className="small dim center">数据来源：截图导入 {h.importedAt}</span>
    </div>
  );
}
