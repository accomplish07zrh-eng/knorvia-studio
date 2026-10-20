# kernel-bridge-02 夹具

夹具只放**虚构数据与占位值**，不含真实用户数据、凭据或内部服务地址。

## 一、`turn-commands.json`：回合命令面的期望

只列**语义与归属**，不复刻 schema（权威源是 `packages/shared/src/protocol-v4/command.ts`）。测试用它断言「五个字面量都在、自造名都不在」。

| 字段                   | 用途                                                          |
| ---------------------- | ------------------------------------------------------------- |
| `turnCommands`         | 本包实现的 5 个命令字面量                                     |
| `fabricatedNames`      | 不得出现的自造名（`cancelTurn`、`steer`）                     |
| `requestedDelivery`    | `sendText` 的三义取值；`guideIsSteer: true`                   |
| `heldQueueDisposition` | held 状态下的两义（`clearQueueAndSend` / `keepQueueAndSend`） |
| `expectedCommandCount` | v4 命令总数 34（计划书口径）                                  |

## 二、`fake-provider.json`：假 provider 的响应脚本

离线驱动回合时，假 provider 按这份脚本产出固定内容，使帧序列可确定性断言。

| 字段           | 用途                                                        |
| -------------- | ----------------------------------------------------------- |
| `providerId`   | 注册用的 provider 名（`knorvia-fake`）                      |
| `providerName` | 元数据里的显示名（必须非空）                                |
| `replyText`    | 纯文本回合的固定输出                                        |
| `toolCall`     | 一次工具调用的固定描述（工具名 + 参数），用于断言 tool 行帧 |

**约束**：`toolCall` 只能指向本仓库已有的内置工具（例如 `todo_write`），不得指向真实外部服务；`replyText` 不得含标记成真凭据的串。

## 三、`isolation.json`：隔离断言的期望

| 字段                   | 用途                                                |
| ---------------------- | --------------------------------------------------- |
| `redirectedHomeVars`   | 必须重定向到临时根的变量名（`HOME`、`USERPROFILE`） |
| `forbiddenEnvPrefixes` | 不得进入测试子进程的变量前缀（`DSH_`）              |
| `decoyDshHomeEntries`  | 诱饵 `~/.dsh` 里要铺的条目（虚构占位）              |
