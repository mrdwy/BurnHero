import { useRef, useState } from 'react';
import type { Go } from '../App';
import { day, dayMut, getState, setState, useStore } from '../store';
import { MEAL_LABEL, smallReward, RewardResult } from '../game';
import { recognizeMeal, MealResult } from '../llm';
import { Bar, Ico, Panel, RewardModal, fileToDataUrl } from '../components/ui';
import type { MealSlot } from '../types';

export default function Meal({ go, slot: init }: { go: Go; slot?: string }) {
  const guess: MealSlot = (() => {
    const h = new Date().getHours();
    return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
  })();
  const [slot, setSlot] = useState<MealSlot>(init && init in MEAL_LABEL ? (init as MealSlot) : guess);
  const existing = useStore((s) => day(s).meals[slot]);
  const [text, setText] = useState('');
  const [img, setImg] = useState<string>();
  const [res, setRes] = useState<MealResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reward, setReward] = useState<RewardResult | null>(null);
  const cam = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setImg(await fileToDataUrl(f, 1024));
    e.target.value = '';
  };

  const recognize = async () => {
    setBusy(true);
    setErr('');
    try {
      setRes(await recognizeMeal(getState(), slot, text, img));
    } catch (e: any) {
      setErr('识别失败：' + e.message);
    } finally {
      setBusy(false);
    }
  };


  const editKcal = (i: number, raw: string) => {
    if (!res) return;
    const v = +raw;
    const items = res.items.map((it, j) => (j === i ? { ...it, kcal: v } : it));
    setRes({ ...res, items, total_kcal: items.reduce((n, x) => n + (x.kcal || 0), 0) });
  };

  const submit = () => {
    if (!res) return;
    const first = !existing;
    setState((s) => {
      dayMut(s).meals[slot] = { ...res, text, at: new Date().toTimeString().slice(0, 5) };
    });
    if (first) setReward(smallReward(`提交${MEAL_LABEL[slot]}`, 15, 5, 'wil'));
    else go('record');
  };

  const macro = res ? res.protein_g + res.carb_g + res.fat_g || 1 : 1;

  return (
    <div className="screen">
      <div className="row between">
        <button className="btn ghost small" aria-label="返回" onClick={() => go('record')}>←</button>
        <h1>提交餐饮 · {MEAL_LABEL[slot]}</h1>
        <span style={{ width: 40 }} />
      </div>
      <div className="tabs">
        {(Object.keys(MEAL_LABEL) as MealSlot[]).map((k) => (
          <button key={k} className={k === slot ? 'on' : ''} onClick={() => { setSlot(k); setRes(null); }}>{MEAL_LABEL[k]}</button>
        ))}
      </div>
      {existing && !res && (
        <Panel className="small">已记录：{existing.items.map((i) => i.name).join('、')} · {existing.total_kcal}kcal（重新提交会覆盖）</Panel>
      )}

      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="grow">
          {img ? <img className="photo" src={img} alt="餐饮照片" /> : (
            <div className="dashed photo" style={{ height: 140 }} onClick={() => cam.current?.click()}>
              <Ico n="camera" s={48} />
              <span className="small">拍一张照片（可选）</span>
            </div>
          )}
        </div>
        <div className="col" style={{ justifyContent: 'center' }}>
          <button className="btn ghost" onClick={() => cam.current?.click()}>拍照</button>
          <button className="btn ghost" onClick={() => album.current?.click()}>相册</button>
          {img && <button className="btn ghost small" onClick={() => setImg(undefined)}>移除</button>}
        </div>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={album} type="file" accept="image/*" hidden onChange={pick} />

      <textarea className="textarea" value={text} placeholder="描述吃了什么、大概多少，如：米饭半碗，番茄炒蛋，清炒西兰花（可用输入法语音输入）" onChange={(e) => setText(e.target.value)} />
      <button className="btn big" disabled={busy || (!text.trim() && !img)} onClick={recognize}>
        {busy ? '贤者识别中…' : <><Ico n="search" s={24} />AI 识别</>}
      </button>
      {err && <div className="err">{err}</div>}

      {res && (
        <>
          <Panel className="col">
            <span className="gold">识别结果（热量可修改）</span>
            {res.items.map((it, i) => (
              <div key={i} className="row">
                <span className="grow">{it.name} {it.confidence === 'low' && <span className="tag" style={{ background: 'var(--accent)' }}>请核对</span>}</span>
                <span className="dim small" style={{ width: 80 }}>{it.portion}{it.grams ? ` ${it.grams}g` : ''}</span>
                <input className="input" style={{ width: 88, padding: '4px 8px' }} type="number" step="any" inputMode="decimal" value={it.kcal} onChange={(e) => editKcal(i, e.target.value)} />
                <span className="small">kcal</span>
              </div>
            ))}
            <div className="row between" style={{ borderTop: '2px solid var(--outline)', paddingTop: 8 }}>
              <span>合计</span><span className="gold" style={{ fontSize: 'var(--fs-l)' }}>{res.total_kcal} kcal</span>
            </div>
          </Panel>
          <div className="grid3">
            {([['蛋白质', res.protein_g, 'var(--hp)'], ['碳水', res.carb_g, 'var(--water)'], ['脂肪', res.fat_g, 'var(--gold)']] as const).map(([n, v, c]) => (
              <Panel key={n} className="col" style={{ padding: 8 }}><span className="small">{n} {Math.round(v)}g</span><Bar v={v} max={macro} color={c} /></Panel>
            ))}
          </div>
          {res.comment && (
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Ico n="sage_lg" s={64} />
              <div className="dialog">{res.comment}</div>
            </div>
          )}
          <button className="btn big" onClick={submit}>确认提交{!existing && '  +15 战力'}</button>
        </>
      )}
      {reward && <RewardModal r={reward} onClose={() => { setReward(null); go('record'); }} />}
    </div>
  );
}
