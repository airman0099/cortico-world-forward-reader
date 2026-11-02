/** 转发拆解的配置默认值与控制台配置组（纯对象，无需宿主类型）。 */

export const WORLD_ID = 'forward-reader';

export const DEFAULTS = {
  // World 激活开关由框架管；这里只放业务配置。
  enabled: false,
  /** SnowLuma 的 OneBot 配置文件：用来读 accessToken（别手抄 token）。 */
  snowlumaConfig: 'D:/snowluma/config/onebot_2565315695.json',
  /** OneBot HTTP 接口地址；留空则用配置文件里的 host/port。 */
  baseUrl: 'http://127.0.0.1:3000',
  /** 手填 token（一般留空，从配置文件读）。 */
  token: '',
  /** 最多往下翻几层嵌套转发。 */
  maxDepth: 8,
  /** 单次回执最多多少字符。 */
  maxChars: 12000,
  /** 单次请求超时（毫秒）。 */
  timeoutMs: 15000,
};

export const CONFIG_GROUP = {
  id: 'world:forward-reader',
  owner: 'world:forward-reader',
  schema: {
    type: 'object',
    title: '转发拆解',
    description:
      '把 QQ 的「合并转发」一层层拆到底：借 SnowLuma 的 OneBot HTTP 接口递归调 get_forward_msg，' +
      '嵌套在里面的转发也会展开。只读，不发消息、不改 QQ 配置。',
    properties: {
      'worlds.forward-reader.snowlumaConfig': {
        type: 'string',
        title: 'SnowLuma 配置路径',
        description: 'OneBot 配置文件（含 accessToken）。默认 D:/snowluma/config/onebot_2565315695.json。',
        'x-hot': true,
      },
      'worlds.forward-reader.baseUrl': {
        type: 'string',
        title: 'OneBot 接口地址',
        description: '默认 http://127.0.0.1:3000；留空则用配置文件里的 host/port。',
        'x-hot': true,
      },
      'worlds.forward-reader.token': {
        type: 'string',
        title: 'accessToken（可选）',
        description: '一般留空，从上面的配置文件里读。只有配置文件里没有时才填。',
        'x-hot': true,
      },
      'worlds.forward-reader.maxDepth': {
        type: 'integer',
        title: '嵌套层数上限',
        description: '最多往下翻几层转发，默认 8。',
        minimum: 1,
        maximum: 20,
        'x-hot': true,
      },
      'worlds.forward-reader.maxChars': {
        type: 'integer',
        title: '回执字数上限',
        description: '单次拆解最多返回多少字符，默认 12000，超了截断。',
        minimum: 1000,
        maximum: 60000,
        'x-hot': true,
      },
      'worlds.forward-reader.timeoutMs': {
        type: 'integer',
        title: '请求超时(毫秒)',
        description: '单次接口请求超时，默认 15000。',
        minimum: 1000,
        maximum: 120000,
        'x-hot': true,
      },
    },
  },
};
