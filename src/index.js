/**
 * 转发拆解（cortico-world-forward-reader）—— World 入口。
 *
 * 主人的痛点：QQ 的「合并转发」里还套着「合并转发」，Coopanion 只摊开第一层，
 * 里面的内容我看不见。这个 World 借 SnowLuma 的 OneBot HTTP 接口递归调 get_forward_msg，
 * 把整棵树摊成一份带缩进的文字。
 *
 * 纯 ESM JS、零依赖（只用 node: 内置 + fetch），只读，不发消息、不改配置。
 */
import { CONFIG_GROUP, DEFAULTS, WORLD_ID } from './config.js';
import { TOOL_DECLS } from './tools.js';
import { callOneBot, describeSource, resolveEndpoint, resolveToken, segmentText } from './onebot.js';

const LABEL = '转发拆解';
const MAX_OUTPUT_CHARS = 12000;
const MAX_ITEMS = 600;

const fail = (text) => ({ text, failed: true });

function clampInt(v, dflt, lo, hi) {
  const n = Number(v);
  const base = Number.isFinite(n) ? Math.round(n) : dflt;
  return Math.min(hi, Math.max(lo, base));
}

function cap(text, limit) {
  const max = Math.max(1000, Number(limit) || MAX_OUTPUT_CHARS);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf('\n');
  return `${cut.slice(0, at > 0 ? at : cut.length)}\n…（太长，截断了。想看后面可以调大 maxChars，或者拆成几条分别看）`;
}

function pad(depth) {
  return '  '.repeat(depth);
}

function senderName(sender) {
  if (!sender) return '?';
  return sender.card || sender.nickname || (sender.user_id ? String(sender.user_id) : '?');
}

function clockOf(time) {
  if (!time) return '';
  const d = new Date(Number(time) * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 把一条消息的段合成一行，并挑出里面嵌套的转发段。 */
function foldMessage(segments) {
  const parts = [];
  const nested = [];
  for (const seg of segments || []) {
    if (!seg) continue;
    if (seg.type === 'forward') {
      nested.push(seg);
      continue;
    }
    const piece = segmentText(seg);
    if (piece) parts.push(piece);
  }
  return { text: parts.join('').trim(), nested };
}

export class ForwardReaderWorld {
  constructor({ cfg, botDir }) {
    this.id = WORLD_ID;
    this.cfg = cfg;
    this.botDir = botDir;
    this.host = null;
  }

  async start(host) {
    this.host = host ?? null;
  }

  async stop() {
    this.host = null;
  }

  /** 环境提示词模板没有占位变量；返回空对象表示保留模板全文（返回 null 会整段省略）。 */
  envPromptVars() {
    return {};
  }

  webUi() {
    return {
      label: LABEL,
      config: [CONFIG_GROUP],
    };
  }

  tools() {
    return TOOL_DECLS.map(({ summary, ...decl }) => ({
      ...decl,
      handler: (args) => this.handle(decl.name, args ?? {}),
    }));
  }

  async handle(name, args) {
    if (name === 'qq_forward_read') return this.read(args);
    if (name === 'qq_forward_status') return this.status(args);
    return fail(`未知工具：${name}`);
  }

  async status() {
    const lines = [`OneBot 接口：${resolveEndpoint(this.cfg)}`, describeSource(this.cfg)];
    const token = resolveToken(this.cfg);
    if (!token) lines.push('token：空（SnowLuma 多半要求 token，工具会失败）');
    try {
      const data = await callOneBot(this.cfg, 'get_login_info');
      const name = data?.nickname || data?.user_id || '(没给)';
      lines.push(`调 get_login_info 成功：${name}（QQ ${data?.user_id ?? '?'}）`);
      lines.push('结论：能拆。');
    } catch (err) {
      lines.push(`调 get_login_info 失败：${err.message}`);
      lines.push('结论：还不能拆，先把上面那一步修好。');
    }
    return lines.join('\n');
  }

  async read(args) {
    const cfg = this.cfg;
    const rawRef = String(args.ref ?? '')
      .trim()
      .replace(/^#/, '');
    if (!rawRef) return fail('要给消息编号（QQ 消息行首的 #后面那串数字）。');
    if (!/^\d+$/.test(rawRef)) return fail(`"${rawRef}" 不像消息编号，应该是纯数字，比如 265277450。`);

    const maxDepth = clampInt(args.depth ?? cfg.maxDepth, 8, 1, 20);
    const limit = clampInt(args.maxChars ?? cfg.maxChars, MAX_OUTPUT_CHARS, 1000, 60000);

    const out = [];
    const state = { items: 0, levels: 0, truncated: false };

    try {
      const data = await callOneBot(cfg, 'get_msg', { message_id: rawRef });
      const segments = data?.message || [];
      const whole = foldMessage(segments);

      if (!whole.nested.length) {
        // 不是合并转发：直接把这条消息本身给人看。
        const who = senderName(data?.sender);
        const when = clockOf(data?.time);
        out.push(`# 消息 ${rawRef}${who !== '?' ? ` · ${who}` : ''}${when ? ` · ${when}` : ''}`);
        out.push('');
        out.push(whole.text || '（没有文字内容）');
        out.push('');
        out.push('这条不是合并转发卡片，所以没有可拆的层。');
        return cap(out.join('\n'), limit);
      }

      const time = clockOf(data?.time);
      out.push(`# 转发拆解 · 消息 ${rawRef}${time ? ` · ${time}` : ''}`);
      out.push('');

      for (const seg of whole.nested) {
        await this.walk(seg.data?.id, 0, out, state, maxDepth);
      }

      out.unshift(`共 ${state.levels} 层 / ${state.items} 条${state.truncated ? '（已达条数上限，后面没再往下翻）' : ''}`);
      return cap(out.join('\n'), limit);
    } catch (err) {
      return fail(`拆不开：${err.message}\n可以先跑 qq_forward_status 看看接口和 token 怎么样。`);
    }
  }

  async walk(forwardId, depth, out, state, maxDepth) {
    if (!forwardId || state.truncated) return;
    if (depth >= maxDepth) {
      out.push(`${pad(depth)}…（到第 ${maxDepth} 层就不往下翻了）`);
      return;
    }
    let data;
    try {
      data = await callOneBot(this.cfg, 'get_forward_msg', { id: forwardId });
    } catch (err) {
      out.push(`${pad(depth)}…（这一层取不出来：${err.message}）`);
      return;
    }
    const messages = data?.messages || [];
    state.levels = Math.max(state.levels, depth + 1);

    for (const item of messages) {
      if (state.items >= MAX_ITEMS) {
        state.truncated = true;
        out.push(`${pad(depth)}…（已到 ${MAX_ITEMS} 条上限，剩下的没列）`);
        return;
      }
      const who = senderName(item?.sender);
      const when = clockOf(item?.time);
      const folded = foldMessage(item?.message);
      const head = `${pad(depth)}[${who}${when ? ' ' + when : ''}]`;
      state.items += 1;
      out.push(`${head} ${folded.text || '（空）'}`);

      for (const seg of folded.nested) {
        state.levels = Math.max(state.levels, depth + 1);
        out.push(`${pad(depth + 1)}—— 又一层 ——`);
        await this.walk(seg.data?.id, depth + 1, out, state, maxDepth);
      }
    }
  }
}

export const FORWARD_READER = {
  id: WORLD_ID,
  label: LABEL,
  defaults: () => ({ ...DEFAULTS }),
  create: (ctx) => new ForwardReaderWorld({ cfg: ctx.cfg, botDir: ctx.botDir }),
  describe: {
    tools: TOOL_DECLS.map(({ summary, ...decl }) => ({ ...decl, summary })),
    events: [],
  },
  config: CONFIG_GROUP,
};

export default FORWARD_READER;
