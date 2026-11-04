/**
 * 识图：借本机已经配好的视觉端点，给一张图配一句描述。
 *
 * 端点从哪来：本机 Coopanion 的配置里找（一般是 QQ 那份 qqbot.vision），找到就用，
 * 找不到就老实说没找到。配置页里不给格子填——留空的格子只会让人以为非得填。
 * 写死不合适的盘符和模型名没有意义——换台机器就跑不通。
 * 端点按 OpenAI 兼容格式 POST /chat/completions，content 里混 text + image_url（data URL 也行）。
 *
 * 踩过的坑：
 *  1. max_tokens 给小了（比如 8）会被 reasoning_tokens 吃光，message.content 是空串——至少给 200。
 *  2. 图片要先下载成 buffer 再转 base64，直接把外链丢过去有的端点拉不到（QQ 的图还带 rkey）。
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * 本机上可能放着 Coopanion 配置的地方，按顺序试。
 * 不写死盘符：跑在 Coopanion 里时应用目录就是 execPath 的目录，外面手动跑也能从 cwd 猜。
 */
function configCandidates() {
  const dirs = [dirname(process.execPath), join(dirname(process.execPath), '..'), process.cwd()];
  const out = [];
  if (process.env.COOPANION_CONFIG) out.push(process.env.COOPANION_CONFIG);
  for (const dir of dirs) {
    out.push(join(dir, 'data', 'home', 'companion', 'config.json'));
    out.push(join(dir, 'home', 'companion', 'config.json'));
    out.push(join(dir, 'config.json'));
  }
  return [...new Set(out)];
}

/** 从一份 Coopanion 配置里取视觉端点；没配就返回 null。 */
async function readVisionFrom(configPath) {
  try {
    const raw = await readFile(configPath, 'utf8');
    const json = JSON.parse(raw);
    const v = json?.worlds?.qqbot?.vision ?? json?.qqbot?.vision ?? json?.vision;
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

/** 配置里指定了路径就只读那一份，没指定就自己在本机找。 */
async function readHostVision(configPath) {
  if (configPath) return readVisionFrom(configPath);
  for (const path of configCandidates()) {
    const found = await readVisionFrom(path);
    if (found) return found;
  }
  return null;
}

/** 只认本机 Coopanion 配置里已经配好的视觉端点；找不到就返回 null。 */
export async function resolveVision() {
  return readHostVision(process.env.COOPANION_CONFIG || '');
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
  if (!vision) return '（没找到视觉端点：需要先在 QQ群聊插件里把视觉端点配好）';
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
