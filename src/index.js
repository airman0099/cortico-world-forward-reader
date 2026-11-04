/**
 * 杞彂鎷嗚В锛坈ortico-world-forward-reader锛夆€斺€?World 鍏ュ彛銆? *
 * 涓讳汉鐨勭棝鐐癸細QQ 鐨勩€屽悎骞惰浆鍙戙€嶉噷杩樺鐫€銆屽悎骞惰浆鍙戙€嶏紝Coopanion 鍙憡寮€绗竴灞傦紝
 * 閲岄潰鐨勫唴瀹规垜鐪嬩笉瑙併€傝繖涓?World 鍊?SnowLuma 鐨?OneBot HTTP 鎺ュ彛閫掑綊璋?get_forward_msg锛? * 鎶婃暣妫垫爲鎽婃垚涓€浠藉甫缂╄繘鐨勬枃瀛椼€? *
 * 绾?ESM JS銆侀浂渚濊禆锛堝彧鐢?node: 鍐呯疆 + fetch锛夛紝鍙锛屼笉鍙戞秷鎭€佷笉鏀归厤缃€? */
import { CONFIG_GROUP, DEFAULTS, WORLD_ID } from './config.js';
import { TOOL_DECLS } from './tools.js';
import { callOneBot, describeSource, resolveEndpoint, resolveToken, segmentText } from './onebot.js';

const LABEL = '杞彂鎷嗚В';
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
  return `${cut.slice(0, at > 0 ? at : cut.length)}\n鈥︼紙澶暱锛屾埅鏂簡銆傛兂鐪嬪悗闈㈠彲浠ヨ皟澶?maxChars锛屾垨鑰呮媶鎴愬嚑鏉″垎鍒湅锛塦;
}

function pad(depth) {
  return '  '.repeat(depth);
}

function senderName(sender) {
  if (!sender) return '?';
  return sender.card || sender.nickname || (sender.user_id ? String(sender.user_id) : '?');
}

/** 浠婂ぉ鐨勬椂闂村彧缁?HH:MM锛涜法澶╃殑甯︿笂鏃ユ湡锛屽厤寰楁暣浠借褰曞垎涓嶆竻鍝ぉ銆?*/
function clockOf(time) {
  if (!time) return '';
  const d = new Date(Number(time) * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return `${hh}:${mm}`;
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear() === now.getFullYear() ? '' : `${d.getFullYear()}-`;
  return `${year}${mo}-${dd} ${hh}:${mm}`;
}

/** 鎶婁竴鏉℃秷鎭殑娈靛悎鎴愪竴琛岋紝骞舵寫鍑洪噷闈㈠祵濂楃殑杞彂娈点€?*/
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

  /** 鐜鎻愮ず璇嶆ā鏉挎病鏈夊崰浣嶅彉閲忥紱杩斿洖绌哄璞¤〃绀轰繚鐣欐ā鏉垮叏鏂囷紙杩斿洖 null 浼氭暣娈电渷鐣ワ級銆?*/
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
    return fail(`鏈煡宸ュ叿锛?{name}`);
  }

  async status() {
    const lines = [`OneBot 鎺ュ彛锛?{resolveEndpoint(this.cfg)}`, describeSource(this.cfg)];
    const token = resolveToken(this.cfg);
    if (!token) lines.push('token锛氱┖锛圫nowLuma 澶氬崐瑕佹眰 token锛屽伐鍏蜂細澶辫触锛?);
    try {
      const data = await callOneBot(this.cfg, 'get_login_info');
      const name = data?.nickname || data?.user_id || '(娌＄粰)';
      lines.push(`璋?get_login_info 鎴愬姛锛?{name}锛圦Q ${data?.user_id ?? '?'}锛塦);
      lines.push('缁撹锛氳兘鎷嗐€?);
    } catch (err) {
      lines.push(`璋?get_login_info 澶辫触锛?{err.message}`);
      lines.push('缁撹锛氳繕涓嶈兘鎷嗭紝鍏堟妸涓婇潰閭ｄ竴姝ヤ慨濂姐€?);
    }
    return lines.join('\n');
  }

  async read(args) {
    const cfg = this.cfg;
    const rawRef = String(args.ref ?? '')
      .trim()
      .replace(/^#/, '')
      .trim();
    if (!rawRef) return fail('瑕佺粰娑堟伅缂栧彿锛圦Q 娑堟伅琛岄鐨?#鍚庨潰閭ｄ覆鏁板瓧锛夈€?);
    // QQ 鐨?message_id 鏈夎礋鏁扮殑锛堝悎骞惰浆鍙戝崱鐗囧氨甯歌锛夛細璐熷彿鏄?id 鐨勪竴閮ㄥ垎锛屼笉鑳戒涪銆?    if (!/^-?\d+$/.test(rawRef)) return fail(`"${rawRef}" 涓嶅儚娑堟伅缂栧彿锛屽簲璇ユ槸鏁板瓧锛堝墠闈㈠彲鑳藉甫涓€涓礋鍙凤級锛屾瘮濡?265277450 鎴?-1175570559銆俙);

    const maxDepth = clampInt(args.depth ?? cfg.maxDepth, 8, 1, 20);
    const limit = clampInt(args.maxChars ?? cfg.maxChars, MAX_OUTPUT_CHARS, 1000, 60000);

    let data;
    try {
      data = await callOneBot(cfg, 'get_msg', { message_id: rawRef });
    } catch (err) {
      const why = String(err?.message || err);
      const hint = /not found|涓嶅瓨鍦▅鎵句笉鍒?i.test(why)
        ? '鍙栦笉鍒拌繖鏉★紝甯歌鍘熷洜锛氭秷鎭お鑰併€丼nowLuma 閭ｈ竟娌＄紦瀛樹簡锛涙垨鑰呯紪鍙锋妱閿欌€斺€旇礋鍙锋槸缂栧彿鐨勪竴閮ㄥ垎锛岄櫎浜嗚棣栫殑銆?銆嶅埆鐨勫瓧绗︿竴涓兘涓嶈兘灏戙€?
        : '';
      return fail(`鍙栨秷鎭?${rawRef} 澶辫触锛?{why}${hint ? '\n' + hint : ''}\n鍙互鍏堣窇 qq_forward_status 鐪嬬湅鎺ュ彛鍜?token 鎬庝箞鏍枫€俙);
    }

    const out = [];
    const state = { items: 0, levels: 0, truncated: false };
    const segments = data?.message || [];
    const whole = foldMessage(segments);
    const who = senderName(data?.sender);
    const when = clockOf(data?.time);

    if (!whole.nested.length) {
      // 涓嶆槸鍚堝苟杞彂锛氱洿鎺ユ妸杩欐潯娑堟伅鏈韩缁欎汉鐪嬨€?      out.push(`# 娑堟伅 ${rawRef}${who !== '?' ? ` 路 ${who}` : ''}${when ? ` 路 ${when}` : ''}`);
      out.push('');
      out.push(whole.text || '锛堟病鏈夋枃瀛楀唴瀹癸級');
      out.push('');
      out.push('杩欐潯涓嶆槸鍚堝苟杞彂鍗＄墖锛屾墍浠ユ病鏈夊彲鎷嗙殑灞傘€?);
      return cap(out.join('\n'), limit);
    }

    out.push(`# 杞彂鎷嗚В 路 娑堟伅 ${rawRef}${who !== '?' ? ` 路 ${who}` : ''}${when ? ` 路 ${when}` : ''}`);
    out.push('');

    // 鍗＄墖鏈韩甯︾殑鏂囧瓧涔熻鐣欎笅锛屼笉鐒跺彧鍒楄浆鍙戝唴瀹瑰氨鎶婂師璇濆悶鎺変簡銆?    if (whole.text) {
      out.push(`锛堣繖寮犲崱鐗囦笂杩樺啓鐫€锛?{whole.text}`);
      out.push('');
    }

    for (const seg of whole.nested) {
      await this.walk(seg.data?.id, 0, out, state, maxDepth);
    }

    out.unshift(`鍏?${state.levels} 灞?/ ${state.items} 鏉?{state.truncated ? '锛堝凡杈炬潯鏁颁笂闄愶紝鍚庨潰娌″啀寰€涓嬬炕锛? : ''}`);
    return cap(out.join('\n'), limit);
  }

  async walk(forwardId, depth, out, state, maxDepth) {
    if (!forwardId || state.truncated) return;
    if (depth >= maxDepth) {
      out.push(`${pad(depth)}鈥︼紙鍒扮 ${maxDepth} 灞傚氨涓嶅線涓嬬炕浜嗭級`);
      return;
    }
    let data;
    try {
      data = await callOneBot(this.cfg, 'get_forward_msg', { id: forwardId });
    } catch (err) {
      out.push(`${pad(depth)}鈥︼紙杩欎竴灞傚彇涓嶅嚭鏉ワ細${err.message}锛塦);
      return;
    }
    const messages = data?.messages || [];
    state.levels = Math.max(state.levels, depth + 1);

    for (const item of messages) {
      if (state.items >= MAX_ITEMS) {
        state.truncated = true;
        out.push(`${pad(depth)}鈥︼紙宸插埌 ${MAX_ITEMS} 鏉′笂闄愶紝鍓╀笅鐨勬病鍒楋級`);
        return;
      }
      const who = senderName(item?.sender);
      const when = clockOf(item?.time);
      const folded = foldMessage(item?.message);
      const head = `${pad(depth)}[${who}${when ? ' ' + when : ''}]`;
      state.items += 1;
      out.push(`${head} ${folded.text || '锛堢┖锛?}`);

      for (const seg of folded.nested) {
        state.levels = Math.max(state.levels, depth + 1);
        out.push(`${pad(depth + 1)}鈥斺€?鍙堜竴灞?鈥斺€擿);
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
