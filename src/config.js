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

  // ── 图片附件（默认开）─────────────────────────────────────────────
  /**
   * 拆到的图片下载下来，作为附件跟回执一起交给模型。
   * 能看图的模型直接看到；看不见的模型只会收到 fallbackText，不会出错。
   */
  attachImages: true,
  /** 一次最多贴几张附件，多出来的只在正文留链接；识图也用这一个上限。 */
  attachMax: 6,
  /** 单张图最大多少 MB，超了就不贴（正文里还有链接）。 */
  attachMaxMb: 8,

  // ── 识图（只在工具调用时明确要求才跑）─────────────────────────────────
  /**
   * 不设开关：图默认当附件交给模型，再自动识一遍是白花钱。
   * 只有 qq_forward_read 传了 captions: true 才会调视觉端点。
   */
  /** 每句描述最多多少字。 */
  captionChars: 60,
  // 视觉端点不在这配：自己去本机 Coopanion 的配置里找（一般就是 QQ群聊插件那份），
  // 配置页里一个格子都不露——留空格子只会让人以为非得填。
};

export const CONFIG_GROUP = {
  id: 'world:forward-reader',
  owner: 'world:forward-reader',
  schema: {
    type: 'object',
    title: '转发拆解',
    description:
      '把 QQ 的「合并转发」一层层拆到底，嵌套在里面的转发也展开，按人、按时间列成带缩进的文字。' +
      '前置：先装 QQ群聊插件（本 World 借它的 OneBot 接口取消息，自己不连 QQ）。' +
      '拆到的图片默认作为附件交给模型，看不见图的模型只会读到一行文字说明。只读，不发消息、不改 QQ 配置。',
    properties: {
      'worlds.forward-reader.snowlumaConfig': {
        type: 'string',
        title: 'SnowLuma 配置路径',
        description: 'OneBot 配置文件，里面存着 accessToken；换了 QQ 号才需要改。',
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
      'worlds.forward-reader.attachImages': {
        type: 'boolean',
        title: '把图片当附件一起交出去',
        description:
          '拆到的图片下载下来当附件交给模型：能看图就直接看到，看不见图只会读到一行文字说明。关掉就只留链接。',
        'x-hot': true,
      },
      'worlds.forward-reader.attachMax': {
        type: 'integer',
        title: '一次最多处理几张图',
        description: '默认 6：附件和识图共用这一个上限，多出来的只在正文里留链接。',
        minimum: 0,
        maximum: 30,
        'x-hot': true,
      },
      'worlds.forward-reader.attachMaxMb': {
        type: 'integer',
        title: '单张图大小上限(MB)',
        description: '超过这个大小的图不贴，只在正文里留链接。默认 8。',
        minimum: 1,
        maximum: 32,
      },
      'worlds.forward-reader.captionChars': {
        type: 'integer',
        title: '每句描述字数',
        description: '每张图的描述最多多少字，默认 60。',
        minimum: 20,
        maximum: 200,
      },
    },
  },
};
