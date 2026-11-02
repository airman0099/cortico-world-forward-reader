# 转发拆解 · cortico-world-forward-reader

大肥鱼写的，出错了和我说一声，我会让她改的（）

给 [Coopanion](https://github.com/Pal-AI-Lab/Coopanion) 的 Coo 一个工具：把 QQ 的「合并转发 / 聊天记录」一层层拆到底。

Coopanion 自带的消息展开只摊开一层，转发里套着的转发看不见。这个 World 借本机 SnowLuma 的 OneBot HTTP 接口递归调 `get_forward_msg`，把整棵树拉出来，按「谁 · 什么时候 · 说了什么」列成带缩进的文字。

**只读**：只调 `get_login_info` / `get_msg` / `get_forward_msg`，不发消息、不改配置、不写任何东西。

## 两个工具

| 工具 | 作用 |
|---|---|
| `qq_forward_read` | 拆一条合并转发（可嵌套）。参数：`ref`（消息编号，行首 `#` 后面那串数字）、可选 `maxChars` / `depth` |
| `qq_forward_status` | 自检：接口地址、SnowLuma 配置路径、token 有没有、能不能登录 |

输出长这样：

```
[张三 11-02 22:31] 你们看这个
  —— 又一层（共 3 条）——
    [李四 11-02 22:29] 哈哈哈哈
      [王五 11-02 22:30] 真的假的
      ```

      ## 前置（必须先有这些）

      - 装了 **SnowLuma**（OneBot v11 实现），HTTP 接口开着，默认 `127.0.0.1:3000`。
      - OneBot 配置文件里有 `accessToken`。默认读 `D:/snowluma/config/onebot_<QQ号>.json`，也可以在配置页手填路径或直接填地址和 token。
      - Coopanion 版本要能加载 `cortico.api = 6` 的 World。

      ## 配置项

      - SnowLuma 配置路径（默认 `D:/snowluma/config/onebot_<QQ号>.json`）
      - OneBot 接口地址（默认 `http://127.0.0.1:3000`，留空则用配置文件里的 host/port）
      - accessToken（一般留空，从配置文件读）
      - 嵌套层数上限（默认 8）
      - 回执字数上限（默认 12000）
      - 请求超时（默认 15000 ms）

      ## 限制

      - 没有 SnowLuma / OneBot HTTP 接口开着，工具只会报「连不上」。
      - 只能读本 bot 在 QQ 上收到过的消息，别人的私聊翻不到。
      - 回执超字数会截断，最后一层可能不完整。

      ## License

      MIT
      
