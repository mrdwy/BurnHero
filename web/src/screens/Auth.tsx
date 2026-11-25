import { useState } from 'react';
import { Panel, Title } from '../components/ui';
import { request } from '../guildClient';
import { saveSession } from '../session';

const ACCOUNT = /^([^\s@]+@[^\s@]+\.[^\s@]+|\+?[1-9]\d{7,14})$/;

// 首屏：注册或登录勇者账号。成功后进入 API 配置和身体评估。
export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const register = mode === 'register';
  const account = login.trim().toLowerCase();
  const valid = ACCOUNT.test(account) && password.length >= 10 && password.length <= 128;

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      const base = { origin: location.origin, id: '', token: '' };
      const body: Record<string, string> = { login: account, password };
      if (register && name.trim()) body.name = name.trim().slice(0, 24);
      const result = await (await request(base, register ? '/register' : '/login', 'POST', body)).json();
      if (!result?.token) throw Error('登录失败，请重试');
      setPassword('');
      saveSession({ origin: base.origin, id: result.id, token: result.token });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg === '记录冲突' ? '这个账号已经注册过，请直接登录' : msg || '网络连接失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen" style={{ paddingBottom: 24 }}>
      <Panel className="col center">
        <h1>燃脂勇者</h1>
        <span className="small dim">{register ? '先创建勇者账号，打卡和战队数据会跟着账号走。' : '欢迎回来，登录后继续冒险。'}</span>
      </Panel>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={register} className={register ? 'on' : ''} onClick={() => { setMode('register'); setError(''); }}>注册</button>
        <button role="tab" aria-selected={!register} className={!register ? 'on' : ''} onClick={() => { setMode('login'); setError(''); }}>登录</button>
      </div>
      <form className="panel col g8" onSubmit={(e) => { e.preventDefault(); if (valid && !busy) void submit(); }}>
        <Title icon="helmet">{register ? '注册勇者账号' : '登录'}</Title>
        <label className="col">账号<input className="input" value={login} autoComplete="username" inputMode="email" placeholder="邮箱或手机号" onChange={(e) => setLogin(e.target.value)} /></label>
        <label className="col">密码<input className="input" type="password" value={password} autoComplete={register ? 'new-password' : 'current-password'} placeholder="至少 10 位" onChange={(e) => setPassword(e.target.value)} /></label>
        {register && <label className="col">昵称（可选）<input className="input" value={name} maxLength={24} placeholder="勇者" onChange={(e) => setName(e.target.value)} /></label>}
        {login && !ACCOUNT.test(account) && <span className="small dim">请输入邮箱，或带区号的手机号</span>}
        {password && password.length < 10 && <span className="small dim">密码至少 10 位</span>}
        {error && <div role="alert" className="err">{error}</div>}
        <button className="btn big" type="submit" disabled={!valid || busy}>{busy ? '请稍候…' : register ? '注册并开始' : '登录'}</button>
      </form>
    </div>
  );
}
