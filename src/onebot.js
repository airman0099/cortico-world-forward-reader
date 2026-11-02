/**
 * 跟 SnowLuma 的 OneBot HTTP 接口说话：只读地取消息、递归取合并转发。
 *
 * 踩过的坑（别再踩）：
 *  1. token 一律从配置文件读，别手抄——抄错一个字符会一直 unauthorized。
 *  2. forward 段的 id 形如 `ncBv/AS8.../KI7M=`，带 / 和 =，必须 encodeURIComponent。
 *  3. 返回结构是 data.messages[].message[]；forward 段是 {type:'forward', data:{id}}。
 */
import { readFileSync } from 'node:fs';

function readSnowluma(cfg) {
  const path = String(cfg.snowlumaConfig || '').trim();
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** 从 SnowLuma 配置里找一条 httpServers：优先 enabled 的。 */
export function httpServerFrom(cfg) {
  const raw = readSnowluma(cfg);
  const servers = raw?.networks?.httpServers;
  if (!Array.isArray(servers) || !servers.length) return null;
  return servers.find((s) => s && s.enabled) || servers[0];
}

export function resolveEndpoint(cfg) {
  const server = httpServerFrom(cfg);
  const base = String(cfg.baseUrl || '').trim();
  let url = base;
  if (!url && server) {
    const host = server.host && server.host !== '0.0.0.0' ? server.host : '127.0.0.1';
    url = `http://${host}:${server.port || 3000}`;
  }
  if (!url) url = 'http://127.0.0.1:3000';
  return url.replace(/\/+$/, '');
}

export function resolveToken(cfg) {
  const manual = String(cfg.token || '').trim();
  if (manual) return manual;
  const server = httpServerFrom(cfg);
  return String(server?.accessToken || '');
}

export function describeSource(cfg) {
  const server = httpServerFrom(cfg);
  if (!server) {
    return `没读到 SnowLuma 配置（${cfg.snowlumaConfig || '(空)'}）；只能靠 baseUrl/token 手填。`;
  }
  const token = resolveToken(cfg);
  return `SnowLuma 配置：${server.host || '127.0.0.1'}:${server.port || '?'}，enabled=${server.enabled}，token=${token ? '有(' + token.length + ' 字)' : '没有'}`;
}

/** 调一次 OneBot 接口，返回 data；失败抛错。 */
export async function callOneBot(cfg, action, params = {}) {
  const endpoint = resolveEndpoint(cfg);
  const url = new URL(`${endpoint}/${action}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  const token = resolveToken(cfg);
  if (token) url.searchParams.set('access_token', token);

  const timeout = Math.max(1000, Number(cfg.timeoutMs) || 15000);
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  } catch (err) {
    const why = err?.name === 'TimeoutError' ? `等了 ${timeout}ms 没回` : err?.message || String(err);
    throw new Error(
      `${endpoint} 连不上（${why}）。多半是 SnowLuma 的 OneBot HTTP 服务没开：` +
        `在 SnowLuma 控制台把 httpServers 那条打开，或者先启动 SnowLuma。`,
    );
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`接口返回的不是 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }
  if (json.retcode !== undefined && json.retcode !== 0) {
    const why = json.wording || json.message || `retcode ${json.retcode}`;
    if (String(why).toLowerCase().includes('unauthor')) {
      throw new Error(`接口说没授权（${why}）：token 不对。检查 ${cfg.snowlumaConfig} 里的 accessToken，别手抄。`);
    }
    throw new Error(`接口 ${action} 失败：${why}`);
  }
  if (json.status === 'failed') {
    throw new Error(`接口 ${action} 失败：${json.wording || json.message || '没给原因'}`);
  }
  return json.data ?? json;
}

/** 一条消息里的某个段 → 一行给人看的小字。 */
export function segmentText(seg) {
  if (!seg || typeof seg !== 'object') return '';
  const d = seg.data || {};
  switch (seg.type) {
    case 'text':
      return d.text || '';
    case 'image':
      return `[图片${d.summary ? '：' + d.summary : ''}]`;
    case 'face':
      return `[表情${d.id ? ':' + d.id : ''}]`;
    case 'mface':
      return `[表情包${d.summary ? '：' + d.summary : ''}]`;
    case 'at':
      return `@${d.name || d.qq || '某人'}`;
    case 'reply':
      return '[回复]';
    case 'forward':
      return '[又一层转发]';
    case 'video':
      return '[视频]';
    case 'record':
      return '[语音]';
    case 'file':
      return `[文件${d.name ? '：' + d.name : ''}]`;
    case 'json':
    case 'xml':
      return '[卡片]';
    default:
      return `[${seg.type}]`;
  }
}
