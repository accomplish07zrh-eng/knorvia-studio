# core-runtime-helpers-01 合同（v1）

`apps/cli/packages/core/src/runtime/helpers/**` —— 附件与媒体预算、权限中转、子 Agent 中转、
steering、提醒与压缩选择等运行时助手（M2 · 高难度 · 60 个继承文件 / 6,919 行）。

> **版本 v1**：合同任何改动都要重跑旧门并升版本；旧门结果见 [`gate-old.json`](gate-old.json)，
> 覆盖与未覆盖项见 [`acceptance.md`](acceptance.md)。

## 范围

- **60 个继承文件**（继承口径 `licensing/current-files.json`，正好到单包 60 上限）：
  `upstream-modified` 44、`unreviewed` 7、`upstream-unchanged` 9（见 `scope-files.json`）。
- **不在范围的相邻文件**（本包不改，接口默认不可变）：
  - `src/runtime/methods/**` —— 模型请求、流式、压缩执行、回合状态机等，属后续包
    `core-runtime-methods-01` / `-02`；
  - `src/runtime/` 根与其余装配文件（`runtime.ts`、`session-mode-port.ts`、`types.ts`、`deps.ts`、
    `internal.ts`）以及 `agent/**`、`compact/**`、`permission/**`、`subagent/**`、`tool/**`、
    `memory/**`、`errors/**` —— 属 `core-runtime-01` 或其他包；
  - 包根 `src/index.ts`（core-03 已合并）；core-01 / core-02 / core-03、试点 1（hooks）、
    adapters 与 tool 包的区域同样不碰。
- **合同前的无用代码删除**（单独提交，不写进行为条目）：`attachments.ts` 的 3 个再导出
  （`parseDataUrlHeader`、`inferImageMimeFromPath`、`prepareImageDataUrl`）与 `compact.ts` 的
  `CompactEntrySelection` 类型再导出 —— knip（main 基线同源）与 `dep:refs` 均确认包外零引用。

## 黑盒入口

- **桶入口**：`runtime/helpers/index.ts`（26 个 `export *`）。
- **模块路径入口**：`interface.md` 里的其余模块按相对路径直接导入，同样是兼容面。
- 两种运行方式都要过：**源码入口**（tsx 加载 `src/**/*.ts`）与 **dist 入口**
  （`pnpm --dir apps/cli/packages/core build` 后的 `dist/**/*.js`），由环境变量
  `KNORVIA_CORE_RUNTIME_HELPERS_01_ENTRY=dist` 切换。

## 文件

| 文件                                   | 说明                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `behavior.md`                          | B1–B47 行为条目，每条九项（输入/输出/错误语义/时序与并发/幂等/资源释放/平台差异/状态所有者/日志级别） |
| `interface.md`                         | 60 个模块 × 316 个导出（296 个运行时值 + 20 个纯类型），机器生成后未手改                              |
| `callers.md`                           | `dep:refs` 同源静态分析：1,089 个包外引用点、253 个有外部调用方的导出                                 |
| `tests/`                               | 契约测试（node:test，黑盒，只经公开入口；源码 + dist 双入口）                                         |
| `fixtures/`                            | 事件序列夹具（模拟模型流：并发工具 → 压缩触发点 → 中途取消），脱敏虚构数据                            |
| `known-differences.md`                 | 预登记差异与边界裁定，每条都有理由与对应测试                                                          |
| `acceptance.md`                        | 范围、旧门结果、覆盖与未覆盖项                                                                        |
| `stubs/`（60 个「import 即抛」最小桩） | 替换完成已删除；桩替换全失败的证据留存 `gate-old.json`，该验证不再可复跑（历史项）                    |
| `gate-old.json`                        | 旧门证据：源码入口 / dist 入口 / 桩替换全失败                                                         |
| `scope-files.json`                     | 60 个继承文件与继承分类                                                                               |

## 运行

```powershell
# 源码 + dist + 桩替换（需先构建 core 包；桩替换一步为历史项，stubs/ 已随替换删除）
node scripts/contract-gate.mjs --contract specs/contracts/core-runtime-helpers-01 `
  --dist-env KNORVIA_CORE_RUNTIME_HELPERS_01_ENTRY=dist `
  --stub-root specs/contracts/core-runtime-helpers-01/stubs `
  --stub-targets specs/contracts/core-runtime-helpers-01/stubs/targets.txt

# 单跑一组入口
node --import tsx --test specs/contracts/core-runtime-helpers-01/tests/*.test.ts
$env:KNORVIA_CORE_RUNTIME_HELPERS_01_ENTRY = "dist"
node --import tsx --test specs/contracts/core-runtime-helpers-01/tests/*.test.ts
```

契约测试同时被 `pnpm test:studio` 收录（M0-10 机制）。

## 时序与事件序列断言

运行时时序（流式 / 取消 / 并发 / 重试交错）一律用**事件序列断言**：夹具
`fixtures/model-stream-events.json` 描述一段模拟模型流（两个并发工具调用 → 压缩触发点 →
中途取消 → 结束），测试用现有模型适配器测试夹具（`adapters/test/model-subsystem-contract/harness/fixtures.ts`
的 `streamResult` / `toAsyncIterable`）驱动 `fullStream`，断言四组序列：

1. **流事件消费序列**（确定性，无 sleep）；
2. **事件进入顺序**（账本 ×2 → 回合结果）；
3. **事件完成顺序**（并发交错：第一个账本挂起时第二个与回合结果先落盘，靠 gate 握手而非计时）；
4. **持久化记录内容**（attempt id、工具调用 id、`resultType: cancelled`、时长）与**日志序列**
   （压缩重试 `warn` 在前、回合取消 `error` 在后）。

配套：`turn-errors` 的取消作用域级联与取消判定、`streaming-tool-ledger` 的账本/锚点事件顺序
都在同一文件里逐点断言；存储类（计划文件、工作区检查点产物、远程会话路径修复）带
「旧写 → 新读 → 新写 → 旧读」往返断言。**没有 sleep、没有固定超时。**

## 条目 → 测试对照表

| 条目   | 测试用例（`tests/` 下文件 · 用例名）                                                 | 关键断言                                                                   |
| ------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| B1     | `attachments.test.ts` · 「B1 回合附件按数组顺序逐条解析…」「B1 无端口/无内容…」      | 输出等长同序；端口调用序列 `stat → readTextFileRange → stat`；失败降级占位 |
| B2     | `attachments.test.ts` · 「B2 事件摘要…」                                             | 空输入 `undefined`；文件名/mime/ref 三级兜底                               |
| B3     | `attachments.test.ts` · 「B3 data URL 头解析与 base64 载荷校验」                     | 前缀/逗号/媒体类型判定、字节估算、严格校验四例                             |
| B4     | `attachments.test.ts` · 「B4 图片内联预处理与 MIME 推断」                            | 无处理器原样返回；有处理器重编码与尺寸元数据；扩展名四例                   |
| B5     | `attachments.test.ts` · 「B5 PDF 与视频的内联解析…」                                 | 20 MiB 常量、`%PDF-` 魔数、严格载荷、六种视频扩展名                        |
| B6     | `attachments.test.ts` · 「B6 占位项与路径引用…」「B6 产物读写…」                     | 占位三行文案与错误码；既有 URI 不重复写；读取失败返回 `undefined`          |
| B7     | `attachments.test.ts` · 「B7 本地媒体分派…」                                         | 非文件/读取失败/图片成功/缩放失败/非法/非媒体六条路径                      |
| B8     | `media.test.ts` · 「B8 能力投影…」「B8 官方 CUA 配对…」                              | 全支持保引用；缺类替换并分类计数；无省略不打日志                           |
| B9     | `media.test.ts` · 「B9 媒体预算…」×3                                                 | 不超限保引用；新者优先 + 受保护消息；固定错误码与非法上限                  |
| B10    | `media.test.ts` · 「B10 压缩重试的媒体占位投影」                                     | `[image]/[video]/[document]` 三类替换与计数                                |
| B11    | `media.test.ts` · 「B11 附件路径物化…」                                              | 本地直取、artifact 物化、unsupported 跳过、缺失即抛                        |
| B12    | `media.test.ts` · 「B12 工具结果媒体落盘…」                                          | 布局表、串行写入顺序、既有 URI 复用、缺端口报错                            |
| B13    | `media.test.ts` · 「B13 媒体观测…」                                                  | 空输入不打日志；事件名与计数字段逐个对                                     |
| B14    | `permission-steering.test.ts` · 「B14 权限 broker 的能力判定…」                      | 两个谓词的真/假/非函数三态                                                 |
| B15    | `permission-steering.test.ts` · 「B15 会话恢复…」                                    | 成功回填、会话不符与损坏回执只 `warn`、无条目保持清空                      |
| B16    | `permission-steering.test.ts` · 「B16 子 Agent 交互中转…」「B16 子端口派生…」        | 多层 sessionId 收敛到根会话、origin 归属保持；缺席端口不造空壳             |
| B17    | `permission-steering.test.ts` · 「B17 子 Agent 模型选择…」                           | 继承/显式/override 优先级与解析失败不回落                                  |
| B18    | `permission-steering.test.ts` · 「B18 steering 度量与预览」                          | UTF-8 字节、200 字符截断、从尾偏移                                         |
| B19    | `permission-steering.test.ts` · 「B19 fork 克隆…」                                   | 新身份与溯源、引用重映射、锚点降级、严格模式四处抛错                       |
| B20    | `permission-steering.test.ts` · 「B20 运行时提醒正文族…」「B20 输出风格提醒…」       | 日期正文、来源映射、todo 10 轮阈值、模式 5 轮轮换、风格空 prompt           |
| B21    | `permission-steering.test.ts` · 「B21 压缩后的读取状态提醒…」                        | `.git`/非 Read/保留段排除、行号回放、超预算降级引用                        |
| B22    | `permission-steering.test.ts` · 「B22 计划文件…」                                    | 写→读→再写→再读往返、路径清洗、空计划/空会话 id 报错、非 `not_found` 冒泡  |
| B23    | `permission-steering.test.ts` · 「B23 回合文件变更…」                                | 写入计数累加、工具集合合并、diff 重算与兜底计数、路径排序                  |
| B24    | `compact-provider.test.ts` · 「B24 压缩触发…」                                       | 5 触发 → 阶段/原因映射；失败原因归一三态                                   |
| B25    | `compact-provider.test.ts` · 「B25 压缩后条目重建…」「B25 本地微压缩…」              | 前缀→摘要→保留→提醒顺序、token 失效、无 payload 保引用                     |
| B26    | `compact-provider.test.ts` · 「B26 压缩选择…」「B26 超长续压…」「B26 摘要重试截断…」 | 保留组数规则、差距解析与推进、重试标记与 `retry_limit` 告警                |
| B27    | `compact-provider.test.ts` · 「B27 压缩保留…」                                       | 计数口径、≤0 短路不读存储、保留区间 head/tail                              |
| B28    | `errors-timing.test.ts` · 「B28 上下文超限…」「B28 空响应判定…」                     | 标记集判定、深度与防环、空响应收尾两种抛错                                 |
| B29    | `errors-timing.test.ts` · 「B29 提供商业务错误…」                                    | BFS 找失败、码 0 非失败、三种转换入口                                      |
| B30    | `errors-timing.test.ts` · 「B30 取消作用域…」「B30 回合结果事件…」                   | 级联与 dispose、取消判定优先级、先落事件再打日志                           |
| B31    | `errors-timing.test.ts` · 「B31 重复调用与工具预算告警…」                            | 阈值命中、稳定签名、注入上限、预算跨阈                                     |
| B32    | `errors-timing.test.ts` · 「B32 工具调用名校验…」                                    | 去空白放行、按「是否已被执行」分流、拒绝前先 `warn`                        |
| B33    | `errors-timing.test.ts` · 「B33 流式工具账本与恢复锚点…」                            | attempt/anchor id 规则、readOnly 组合、事件顺序与持久化一致                |
| B34    | `compact-provider.test.ts` · 「B34 请求投影管线…」「B34 上浮重排…」                  | 角色序列、相邻用户不合并、诊断计数、缓存点落位、未知来源抛错               |
| B35    | `compact-provider.test.ts` · 「B35 输入呈现投影与来源登记」                          | 来源链合并、代表条目、中途呈现转附件、非文本块跳过                         |
| B36    | `compact-provider.test.ts` · 「B36 中途系统提醒…」                                   | 合并成 system、锚点缺失保持附件、legacy 提醒归位                           |
| B37    | `runtime-session.test.ts` · 「B37 工具允许/禁用清单…」                               | 别名归一、explore 交集、workflow child 5 项结构性禁用、缺席即开启          |
| B38    | `runtime-session.test.ts` · 「B38 运行时工具装配…」                                  | 注册面随配置收敛（默认 ⊃ explore ⊃ workflow child）、执行器注入优先        |
| B39    | `runtime-session.test.ts` · 「B39 斜杠命令解析…」                                    | `/compact` `/rewind` `/fork` 全分支与兜底                                  |
| B40    | `runtime-session.test.ts` · 「B40 工具结果文本化与错误判定」                         | 文本化优先级、错误判定四态、MCP 名拆分、并行分组下标                       |
| B41    | `runtime-session.test.ts` · 「B41 会话标题、项目标识与数据守卫」                     | 60 字符截断、slug 兜底、四个数据守卫                                       |
| B42    | `runtime-session.test.ts` · 「B42 回合输入的附件准入…」                              | 五类准入、失败附件丢弃、浏览器块注入、最近真实用户下标                     |
| B43    | `runtime-session.test.ts` · 「B43 rewind…」                                          | 检查点过滤与按 id/消息命中、产物 JSON 往返、9 种不可用文案                 |
| B44    | `runtime-session.test.ts` · 「B44 远程会话路径修复…」                                | 四态判定、CAS 写回回读、三种降级回调、损坏即抛                             |
| B45    | `runtime-session.test.ts` · 「B45 项目记忆根的启用判定」                             | 四个启用条件与任务类型过滤                                                 |
| B46    | `runtime-session.test.ts` · 「B46 记忆抽取…」                                        | 三个前置短路、`isProjectMemoryEnabled`、排空调用                           |
| B47    | `runtime-session.test.ts` · 「B47 上下文用量分类贡献者」                             | 分类命中/未命中与四类贡献者形状                                            |
| 接口面 | `surface.test.ts` 全部 5 个用例                                                      | 316 导出逐名比对、60 模块路径存在、桶与单模块互相覆盖、两入口一致          |

## 门槛口径

- **旧门**：`node scripts/contract-gate.mjs` —— 源码入口与 dist 入口**全过**、**桩替换全失败**
  （60 个目标换成 import 即抛桩后 0 通过）。
- **相似度**：实现文件按普通模式；仅「导出声明占主体」的文件用 `--declaration --interface`；
  阈值不变（包含率 <0.20、最长相同段 <8、结构 <0.40）。
