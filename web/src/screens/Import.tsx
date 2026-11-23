import { useRef, useState } from 'react';
import type { Go } from '../App';
import { dayMut, getState, setState, today, useStore } from '../store';
import { smallReward, RewardResult } from '../game';
import { recognizeScreenshots, HealthFields } from '../llm';
import { Ico, Panel, RewardModal, fileToDataUrl, fmtMin } from '../components/ui';
import type { HealthData } from '../types';

type Key = keyof HealthFields;
const FIELDS: { k: Key; label: string; icon: string; unit: string; kind?: 'min' | 'time' }[] = [
  { k: 'steps', label: '步数', icon: 'boot', unit: '步' },
  { k: 'active_kcal', label: '运动消耗', icon: 'bolt', unit: 'kcal' },
  { k: 'avg_heart_rate', label: '平均心率', icon: 'water', unit: 'bpm' },
  { k: 'distance_km', label: '距离', icon: 'boot', unit: 'km' },
  { k: 'total_min', label: '睡眠时长', icon: 'moon', unit: '分钟', kind: 'min' },
  { k: 'deep_min', label: '深睡', icon: 'moon', unit: '分钟', kind: 'min' },
  { k: 'light_min', label: '浅睡', icon: 'moon', unit: '分钟', kind: 'min' },
  { k: 'rem_min', label: 'REM', icon: 'moon', unit: '分钟', kind: 'min' },
  { k: 'awake_min', label: '清醒', icon: 'moon', unit: '分钟', kind: 'min' },
  { k: 'bed_time', label: '入睡时间', icon: 'moon', unit: '', kind: 'time' },
  { k: 'wake_time', label: '起床时间', icon: 'moon', unit: '', kind: 'time' },
  { k: 'score', label: '睡眠评分', icon: 'star', unit: '分' },
];

export default function Import({ go }: { go: Go }) {
  const had = useStore((s) => !!s.days[today()]?.health);
  const [imgs, setImgs] = useState<string[]>([]);
  const [res, setRes] = useState<{ date: string | null; fields: Partial<HealthFields> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reward, setReward] = useState<RewardResult | null>(null);
  const inp = useRef<HTMLInputElement>(null);

  const add = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []).slice(0, 4 - imgs.length);
    const urls = await Promise.all(fs.map((f) => fileToDataUrl(f, 1400)));
    setImgs([...imgs, ...urls]);
    e.target.value = '';
  };

  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      setRes(await recognizeScreenshots(getState(), imgs));
    } catch (e: any) {
      setErr('识别失败：' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (k: Key, v: string, kind?: string) => {
    if (!res) return;
    const value = v === '' ? null : kind === 'time' ? v : +v;
    setRes({ ...res, fields: { ...res.fields, [k]: { value, confidence: 'high' } } });
  };

  const confirm = () => {
    if (!res) return;
    const h: HealthData = { importedAt: new Date().toTimeString().slice(0, 5) };
    for (const f of FIELDS) {
      const v = res.fields[f.k]?.value;
      if (v != null && v !== '') (h as any)[f.k] = v;
    }
    setState((s) => {
      const d = dayMut(s);
      d.health = { ...(d.health ?? {}), ...h };
    });
    if (!had) setReward(smallReward('导入健康数据', 10, 5, 'end'));
    else go('record');
  };

  const shown = res ? FIELDS.filter((f) => res.fields[f.k]?.value != null) : [];
  const hidden = res ? FIELDS.filter((f) => res.fields[f.k]?.value == null) : [];

  return (
    <div className="screen">
      <Panel className="row">
        <Ico n="camera" s={48} />
        <div className="col" style={{ gap: 0 }}>
          <h1>截图导入</h1>
          <span className="small dim">支持手环 / 运动 App 的今日数据、睡眠页截图，最多 4 张</span>
        </div>
      </Panel>

      <div className="row wrap">
        {imgs.map((u, i) => (
          <div key={i} className="col" style={{ alignItems: 'center' }}>
            <img className="thumb" src={u} alt={`截图${i + 1}`} />
            <button className="btn ghost small" onClick={() => setImgs(imgs.filter((_, j) => j !== i))}>移除</button>
          </div>
        ))}
        {imgs.length < 4 && (
          <div className="dashed thumb" onClick={() => inp.current?.click()}>
            <span style={{ fontSize: 'var(--fs-xxl)' }}>＋</span>
            <span className="small">添加截图</span>
          </div>
        )}
      </div>
      <input ref={inp} type="file" accept="image/*" multiple hidden onChange={add} />

      <button className="btn big" disabled={busy || !imgs.length} onClick={run}>{busy ? 'AI 识别中…' : 'AI 识别'}</button>
      {err && <div className="err">{err}</div>}

      {res && (
        <Panel className="col">
          <span className="gold">AI 识别结果（可修改）</span>
          {shown.map((f) => {
            const fv = res.fields[f.k]!;
            return (
              <label key={f.k} className="row" style={{ alignItems: 'center' }}>
                <Ico n={f.icon} s={24} />
                <span className="col" style={{ width: 72, gap: 0, flex: 'none' }}>
                  <span>{f.label}</span>
                  <span className="xs dim">{f.kind === 'min' ? fmtMin(fv.value) : f.unit || ' '}</span>
                </span>
                <input className="input grow" style={{ minWidth: '6.5em' }} type={f.kind === 'time' ? 'time' : 'number'} step="any" value={fv.value ?? ''} onChange={(e) => edit(f.k, e.target.value, f.kind)} />
                <span className="tag center" style={{ minWidth: '4.5em', background: fv.confidence === 'low' ? 'var(--accent)' : 'var(--stamina)' }}>{fv.confidence === 'low' ? '请核对' : '准确'}</span>
              </label>
            );
          })}
          {!shown.length && <span className="dim">没有识别到数据，换一张更清晰的截图试试。</span>}
          {hidden.length > 0 && <span className="small dim">未识别：{hidden.map((f) => f.label).join('、')}</span>}
          <span className="small dim">数据日期 {res.date ?? today()} · 来源：截图识别</span>
        </Panel>
      )}
      {res && (
        <>
          <button className="btn big" onClick={confirm}>确认导入 · 更新任务进度</button>
          <button className="btn ghost" onClick={run} disabled={busy}>重新识别</button>
        </>
      )}
      {reward && <RewardModal r={reward} onClose={() => { setReward(null); go('record'); }} />}
    </div>
  );
}
