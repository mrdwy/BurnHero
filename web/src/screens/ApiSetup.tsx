import { useState } from 'react';
import { setState, useStore } from '../store';
import { Panel, Title } from '../components/ui';
import { validApiConfig } from '../validate';

export function ApiConfiguration() {
  const saved = useStore((state) => state.llm);
  const [config, setConfig] = useState({ ...saved, demo: false });
  const [message, setMessage] = useState('');
  const update = (key: 'baseUrl' | 'apiKey' | 'model', value: string) => {
    setConfig({ ...config, [key]: value });
    setMessage('');
  };
  const save = () => {
    setState((state) => { state.llm = { ...config, baseUrl: config.baseUrl.trim().replace(/\/+$/, ''), apiKey: config.apiKey.trim(), model: config.model.trim(), demo: false }; });
    setMessage('配置已保存');
  };
  return (
    <form className="panel col g8" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <Title icon="gear">配置看图模型</Title>
      <label className="col">API 地址<input className="input" value={config.baseUrl} placeholder="https://api.openai.com/v1" onChange={(event) => update('baseUrl', event.target.value)} /></label>
      <label className="col">API Key<input className="input" type="password" autoComplete="off" value={config.apiKey} placeholder="输入你的 API Key" onChange={(event) => update('apiKey', event.target.value)} /></label>
      <label className="col">模型<input className="input" value={config.model} placeholder="填写支持图片识别的模型名称" onChange={(event) => update('model', event.target.value)} /></label>
      <span className="small dim">填写后直接保存，不做连接审核。截图和描述将发送到你配置的服务；Key 保存在本机浏览器。</span>
      <button className="btn big" type="submit" disabled={!validApiConfig(config)}>保存 API，继续</button>
      {message && <div role="status" className="green small">{message}</div>}
    </form>
  );
}

export default function ApiSetup() {
  return <div className="screen" style={{ paddingBottom: 24 }}><Panel className="col"><h1>连接你的 AI 教练</h1><span>填写 API 后即可上传截图，直接交给模型处理。</span></Panel><ApiConfiguration /></div>;
}
