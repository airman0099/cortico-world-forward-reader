/**
 * 识图：拿 Coopanion 里已经配好的视觉端点（qqbot.vision）给一张图配一句描述。
 *
 * 为什么不直接抄一个模型名和 key：主人在设置里换端点/换模型时，这里跟着变，不用改代码。
 * 端点按 OpenAI 兼容格式 POST /chat/completions，content 里混 text + image_url（data URL 也行）。
 *
 * 踩过的坑：
 *  1. max_tokens 给小了（比如 8）会被 reasoning_tokens 吃光，message.content 是空串——至少给 200。
 *  2. 图片要先下载成 buffer 再转 base64，直接把外链丢过去有的端点拉不到（QQ 的图还带 rkey）。
 */
import { readFile } from 'node:fs/promises';

const MAX_BYTES = 6 * 1024 * 1024;

/** 从 Coopanion 的配置文件里读 qqbot.vision；读不到就返回 null。 */
async function readHostVision(configPath) {
  if (!configPath) return null;
  try {
    const raw = await readFile(configPath, 'utf8');
    const json = JSON.parse(raw);
    const v = json?.worlds?.qqbot?.vision ?? json?.qqbot?.vision;
    if (!v || !v.endpoint || !v.model) return null;
    return {
      endpoint: String(v.endpoint),
      model: String(v.model),
      key: String(v.apiKeySecret || v.apiKey || ''),
    };
  } catch {
    return null;
  }
}

/** 配置里的显式值优先，其次读宿主配置。 */
export async function resolveVision(cfg) {
  const own = {
    endpoint: String(cfg.visionEndpoint || '').trim(),
    model: String(cfg.visionModel || '').trim(),
    key: String(cfg.visionKey || '').trim(),
  };
  if (own.endpoint && own.model) return own;
  const host = await readHostVision(cfg.visionConfig);
  if (!host) return null;
  return {
    endpoint: own.endpoint || host.endpoint,
    model: own.model || host.model,
    key: own.key || host.key,
  };
}

function guessMime(buf) {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57) return 'image/webp';
  return 'image/jpeg';
}

async function fetchImage(url, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`下载图片失败：HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('下载图片失败：拿到空文件');
    if (buf.length > MAX_BYTES) throw new Error(`图片太大（${Math.round(buf.length / 1024)} KB）`);
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 给一张图配一句描述。失败就返回一句人话，不抛——识图失败不该把整份拆解弄坏。
 */
export async function captionImage(vision, url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 30000;
  const chars = opts.chars ?? 60;
  if (!vision) return '（没找到能用的视觉端点）';
  let buf;
  try {
    buf = await fetchImage(url, timeoutMs);
  } catch (err) {
    return `（图取不下来：${err.message}）`;
  }
  const dataUrl = `data:${guessMime(buf)};base64,${buf.toString('base64')}`;
  const body = {
    model: vision.model,
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `用中文一句话说清这张图是什么，不超过 ${chars} 字，别铺垫。` },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${vision.endpoint.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(vision.key ? { Authorization: `Bearer ${vision.key}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return `（识图失败：HTTP ${res.status}）`;
    const json = JSON.parse(text);
    const out = String(json?.choices?.[0]?.message?.content || '').trim();
    return out || '（端点没给出描述）';
  } catch (err) {
    const why = err?.name === 'AbortError' ? '超时' : err?.message || String(err);
    return `（识图失败：${why}）`;
  } finally {
    clearTimeout(timer);
  }
}
