# node-repl-host-broker 替换验收（#197）

- 包：`node-repl-host-broker`，单文件返工：`apps/cli/packages/node-repl-host/src/broker-transaction.ts`（含保持导出不变的 `src/ipc.ts`）。
- 合同：v1（`specs/contracts/node-repl-host-broker/`）。旧门源码入口 19/19；dist 入口不适用（包只产出声明与单 bundle，见合同 README）。
- 依据：`specs/knorvia-repl-transport.md`、issue #197、`docs/knorvia-independent-replacement-plan.md`「每包流程」与防刷口径（#196）。
- 范围边界：只返工 broker 事务；`json-line.ts`、`request-context.ts`、两个桥接文件及 `node-repl-host` 其他文件不属于本包（与 #189 划清）。

## 一、重写目标与结果

| 项目                    | 旧实现（`1091e45e`） | 新实现  |
| ----------------------- | -------------------- | ------- |
| 文件行数                | 65                   | 58      |
| 规范化代码行            | 44                   | 58      |
| 契约用例（源码入口）    | 19/19                | 19/19   |
| `node-repl-host` 包测试 | —                    | 143/143 |

新实现把一次调用拆成“请求封装 / 响应接收 / 单次连接调度”三个单元，并用传输故障 Promise 与帧读取 Promise 竞争终态；不再创建内部 `AbortController` 与组合信号。状态所有者、事件顺序与行为落点见合同 `design.md`。

## 二、两道相似度实测

命令（在仓库根目录）：

```sh
node scripts/provenance/similarity.mjs --repo . \
  --candidate apps/cli/packages/node-repl-host/src/broker-transaction.ts \
  --old apps/cli/packages/node-repl-host/src/broker-transaction.ts \
  --old-rev 1091e45e \
  --upstream-dir /workspace/ktools/zcode-upstream
```

结果：**PASS**

```text
PASS apps/cli/packages/node-repl-host/src/broker-transaction.ts
  lines=58 declaration=false
  containment=0.172 (apps/zcode-cli/packages/node-repl-host/src/cua-bridge.ts)
  run=3 (apps/cli/packages/node-repl-host/src/broker-transaction.ts)
  structural=0.000 (null)
```

- 包含率 0.172 < 0.2；最长相同段 3 < 8；结构相似度 0.000 < 0.4。
- 这里的最大值同时覆盖“被替换的旧文件”和“固定上游树（zai-org/ZCode@872ad960）”；两项比较各自都在门槛内。
- 命中行主要是兼容必需的 `BrokerConnection` 接口三行与通用语法行，没有旧实现的函数体或逐行翻写。
- 返工前基线：旧文件对上游包含率 0.205（9/44），超过 0.2 门槛，因此本包必须重写。

## 三、门禁输出摘要

| 门禁                                                                | 结果                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm fmt:check`                                                    | 通过，8,430 个文件                                        |
| `pnpm lint`                                                         | 通过，0 errors（215 个既有 warnings）                     |
| `pnpm typecheck`                                                    | 通过（含 `i18n:check`：5,573 个键）                       |
| `pnpm build:cli-packages`                                           | 通过，15/15 任务                                          |
| `pnpm architecture:check --changed`                                 | 通过，0 violations                                        |
| `node specs/contracts/node-repl-host-broker/tests/run-old-gate.mjs` | 旧门 19/19                                                |
| 契约测试（源码入口）                                                | 19/19                                                     |
| `node-repl-host` 包测试                                             | 143/143                                                   |
| `pnpm test:studio`                                                  | 10,110/10,122 通过；3 失败 + 1 超时为宿主环境（见第六节） |
| `pnpm provenance:report` / `:check`                                 | 登记后生成并核对（见第五节）                              |

## 四、首次失败与修正

1. 合同测试最初从 `src/ipc.ts` 导入 `BrokerConnection` 类型，但稳定入口只重导出 `brokerCall`；改为从 `src/broker-transaction.ts` 导入类型，公开面不变。
2. 首次直接运行 `node-repl-host` 包测试和包级 `typecheck` 时，工作区依赖（`@knorvia/core/repl` 等）尚未构建，报模块解析失败；执行 `pnpm build:cli-packages` 后 143/143 与包级 typecheck 均通过。这是环境前置条件，不是实现差异。
3. 相似度首版设计即通过门槛；没有通过压行、删注释、放宽测试或调整门槛来降分。

## 五、来源登记

- `apps/cli/packages/node-repl-host/src/broker-transaction.ts`：由 M0 的 `independent-replacement` 改为 `original`，许可 MIT；basis 记录合同、旧门/新门、两道相似度实测与“作者读过被替换实现”的事实。
- 合同文档、契约测试、旧门执行器、`design.md` 与本验收文档：登记 `original`，许可 Apache-2.0。
- `licensing/reviews.json` 由脚本按文件摘要更新，条数由 12,262 增至 12,273（+11 个新文件；另更新 1 条既有文件），并逐条核对无重复。
- `pnpm provenance:report` 重新生成 `licensing/current-files.json`，`pnpm provenance:check` 通过。

## 六、未覆盖与剩余风险

1. 真实 MCP / Browser / Computer Use 服务端与真实桌面交互未在本包测试；契约测试只用本地 socket 与合成夹具。
2. Windows 命名管道由 CI 双平台 `test:studio` 覆盖；本机验收在 Linux 完成。
3. 包没有独立 dist 模块，`broker-transaction` 的 dist 入口不适用；兼容面由源码入口与全仓 typecheck 保证。
4. `json-line.ts` 的帧解码细节继续由 `ipc-frame.test.ts` 与 `specs/knorvia-repl-transport.md` 保护，本包未改动它。
5. `pnpm test:studio` 的 3 个失败与 1 个超时均不在本包：`file-watcher-native-fast` 的三个用例因容器内单个进程占用 127,746/127,859 个 inotify watch 触发 ENOSPC（递归用例继而超时）；`studio-cli-catalog` 的 grok 用例因宿主已安装 `~/.grok/bin/grok` 而不再拒绝。两个测试文件及其源码相对 `1091e45e` 零差异，其余 10,110 个用例通过。完整输出见 `/workspace/ktools/broker-gates.txt`。
