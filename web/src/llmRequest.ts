export class ModelRequestError extends Error {}

export async function requestModel(body: { baseUrl: string; apiKey: string; payload: unknown }, token?: string): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  let text: string;
  try {
    response = await fetch('/api/llm', {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(175000),
    });
    text = await response.text();
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new ModelRequestError(name === 'TimeoutError' || name === 'AbortError'
      ? '模型请求超时，请稍后重试，已保留输入内容'
      : '网络连接中断，请检查网络后重试，已保留输入内容');
  }
  let result: any;
  try {
    result = JSON.parse(text);
  } catch {
    throw new ModelRequestError(response.status === 504 || response.status === 408
      ? '模型请求超时，请稍后重试，已保留输入内容'
      : response.status === 502 || response.status === 503
        ? 'AI 服务暂时无法连接，请稍后重试，已保留输入内容'
        : `AI 服务返回格式异常（HTTP ${response.status}），请稍后重试`);
  }
  if (!response.ok || result?.error) {
    const message = llmError(response.status, result);
    throw new ModelRequestError(body.apiKey ? message.split(body.apiKey).join('[已隐藏]') : message);
  }
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型没有返回有效内容，请重新发送');
  return content;
}

export function llmError(status: number, result: any): string {
  if (status === 401 && typeof result?.error === 'string') {
    try {
      localStorage.removeItem('guild-session');
      sessionStorage.removeItem('guild-session');
      window.dispatchEvent(new Event('burnhero-session'));
    } catch {}
    return '登录已失效，请重新登录后再识别';
  }
  if (status === 504 && result?.error === '服务器暂时无法连接模型服务，请稍后重试或更换可访问的 API 地址') return result.error;
  if (status === 404 && typeof result?.message === 'string' && result.message.startsWith('Route')) return '服务器缺少 AI 转发接口（HTTP 404），请联系管理员更新服务';
  if (status === 401 || status === 403) return `模型服务拒绝了请求（HTTP ${status}），请检查 API Key`;
  if (status === 404) return '模型服务返回 404，请检查 API 地址是否需要带 /v1，以及模型名是否正确';
  if (status === 429) return '模型服务限流或余额不足（HTTP 429），请稍后重试或检查额度';
  if (status === 504 || status === 408) return '模型请求超时，请稍后重试，已保留输入内容';
  if (status === 502 || status === 503) return 'AI 服务暂时无法连接，请稍后重试，已保留输入内容';
  return `模型请求失败（HTTP ${status}），请检查地址、Key、模型及服务可用性`;
}

export async function withModelRetry<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ModelRequestError) throw error;
    return await action();
  }
}
