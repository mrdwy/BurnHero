import { useState } from 'react';
import type { Go } from '../App';
import { getState, resetAll, setState, useStore } from '../store';
import { Panel, Title } from '../components/ui';
import { ApiConfiguration } from './ApiSetup';

export default function Settings({ go }: { go: Go }) {
  const motion = useStore((s) => s.prefs?.motion !== false);
  const [confirmReset, setConfirmReset] = useState(false);

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ ...getState(), llm: { ...getState().llm, apiKey: '' } }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `燃脂勇者-备份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="screen">
      <div className="row between">
        <button className="btn ghost small" aria-label="返回" onClick={() => go('char')}>←</button>
        <h1>设置</h1>
        <span style={{ width: 40 }} />
      </div>
      <ApiConfiguration />
      <Panel className="col">
        <Title>显示</Title>
        <label className="check"><input type="checkbox" checked={motion} onChange={(e) => setState((s) => void (s.prefs = { ...(s.prefs ?? { motion: true }), motion: e.target.checked }))} />角色待机呼吸动画</label>
        <span className="small dim">系统开启「减少动态效果」时会自动关闭。</span>
      </Panel>
      <Panel className="col">
        <Title>数据</Title>
        <span className="small dim">所有记录保存在本机浏览器（localStorage）。清除浏览器数据会丢失，建议定期导出备份。</span>
        <button className="btn ghost" onClick={exportData}>导出备份（不含 Key）</button>
        {!confirmReset ? (
          <button className="btn ghost" style={{ borderColor: 'var(--hp)' }} onClick={() => setConfirmReset(true)}>重置全部数据</button>
        ) : (
          <div className="row">
            <span className="small grow">确定删除角色和所有记录？无法恢复。</span>
            <button className="btn small danger" onClick={resetAll}>确定删除</button>
            <button className="btn ghost small" onClick={() => setConfirmReset(false)}>取消</button>
          </div>
        )}
      </Panel>
      <span className="small dim center">像素字体：Fusion Pixel Font（SIL OFL 1.1）</span>
    </div>
  );
}
