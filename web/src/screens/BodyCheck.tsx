import { useRef, useState } from 'react';
import { dayMut, getState, latestAssessment, setState, today, useStore } from '../store';
import { BodyPhotoResult, recognizeBodyPhoto } from '../llm';
import { Panel, Title } from '../components/ui';
import { createId } from '../id';

export default function BodyCheck({ onDone, onCancel, onSettings }: { onDone: () => void; onCancel?: () => void; onSettings: () => void }) {
  const existing = useStore((state) => latestAssessment(state));
  const [image, setImage] = useState('');
  const [result, setResult] = useState<BodyPhotoResult | null>(null);
  const [condition, setCondition] = useState(existing?.condition ?? '');
  const [sleep, setSleep] = useState(existing == null ? '' : String(existing.sleepHours));
  const [minutes, setMinutes] = useState(existing == null ? '' : String(existing.availableMinutes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const recognize = async (uploadedImage: string) => {
    setBusy(true);
    setResult(null);
    setError('');
    try {
      setResult(await recognizeBodyPhoto(getState(), uploadedImage, { condition, sleep, availableMinutes: minutes }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '模型请求失败，请重试');
    } finally {
      setBusy(false);
    }
  };
  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const uploadedImage = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('文件读取失败，请重试'));
        reader.readAsDataURL(file);
      });
      setImage(uploadedImage);
      await recognize(uploadedImage);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '文件读取失败');
      setBusy(false);
    }
  };
  const save = () => {
    if (busy) return;
    setState((state) => {
      const entry = dayMut(state);
      const metrics = result?.metrics ?? existing?.metrics ?? {};
      entry.bodyAssessment = {
        id: createId(), measuredDate: result?.measuredDate ?? existing?.measuredDate ?? today(), recordedAt: new Date().toISOString(),
        metrics, condition, sleepHours: sleep, availableMinutes: minutes, reportResponse: result?.rawResponse ?? existing?.reportResponse,
      };
      if (metrics.weight_kg != null) entry.weight = metrics.weight_kg;
      entry.plan = undefined;
      entry.accepted = false;
      entry.quests = entry.quests.filter((quest) => quest.claimed);
    });
    onDone();
  };
  return (
    <div className="screen" style={{ paddingBottom: 24 }}>
      <Panel className="col g8"><h1>身体状况与报告</h1><span>截图直接转发给你配置的模型。不限日期、不检查报告类型或测量范围，无需审核确认。</span></Panel>
      <div className="row wrap"><button className="btn ghost" disabled={busy} onClick={onSettings}>API 设置</button>{onCancel && <button className="btn ghost" disabled={busy} onClick={onCancel}>返回计划</button>}</div>
      <Panel className="col g8">
        <Title icon="scale">上传报告截图</Title>
        {image && <img className="photo" src={image} alt="上传的报告截图" />}
        <input ref={input} type="file" accept="image/*" hidden disabled={busy} onChange={pick} />
        <button className="btn ghost" disabled={busy} onClick={() => input.current?.click()}>{image ? '更换截图' : '上传截图并发送给 LLM'}</button>
        {busy && <span role="status" className="gold">模型正在处理…</span>}
        {image && error && <button className="btn" disabled={busy} onClick={() => void recognize(image)}>重试发送</button>}
      </Panel>
      {error && <div role="alert" className="err">{error}</div>}
      {result && <Panel className="col g8"><Title icon="scroll">模型回复</Title><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{result.rawResponse}</div></Panel>}
      <Panel className="col g8">
        <Title icon="scroll">告诉模型你的身体状况</Title>
        <label className="col">身体状况<textarea className="textarea" disabled={busy} value={condition} placeholder="直接填写你想告诉模型的内容" onChange={(event) => setCondition(event.target.value)} /></label>
        <label className="col">昨晚睡眠（小时）<input className="input" disabled={busy} value={sleep} onChange={(event) => setSleep(event.target.value)} /></label>
        <label className="col">今天可运动时间（分钟）<input className="input" disabled={busy} value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>
      </Panel>
      <button className="btn big" disabled={busy} onClick={save}>继续生成建议</button>
    </div>
  );
}
