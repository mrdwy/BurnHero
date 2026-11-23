import { useState } from 'react';
import { getState, latestAssessment, setState } from '../store';
import { Ico, Panel } from '../components/ui';
import type { ClassId, Profile } from '../types';

export const CLASSES: { id: ClassId; name: string; desc: string; sprite: string }[] = [
  { id: 'warrior', name: '战士', desc: '力量训练', sprite: 'knight' },
  { id: 'ranger', name: '游侠', desc: '跑步有氧', sprite: 'ranger' },
  { id: 'monk', name: '武僧', desc: '瑜伽饮食', sprite: 'monk' },
];
/** 职业对应的像素形象；lg=true 取 64 格大图 */
export const clsSprite = (c?: ClassId, lg = false) => (CLASSES.find((x) => x.id === c)?.sprite ?? 'knight') + (lg ? '_lg' : '');

export default function Onboarding() {
  const measuredWeight = latestAssessment(getState())?.metrics.weight_kg ?? 0;
  const [p, setP] = useState<Profile>({ name: '', cls: 'warrior', sex: 'male', age: 28, height: 175, startWeight: measuredWeight, targetWeight: Math.round(measuredWeight * 0.95 * 10) / 10, workoutDays: 4 });
  const idx = CLASSES.findIndex((c) => c.id === p.cls);
  const cycle = (d: number) => setP({ ...p, cls: CLASSES[(idx + d + 3) % 3].id });
  const num = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: +e.target.value });

  const start = () => {
    setState((s) => {
      s.profile = { ...p, name: p.name.trim() };
      s.hero.attrs = p.cls === 'warrior' ? { str: 8, end: 5, agi: 4, wil: 5 } : p.cls === 'ranger' ? { str: 4, end: 8, agi: 6, wil: 4 } : { str: 4, end: 5, agi: 5, wil: 8 };
    });
  };

  return (
    <div className="screen" style={{ paddingBottom: 24 }}>
      <Panel className="col center"><h1>完善勇者资料</h1><span className="small dim">测量数据已识别，补充基本资料后生成个人计划。</span></Panel>
      <div className="row between">
        <button className="btn ghost" aria-label="上一个职业" onClick={() => cycle(-1)}>◀</button>
        <Ico n={clsSprite(p.cls, true)} s={128} className="bounce" />
        <button className="btn ghost" aria-label="下一个职业" onClick={() => cycle(1)}>▶</button>
      </div>
      <div className="grid3">
        {CLASSES.map((c) => (
          <Panel key={c.id} className={'center col ' + (c.id === p.cls ? 'sel' : '')} onClick={() => setP({ ...p, cls: c.id })} style={{ alignItems: 'center', cursor: 'pointer' }}>
            <Ico n={c.sprite} s={48} />
            <span>{c.name}</span>
            <span className="xs dim">({c.desc})</span>
          </Panel>
        ))}
      </div>
      <Panel className="col">
        <label className="field">昵称<input className="input" value={p.name} placeholder="勇者小白" onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <label className="field">性别
          <div className="tabs">
            <button className={p.sex === 'male' ? 'on' : ''} onClick={() => setP({ ...p, sex: 'male' })}>男</button>
            <button className={p.sex === 'female' ? 'on' : ''} onClick={() => setP({ ...p, sex: 'female' })}>女</button>
          </div>
        </label>
        <label className="field">年龄<input className="input" type="number" value={p.age} onChange={num('age')} /></label>
        <label className="field">身高 cm<input className="input" type="number" value={p.height} onChange={num('height')} /></label>
        <label className="field">体重 kg<input className="input" type="number" step="any" value={p.startWeight} onChange={num('startWeight')} /></label>
        <label className="field">目标体重 kg<input className="input" type="number" step="0.1" value={p.targetWeight} onChange={num('targetWeight')} /></label>
        <label className="field">每周运动天数<input className="input" type="number" step="any" value={p.workoutDays} onChange={num('workoutDays')} /></label>
      </Panel>
      <button className="btn big" onClick={start}>保存资料，查看计划</button>
    </div>
  );
}
