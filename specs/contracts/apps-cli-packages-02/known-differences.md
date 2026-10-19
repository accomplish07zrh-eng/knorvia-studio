# apps-cli-packages-02 已知差异与覆盖边界

本文件记录**合同有意不锁**的部分、与派单数字的偏差、以及测试覆盖的硬边界。
替换阶段不得把这里的「不锁」理解为「可以改变行为」：凡 `behavior.md` 写明的可观察语义
都是硬约束；只有本文件明确列出的内容允许不同（例如人类语言措辞、内部结构、依赖实现）。

## 一、`broker-transaction.ts`：明确排除（#197）

- `node-repl-host/src/broker-transaction.ts` 在 `licensing/current-files.json` 中登记为
  `independent-replacement`，其相似度返工由 issue #197 单独处理。
- 本包的 `interface.md`、`behavior.md`、`tests/`、`stubs/` 都**不覆盖**该文件；它也不在
  README 第二节的 35 个继承文件清单内（清单按 `upstream-modified`/`upstream-unchanged`/
  `unreviewed` 三个类别取数）。
- 替换 PR 不得顺带改写该文件；#197 完成后由该线自行登记相似度结果。

## 二、继承清单与派单数字的差异

1. **`debug` 无继承文件**。该包已在 `f47d5717`（M0-5，继承 -95）删除，仓库中不存在
   `apps/cli/packages/debug`。本包不包含 `debug` 条目，替换 PR 的继承计数不含它。
2. **`node-repl-host` 实测 5 个继承文件，派单写 4 个**。多出的一个是
   `test/runtime.test.mjs`（220 行，登记 `unreviewed`）。按「以实测为准」，它计入 35 个文件
   与 6,761 行；但它**不属于行为兼容面**：
   - 它是宿主实现的既有测试，替换阶段允许删除或重写；
   - 本包合同只在 `B37` 记录它是 `unreviewed` 继承测试，不把它的断言当作契约；
   - 旧门只跑 `specs/contracts/apps-cli-packages-02/tests/`，不跑该文件。
3. **`node-repl-host` 其余 51 个文件不在范围**：26 个 `independent-replacement`、23 个
   `original`、2 个 `reviewed-retained`。按 AGENTS.md「不重复改已独立候选项」保持不动。
4. 本包不含 `apps/cli/packages/dynamic-workflow`。`dynamic-workflow-01/02` 在另一条线；
   本包只读它的冻结公开导出（见 §五）。

## 三、i18n：锁语义，不锁人类语言原文

- `i18n` 的英文/中文文案在替换阶段**必须用自己的话重写**（issue #189 与计划书要求），
  因此测试**不逐字比对**任何面向用户的句子。
- 锁定的内容：
  1. 两套目录的键集合递归同构、叶子类型一致、函数元数一致、无空字符串叶子（B7）；
  2. 每个函数把调用方给的语义事实（数量、状态码、工具名、runId、attempt/分母、label 等）
     放进结果，且同输入同输出（B8）；
  3. 键的**含义**不变：数量、单复数、重试进度、中断指引、筛选帮助、命令/选项清单等；
  4. `locale` 字段与所选目录一致（B6）；
  5. **中英文键一致**：`pnpm i18n:check` 只覆盖 `packages/ui/src/i18n/locales`，不覆盖
     `apps/cli/packages/i18n`，所以本包用测试 B7 自行承担键一致校验。
- 不锁的内容：具体措辞、标点、语序、大小写风格、`Intl` 之外的排版细节。
- 数值与标识符（版本号、`en-US`/`zh-CN`、`/dwf resume <runId>` 形式的指引、
  `attempt/maxAttempts` 的分数形态、`connected/total`、状态码）属于语义事实，必须保留。

## 四、dist 入口事实

- `dynamic-workflow-runtime`、`i18n`、`telemetry`、`shared-types` 的 `package.json` 指向
  `dist`，`pnpm build:cli-packages` 生成逐模块镜像；旧门的 `KNORVIA_ACP02_ENTRY=dist`
  加载这些产物。
- `node-repl-host` 的 `exports` **直接指向 `src/*.ts`**，构建只产出 `dist/mcp/server.js`
  单文件 bundle，没有 `dist/tool-contract.js`。因此 dist 模式下的 B37/B38 仍加载
  `src/tool-contract.ts` 与 `package.json`；这不是遗漏，是发布面的事实（README §四.10）。
- 测试通过 `tests/entry.mjs` 统一解析入口；`node-repl-host` 在两种模式下解析到同一文件，
  其余四包按 `source`/`dist` 切换。
- 桩门（`stub-gate.json`）只跑 `source` 模式：桩安装在 `src/`，替换 dist 没有意义；
  这与 `apps-cli-packages-01-model` 的口径一致。

## 五、依赖边界（只锁公开面）

1. **`node-repl-host` 依赖旧 `@knorvia/core`**（切换时删除）。本包合同只锁
   `package.json` 的发布面、`tool-contract` 常量与文本（B37/B38）；宿主实现、其它
   `src/*.ts` 入口及其对 `@knorvia/core` 的用法**不在合同内**。替换阶段可以移除该依赖，
   只要公开入口名与 `tool-contract` 行为不变。
2. **`dynamic-workflow-runtime` 只依赖 `@knorvia/dynamic-workflow` 的冻结公开导出**
   （`WorkflowEngine`、`WorkflowError`、`InMemoryJournalStore` 等由 `index.ts` 再导出的面）。
   `behavior.md` 的 B17–B23 按接口描述桥接语义，不锁定引擎内部实现；引擎的 journal 格式、
   调度细节与 replay 规则由 dynamic-workflow 线负责。
3. **`telemetry` 依赖 `@knorvia/shared/node` 的 `resolveKnorviaDataRoot`** 与
   `@knorvia/contracts/*` 的类型。合同锁数据目录布局（`.knorvia-studio`、
   `KNORVIA_HOME/v2/telemetry-state.json`）与事件字段，不锁这些依赖的内部实现。
4. 包间不得新增未在 `interface.md` 出现的公开导出；内部模块
   （`agent-metrics.ts`、`compatibility-adapters.ts`、`otlp-exporter.ts`、`agent-trace-support.ts`）
   允许在替换阶段调整文件划分，但 `src/index.ts` 的运行期导出集合必须保持 B24 列出的 17 个。

## 六、测试覆盖的硬边界

以下内容**没有**被自动化用例覆盖，替换阶段需靠人工或后续验收补齐；本清单同时说明
为什么不覆盖，避免把「旧门全过」误读为「所有平台路径都验证过」。

1. **纯类型模块的运行期空面**：`shared-types`、`i18n/src/types.ts`、
   `dynamic-workflow-runtime/src/protocol.ts` 没有运行期导出，无法单独产生失败的用例。
   按 B1 的测试约束，它们的断言并入会调用运行期函数的用例（B3/B5/B6/B9）；桩替换后
   同一用例因桩抛错而失败。类型形状（B2）由 `pnpm --dir apps/cli typecheck` 与
   `interface.md` 保证，旧门不做编译期断言。
2. **真实 OTel 导出**：测试使用伪造的 tracer/span 与本地不可达端点，验证构造参数、
   端点/header 解析、状态映射与关闭语义；不向真实 collector 发数据，也不验证 wire 格式。
   `otlp-exporter.ts` 的 view/边界面只由 B36 的常量与 `pnpm --dir apps/cli typecheck` 覆盖。
3. **真实模型供应商**：`ModelApiTelemetryStatusSink` 只消费构造好的 `ModelNetworkStatusEvent`；
   不启动 HTTP 请求，不验证供应商错误原文的抓取。
4. **子进程的平台差异**：`dynamic-workflow-runtime` 的 harness 用真实 `child_process.spawn`
   驱动一个 Node 子进程验证正常/故障路径；spawn 失败的若干平台分支（ENAMETOOLONG、E2BIG、
   Windows 下的 `error` 时序）只验证归并后的结算语义，不逐平台复现。
   `ELECTRON_RUN_AS_NODE=1`、`--max-old-space-size` 的注入通过 fake spawn 断言参数，
   不验证 Electron 本体。
5. **Windows 路径逐字符行为**：B10/B30/B28 的路径与文件名规则在 POSIX 上验证；
   Windows 反斜杠/盘符只按 `node:path` 与正则的公开语义断言，不在本机模拟
   `process.platform === "win32"`。
6. **`node-repl-host` 宿主实现**：B37/B38 只读清单与 `tool-contract.ts`；
   `broker-transaction.ts`（#197）与其余 `src/*.ts` 不加载、不测试。
7. **取消/超时的极端竞态**：B21–B23 用真实子进程与定时器验证 first-wins；不构造
   「同一 tick 内 complete 与 abort 同时到达」的确定性竞态（依赖事件循环调度，无法稳定复现）。
8. **遥测单飞的跨进程并发**：B27 的锁文件与单飞在单进程内验证；多进程同时准备同一
   `KNORVIA_HOME` 的竞争只按锁协议（`wx` + pid 存活）断言，不做多进程压测。
9. **i18n 全量文案快照**：不逐句断言；只按 B7/B8 锁结构与语义事实（见 §三）。
10. **旧门不跑 `pnpm test:studio`**：旧门只覆盖本包 5 个包的公开行为。仓库级
    `pnpm test:studio` 在验收阶段单独执行（见 `acceptance.md`），其结果不作为合同测试的替代。

## 七、明确不变量（替换阶段不得改变）

- 协议字段名与判别值：`ModelNetworkStatusEvent.type`、child wire 的
  `kind`/`type`/`id`/`localId`/`siteId`/`artifactId`、`WorkflowError.code` 等。
- 数据目录与环境键：`.knorvia-studio/workflow-runs`、`knorvia-workflow-runs`、
  `KNORVIA_HOME/v2/telemetry-state.json`、`KNORVIA_MODEL_TELEMETRY_ENABLED`、
  `KNORVIA_TELEMETRY_DEVICE_MID`、`OTEL_EXPORTER_OTLP_*`、`ELECTRON_RUN_AS_NODE`。
- 错误文本：只有 `behavior.md` 标为「逐字」的文本是兼容面（运行期禁令三条、harness
  故障文案、`runWorkflowScript` 两条参数错误、`publish-artifact` 缺 `artifactOp`）；
  其余错误消息允许改写，但错误类别（`WorkflowError.code`、`Error.name`）必须保持。
- 资源上限：`max-old-space-size` 默认 256 MB、writer 5,000、调用 1,000/30 分钟、
  条目 32/版本 16/文件 20 MiB 等由 behavior 明列的数值。
