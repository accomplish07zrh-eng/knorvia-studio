# packages-02 合同验收（acceptance.md）

2026-10-19。合同 v1：`packages/rpc` 与 `packages/provider-node/src` 的 29 个继承文件
（20 + 9）的行为合同、契约测试、夹具与桩。验收实测值在旧门跑完后填入本文件。

## 一、范围

- `packages/rpc` 22 个继承文件：16 个 `src/*.ts` + 4 个示例按合同重写，2 个配置保持；
  M0-6 结论：21 个比对文件中一致 0、ZCode 改过 13、无上游 8（其中 `wire-codec.ts` 属 `shared-01`）。
- `packages/provider-node/src` 11 个继承文件：9 个模块重写，2 个配置保持；7 个 builtin 模块与
  `index.ts` 桶已在既有独立实现范围内，本包只冻结其导出面。
- 逐文件路径、行数、sha256 与分类见 [`scope-files.json`](scope-files.json)。

## 二、旧门与桩替换（`gate-old.json`，Node 版本以 `mise.toml` 为准）

| 项                                            | 结果                                              |
| --------------------------------------------- | ------------------------------------------------- |
| 用例数 / 测试文件                             | 99 / 13                                           |
| 源码入口                                      | 99 通过 / 0 失败 / 0 跳过                         |
| dist 入口（`KNORVIA_PACKAGES_02_ENTRY=dist`） | 95 通过 / 0 失败 / 4 跳过（B19 示例仅源码入口）   |
| 预登记差异                                    | 0（`known-differences.md` §8）                    |
| 断言放宽                                      | 无                                                |
| 桩替换（29 个目标）                           | 0 通过 / 13 个测试文件全部失败（`allFail: true`） |

## 三、条目覆盖

- `behavior.md` B1–B30：rpc 基础值与序列化（B1–B4）、传输与协议（B5–B7）、channel（B8–B10）、
  ProxyChannel（B11–B12）、IPC/路由/远程（B13–B16）、中间件与示例（B17–B19）、rpc 导出面（B20）；
  provider-node 路径与编解码（B21–B22）、仓储与轮询（B23–B25）、门面与运行时（B26–B28）、
  导出面（B29）、配置往返（B30）。
- 「条目 → 测试」对照表无空行；每个 B 条目至少一个断言。

## 四、夹具（旧实现真值，`fixtures/`）

- `fixtures/wire/`：帧头/VQL/嵌套字节的录制字节与期望值。
- `fixtures/provider-config/`：规范文档（旧写）、旧版手工配置、空配置与非法版本样例。
- 夹具由旧实现一次性录制；替换阶段禁止重新生成。

## 五、门禁

| 项                                            | 结果                                                            |
| --------------------------------------------- | --------------------------------------------------------------- |
| `pnpm fmt:check`                              | 通过（8477 个文件）                                             |
| `pnpm lint`                                   | 通过（0 errors；216 warnings 为其余包既有告警）                 |
| `pnpm typecheck`                              | 通过（i18n 5573 键一致；tsc -b 全部目标）                       |
| `pnpm architecture:check --changed`           | 通过（violations 0 / baseline 0 / new 0）                       |
| `pnpm provenance:report` / `provenance:check` | 通过（total 17301，reviewProblems 0，missingReviews 空）        |
| licensing 登记                                | 59 个新合同文件登记为 `original` / Apache-2.0（`reviews.json`） |

## 六、未覆盖内容

- 真实网络/WebSocket 握手、浏览器 MessagePort 实现不在范围；用 fake port/socket 与帧字节覆盖。
- PersistentProtocol 的 20 s ack 超时/45 s grace 只验证调度与状态转换，不等待真实墙钟。
- provider-node 的 7 个 builtin 模块与下载器行为不在本包断言（既有独立实现范围）。
- 示例只在源码入口运行（见 `known-differences.md` §6）。
