import { ERROR_KEYS, resolveLanguage } from '../shared/languages.js';

// 公网演示在浏览器内完成，不依赖本机端口。普通构建仍保留原服务端 AI 接口。
const publicDemo = import.meta.env.MODE === 'public';
const demoStore = { name: 'Sunny Tea House', city: 'San Jose' };

export async function getShopConfig() {
  if (publicDemo) {
    const { TAGS } = await import('../shared/review-demo.js');
    return { store: demoStore, tags: TAGS, demo: true, notificationEnabled: false,
      urls: { Google: '', 小红书: 'https://www.xiaohongshu.com/' } };
  }
  const response = await fetch('/api/config', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('loadError');
  return response.json();
}

export async function requestReview(input) {
  if (publicDemo) {
    const { demoReview } = await import('../shared/review-demo.js');
    const language = resolveLanguage(input.language, input.platform);
    return { content: demoReview({ ...input, language }, demoStore), platform: input.platform, language, demo: true };
  }
  const response = await fetch('/api/reviews', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), signal: AbortSignal.timeout(80000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(ERROR_KEYS[data.error] || 'serverError');
  return data;
}
