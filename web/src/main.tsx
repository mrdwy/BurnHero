import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme.css';

// 像素字体是 12px 网格：把字号取整到「12 个物理像素」的整数倍，任何屏幕上都不发糊。
// 只有 5 个层级：s 辅助 / m 正文 / l 标题 / xl 大数字 / xxl 特大数字，每级至少比上一级大一个网格单位
// （仅在 1 倍屏上因单位太大允许合并）。xs 是 s 的别名，保留给旧代码。
function setFontScale() {
  const dpr = window.devicePixelRatio || 1;
  const unit = 12 / dpr;
  const snap = (t: number) => Math.max(1, Math.round(t / unit)) * unit;
  const r = document.documentElement.style;
  const tiers: [string, number][] = [['s', 12], ['m', 16], ['l', 22], ['xl', 28], ['xxl', 40]];
  let prev = 0;
  for (const [k, t] of tiers) {
    let v = snap(t);
    if (dpr >= 1.5 && v <= prev) v = prev + unit;
    if (v < prev) v = prev;
    r.setProperty(`--fs-${k}`, `${v}px`);
    prev = v;
  }
  r.setProperty('--fs-xs', 'var(--fs-s)');
}
setFontScale();
matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener?.('change', setFontScale);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
