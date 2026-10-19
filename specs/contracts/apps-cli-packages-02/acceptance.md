# apps-cli-packages-02 合同验收（acceptance.md）

本文件按计划书「每包流程 · 二、合同」与「验收清单 · 合同审查」逐项给出证据。合同版本 **v1**。

## 一、范围与切包

- 包 ID：`apps-cli-packages-02`（M2）。继承文件 **35**（`licensing/current-files.json` 实测口径）：
  `dynamic-workflow-runtime` 8、`i18n` 7、`telemetry` 12、`shared-types` 3、`node-repl-host` 5。
- 与派单数字的差异及依据见 `README.md` §一与 `known-differences.md` §二：
  `debug` 已在 `f47d5717` 删除（0 文件）；`node-repl-host` 实测 5 个（多出的
  `test/runtime.test.mjs` 为 `unreviewed`，不属于行为兼容面）。
- 不在范围：`apps/cli/packages/dynamic-workflow`（只读其冻结公开导出）；
  `node-repl-host` 其余 51 个已独立/已达标文件；`node-repl-host/src/broker-transaction.ts`
  （相似度返工归 #197，见 `known-differences.md` §一）。

## 二、合同产物

| 文件                   | 内容                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `README.md`            | 范围、逐文件清单（35 个）、风险要点、方法、条目 → 测试对照表（38 行，无空行）                |
| `behavior.md`          | B1–B38，每条含输入/输出/错误语义/时序与并发/幂等/资源释放/平台差异/状态所有者/日志级别       |
| `interface.md`         | 22 个源码模块的导出声明，由 TypeScript 编译器 API 逐字提取                                   |
| `callers.md`           | 包外导入方与包内相对引用清单                                                                 |
| `tests/`               | 4 个 `node:test` 契约测试文件 + 入口解析、对照表生成、旧门 runner                            |
| `stubs/`               | 22 个最小桩（`interface.md` 的导出与签名，函数体抛 `not implemented: apps-cli-packages-02`） |
| `known-differences.md` | 明确排除项、清单差异、i18n 措辞边界、dist 入口事实、依赖边界、覆盖硬边界                     |
| `acceptance.md`        | 本文件                                                                                       |
| `gate-old.json`        | 旧门结果（源码入口 + dist 入口）                                                             |
| `stub-gate.json`       | 桩替换结果（源码入口）                                                                       |

## 三、旧门结果（`gate-old.json` / `stub-gate.json`）

命令（仓库根目录，Node v24.14.0）：

```text
pnpm build:cli-packages
node --import tsx specs/contracts/apps-cli-packages-02/tests/run-old-gate.mjs --with-stubs
```

| 项                | 结果                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 用例数            | **38**（4 个测试文件）                                                                                                                     |
| 源码入口          | **38 / 38 通过**，0 失败，**0 跳过**，0 todo                                                                                               |
| dist 入口         | **38 / 38 通过**，0 失败，**0 跳过**，0 todo                                                                                               |
| 预登记差异        | **3**（`broker-transaction.ts` 归 #197；`node-repl-host` 的 dist 事实；`runtime.test.mjs` 为 unreviewed），均已写入 `known-differences.md` |
| 断言放宽          | **无**（`assertionsRelaxed: false`）                                                                                                       |
| 桩替换（22 个桩） | **0 通过 / 38 失败**（`allFail: true`）                                                                                                    |

用例分布：

| 测试文件                        | 条目    | 用例数 |
| ------------------------------- | ------- | ------ |
| `tests/shared-i18n.test.mjs`    | B1–B8   | 8      |
| `tests/dwf-runtime.test.mjs`    | B9–B23  | 15     |
| `tests/telemetry.test.mjs`      | B24–B36 | 13     |
| `tests/node-repl-host.test.mjs` | B37–B38 | 2      |

测试只走公开入口或包内模块路径：`tests/entry.mjs` 按 `KNORVIA_ACP02_ENTRY=source|dist`
在 `apps/cli/packages/<pkg>/src` 与 `dist` 之间切换；`node-repl-host` 的 `exports` 指向
`src/*.ts`，两种模式解析到同一文件（`known-differences.md` §四）。

## 四、条目 → 测试对照

- 对照表由 `node specs/contracts/apps-cli-packages-02/tests/build-case-map.mjs` 生成；
  `--check` 在缺条目或表落后时退出码非 0，实测输出：
  `build-case-map: 对照表完整：38 个条目 / 38 个用例`。
- 时序类用例用事件序列与顺序断言（stdio NDJSON 的到达顺序、journal 顺序、状态映射），
  没有 `sleep` 或固定超时凑结果；唯一使用真实计时器的是 B22 墙钟超时（契约本身就是超时语义）
  与 B32 过期清理（以可控 `now()` 注入为主，等待只用于验证真实 sweep 触发）。

## 五、首次失败与修正记录（如实记录，不是放宽断言）

起草测试时有 8 处「合同/测试写错、实测旧实现为准」的修正；每一次都是改合同或改测试以匹配
旧实现的真实可观察行为，没有放宽任何断言：

1. **B24**：原断言 `noop.run()` 存在；实测 `NoopAgentExecutionTelemetry` 只暴露
   `startTurn`/`startStep`/`captureCausation`，`run` 属于 writer scope → 删除该断言。
2. **B27**：用例回调缺少 `t` 参数而调用 `tempDir(t)` → 修正签名，测试逻辑不变。
3. **B31**：失败事件序列漏了开头的 `reasoningState`/`reasoningControl`；且 auth/cancel
   子块的 `model_request_started` 用了自定义 call id，后续失败事件却发往默认调用 →
   补齐开头事件并把 started 事件改用默认调用。
4. **B32**：过期用例的 started 事件用 `lc-expire`，后续重试事件却发往 `lc-1`，导致调用在
   1001 ms 就被判过期 → started 事件改用默认调用，过期只由注入的 `now()` 推进。
5. **B33**：`turn.run` 会在返回时自动放弃缺失 terminal 的 writer，导致容量断言对象已释放；
   终结事件下标与指标失败告警顺序也与实测不符 → 在 `turn.run` 内完成断言，terminal 改查
   下标 `[4]`，告警序列改为
   `["Telemetry metric operation failed", "Telemetry active writer capacity was reached"]`。
6. **B33 假 tracer**：原假 tracer 忽略 `options.attributes`，导致 span 属性为 `undefined` →
   按 OTel 语义把初始属性合并进 `span.record.attributes`。
7. **B34**：原用例用 `{ code: "ETIMEDOUT" }` 期望 timeout；实测分类只匹配小写后的
   `timeout` 子串，`"etimedout"` 不含该词 → 改用文档化形态 `{ code: "request_timeout" }`。
8. **B9**：最初只断言包公开面，桩把它当作「未实现」也能通过 → 增加真实函数调用
   `childEntryFileName("contract") === "contract.mjs"`，确保桩门失败。

另有 2 处测试自身问题（B14 未使用的 `t` 触发 lint 警告、格式未过 `pnpm fmt:check`），
已在提交前修正，不涉及行为。

## 六、门禁与登记

| 检查                                               | 结果                                                          |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm fmt:check`                                   | 通过：`All matched files use the correct format.`             |
| `pnpm lint`                                        | 通过：215 warnings / **0 errors**；本包目录 0 条警告          |
| `pnpm typecheck`                                   | 通过（退出码 0；i18n 5573 matching keys）                     |
| `pnpm i18n:check`                                  | 通过：`5573 matching keys, validated values and placeholders` |
| `pnpm provenance:report` / `pnpm provenance:check` | 通过；本目录 40 个文件登记为 `original`（Apache-2.0）         |
| 旧门（源码 + dist）                                | `gate-old.json`：38/38 + 38/38，0 跳过，0 放宽                |
| 桩门（源码）                                       | `stub-gate.json`：0/38，`allFail: true`                       |

## 七、合同审查清单逐条

- [x] 范围、不在范围的相邻文件、可变接口写清；`callers.md` 覆盖包外导入方与包内相对引用。
- [x] `behavior.md` 每条都有测试，对照表没有空行（`build-case-map.mjs --check`）。
- [x] 测试只走公开入口或 `interface.md` 列出的模块路径。
- [x] 时序类用事件序列/顺序断言，没有 `sleep` 或固定超时凑结果。
- [x] i18n 测试锁键集合、参数语义与含义，不逐字比对人类语言原文（`known-differences.md` §三）。
- [x] 旧门两种入口全过，零跳过、零放宽；预登记差异 3 条均有文档依据。
- [x] 桩只含 `interface.md` 的导出与签名，函数体抛 `not implemented: apps-cli-packages-02`。
- [x] 协议字段、`KNORVIA_*`/`OTEL_*` 环境变量键、数据目录（`.knorvia-studio`、
      `knorvia-workflow-runs`）在测试中逐项锁定，未做任何改名。

## 八、未覆盖 / 留给替换阶段

1. **两道相似度门槛**不在合同阶段执行（合同阶段只登记口径）；替换阶段按计划书对每个新文件
   跑归一化行包含率与最长相同片段，并附实测值。
2. **`node-repl-host/test/runtime.test.mjs`（unreviewed）**：旧门不运行；替换阶段允许删除或重写，
   其断言不构成契约（`known-differences.md` §二）。
3. **`node-repl-host/src/broker-transaction.ts`**：相似度返工归 #197，本包合同、测试与桩都不覆盖，
   替换 PR 不得顺带改写（`known-differences.md` §一）。
4. **Windows CI**：合同阶段的测试已避免平台特定路径/大小写假设，但 Windows 实机只会在 PR 的
   CI 中验证；本地记录为 Linux 实跑结果。
5. **i18n 文案重写**：替换阶段必须用自己的话重述英文/中文文案；本合同的测试只锁语义，
   替换后用同一测试套件复核。
6. **`src/index.ts` 之外的内部模块**：`tests/telemetry.test.mjs` 的 B35/B36 直接按包内模块路径
   加载内部模块（`interface.md` 列出），这是合同冻结的内部导出面，不是对实现结构的约束。
