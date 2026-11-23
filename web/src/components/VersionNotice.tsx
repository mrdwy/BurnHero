import { useEffect, useState } from 'react';

export default function VersionNotice() {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    const current = Array.from(document.scripts).find((script) => script.type === 'module' && script.src.includes('/assets/'))?.src;
    if (!current) return;
    let active = true;
    const check = async () => {
      try {
        const response = await fetch('/?version-check=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) return;
        const html = await response.text();
        const next = new DOMParser().parseFromString(html, 'text/html').querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src');
        if (active && next) setOutdated(new URL(next, location.origin).href !== current);
      } catch {}
    };
    void check();
    const timer = window.setInterval(check, 15000);
    window.addEventListener('focus', check);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', check); };
  }, []);
  return outdated ? <div className="panel col g8" role="status" style={{ margin: 12 }}><span>当前页面有新版，加载后生效。已保存的记录会保留。</span><button className="btn" onClick={() => location.reload()}>加载新版</button></div> : null;
}
