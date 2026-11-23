import { useState } from 'react';
import type { Go } from '../App';
import { day, dayMut, getState, latestAssessment, setState, today, useStore } from '../store';
import { generatePlan } from '../llm';
import { mergeQuests } from '../game';
import { Ico, Panel, toast } from '../components/ui';

const TL_ICON: Record<string, string> = { meal: 'meal', water: 'water', workout: 'boot', sleep: 'moon' };

export default function PlanScreen({ go }: { go: Go }) {
  const s = useStore((x) => x);
  const d = day(s);
  const assessment = latestAssessment(s);
  const plan = d.plan?.assessmentId === assessment?.id ? d.plan : undefined;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const gen = async (n = note) => {
    const startedDate = today();
    const startedAssessment = assessment?.id;
    setBusy(true);
    setErr('');
    try {
      const p = await generatePlan(getState(), n);
      if (today() !== startedDate || latestAssessment(getState())?.id !== startedAssessment) throw new Error('资料已变化，请重新发送');
      setState((x) => {
        const dd = dayMut(x);
        dd.plan = p;
        // 已接受过：替换未完成任务，保留已领取的
        if (dd.accepted) {
          dd.quests = mergeQuests(dd.quests, p.quests);
        }
      });
      setNote('');
    } catch (e: any) {
      setErr('生成失败：' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    setState((x) => {
      const dd = dayMut(x);
      if (!dd.plan) return;
      dd.accepted = true;
      dd.quests = mergeQuests(dd.quests, dd.plan.quests);
      if (dd.plan.boss && (!x.boss || x.boss.done)) x.boss = { ...dd.plan.boss, progress: 0, startDate: today() };
    });
    toast('任务已发布！');
    go('home');
  };

  return (
    <div className="screen">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Ico n="sage_lg" s={96} />
        <div className="col grow">
          <span className="small dim">— AI 教练 · 贤者</span>
          <div className="dialog">
            {busy ? '正在根据报告测量数据与身体状况制定计划……' : plan ? plan.coach_message : '身体评估已记录。我会根据今天的报告与自述制定建议，点击下方按钮生成。'}
          </div>
        </div>
      </div>

      <Panel className="col g8">
        <span className="gold">今日建议依据</span>
        <span>{assessment?.measuredDate} · 体重 {assessment?.metrics.weight_kg ?? '未提供'}{assessment?.metrics.weight_kg != null ? ' kg' : ''}{assessment?.metrics.body_fat_pct != null && ` · 体脂 ${assessment.metrics.body_fat_pct}%`}</span>
        <span style={{ overflowWrap: 'anywhere' }}>{assessment?.condition}</span>
        <span className="small dim">睡眠 {assessment?.sleepHours} 小时 · 可运动 {assessment?.availableMinutes} 分钟</span>
        <button className="btn ghost" disabled={busy} onClick={() => go('body')}>重新上传并修改身体状况</button>
      </Panel>

      {plan && <Panel className="col g8"><span className="gold">LLM 原始回复</span><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{plan.rawResponse ?? plan.coach_message}</div></Panel>}

      {plan && plan.quests.length > 0 && (
        <>
          <div className="grid3">
            <Panel className="col center"><span className="small"><Ico n="meal" s={20} /> 目标摄入</span><span className="gold" style={{ fontSize: 'var(--fs-m)' }}>{plan.targets.intake_kcal} kcal</span></Panel>
            <Panel className="col center"><span className="small"><Ico n="bolt" s={20} /> 消耗目标</span><span className="gold" style={{ fontSize: 'var(--fs-m)' }}>{plan.targets.burn_kcal} kcal</span></Panel>
            <Panel className="col center"><span className="small"><Ico n="star" s={20} /> 难度</span><span className="gold" style={{ fontSize: 'var(--fs-m)' }}>{plan.targets.difficulty}</span></Panel>
          </div>
          {plan.status_effect && (
            <Panel className="row"><Ico n="moon" s={32} /><span>状态：<span style={{ color: 'var(--accent)' }}>{plan.status_effect.name}</span> · {plan.status_effect.effect}</span></Panel>
          )}
          <div className="scroll"><Panel className="parch col" style={{ gap: 8 }}>
            {plan.timeline.map((t, i) => (
              <label key={i} className="row" style={{ borderBottom: '2px dashed var(--parchment-edge)', paddingBottom: 4, minHeight: 44, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!t.done}
                  onChange={() => setState((x) => { const tl = dayMut(x).plan!.timeline[i]; tl.done = !tl.done; })} />
                <Ico n={TL_ICON[t.type] ?? 'scroll'} s={24} />
                <span className="grow col" style={{ gap: 0 }}>
                  <span className="row between small" style={{ gap: 8 }}>
                    <span>{t.time}</span>
                    {t.kcal ? <span>{t.kcal} kcal</span> : null}
                  </span>
                  <span>{t.text}</span>
                </span>
              </label>
            ))}
          </Panel></div>
          {plan.boss && (!s.boss || s.boss.done) && (
            <Panel className="row boss"><Ico n="skull" s={40} /><span>新 BOSS：<span style={{ color: 'var(--accent)' }}>{plan.boss.name}</span> · {plan.boss.desc}（{plan.boss.days} 天）</span></Panel>
          )}
          <Panel className="col">
            <span className="small dim">今日任务（{plan.quests.length}）</span>
            {plan.quests.map((q) => (
              <div key={q.id} className="row between small"><span>· {q.title}</span><span className="gold">+{q.reward_power} 战力</span></div>
            ))}
          </Panel>
        </>
      )}

      {err && <div className="err">{err}</div>}

      <div className="col g8">
        {plan && plan.quests.length > 0 && !d.accepted && <button className="btn grow" style={{ fontSize: 'var(--fs-l)' }} disabled={busy} onClick={accept}>接受任务</button>}
        <button className={plan ? 'btn ghost grow' : 'btn big'} disabled={busy} onClick={() => gen()}>
          <Ico n="scroll" s={24} />{busy ? '生成中…' : plan ? '根据当前评估重新生成' : '根据身体状况生成今日计划'}
        </button>
      </div>
      {d.accepted && <span className="small dim center">今日任务已接受。告诉教练你的变化，可以调整未完成的任务。</span>}

      <div className="row">
        <input className="input grow" disabled={busy} value={note} placeholder="补充你想告诉模型的内容…" onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && note.trim() && !busy && gen()} />
        <button className="btn" aria-label="发送" disabled={busy || !note.trim()} onClick={() => gen()}>➤</button>
      </div>
    </div>
  );
}
