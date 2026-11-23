// 本地转发：浏览器 → 本机服务器 → 大模型 API。
// 很多大模型 API 不允许浏览器直接跨域调用，所以由本机 Node 转发一次。
// Key 只在用户自己的浏览器和本机之间传递，不经过任何第三方服务器。
export async function handleLlm(req, res) {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { baseUrl, apiKey, payload } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!baseUrl || !apiKey) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: '缺少 API 地址或 Key' } }));
    }
    const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000),
    });
    const text = await r.text();
    res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json' });
    res.end(text);
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: '转发失败: ' + (e?.message || e) } }));
  }
}
