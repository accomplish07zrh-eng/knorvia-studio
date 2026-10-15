# core-runtime-helpers-01 验收记录（v1）

合同阶段的范围、旧门结果与覆盖/未覆盖项。替换阶段的相似度实测与接入门禁写进
`docs/knorvia-core-runtime-helpers-01-acceptance.md`（替换 PR 交付）。

## 一、范围

| 项       | 值                                                               |
| -------- | ---------------------------------------------------------------- |
| 继承文件 | **60**（`apps/cli/packages/core/src/runtime/helpers/**`）        |
| 继承分类 | `upstream-modified` 44 / `unreviewed` 7 / `upstream-unchanged` 9 |
| 规模     | 6,919 行（合同前删除 4 个无用导出后不变，删的是导出层不是实现）  |
| 导出面   | 316 个导出 = 296 个运行时值 + 20 个纯类型（`interface.md`）      |
| 包外引用 | 1,089 个引用点，253 个导出有外部调用方（`callers.md`）           |

**不在范围的相邻文件**：`src/runtime/methods/**`（模型请求、流式、压缩执行、回合状态机，属
`core-runtime-methods-01/02`）；`src/runtime/` 根与其余装配文件（`runtime.ts`、`types.ts`、
`deps.ts`、`internal.ts`、`session-mode-port.ts`）以及 `agent/**`、`compact/**`、`permission/**`、
`subagent/**`、`tool/**`、`memory/**`、`errors/**`（属 `core-runtime-01` 或其他包）；包根
`src/index.ts`（core-03 已合并）。

## 二、选包收尾证据

- `pnpm architecture:context cli`：本包落在 `cli` 模块（`managed: false`，无跨模块 requires），
  边界要求「跨模块导入必须走公开入口」——契约测试因此只从模块路径与桶入口进入。
- `pnpm dep:refs --list-exports`（同源 ts-morph 批量分析）：60 文件 / 316 导出 / 1,089 个包外引用点，
  结果落进 `interface.md` 与 `callers.md`，其中「仅包内使用」61 个。
- knip 与 `dep:refs` 双确认的无用导出已**单独提交**删除：
  `attachments.ts` 的 3 个再导出（`parseDataUrlHeader`、`inferImageMimeFromPath`、`prepareImageDataUrl`）
  与 `compact.ts` 的 `CompactEntrySelection` 类型再导出。三个函数在包内仍被
  `attachment-media-resolver/*` 使用，删的只是导出层。
- 单包 60 个继承文件正好到上限，未并入任何其他目录。

## 三、旧门结果（`gate-old.json`）

| 入口                                                    | 用例 | 通过   | 失败 | 结论                          |
| ------------------------------------------------------- | ---- | ------ | ---- | ----------------------------- |
| 源码入口（tsx → `src/runtime/helpers/*.ts`）            | 63   | **63** | 0    | 全过                          |
| dist 入口（`dist/runtime/helpers/*.js`，core 包已构建） | 63   | **63** | 0    | 全过                          |
| 桩替换（60 个目标换成 import 即抛桩，源码入口）         | 8    | **0**  | 8    | **全失败**（`allFail: true`） |

- 跑法：`node scripts/contract-gate.mjs --contract specs/contracts/core-runtime-helpers-01
--dist-env KNORVIA_CORE_RUNTIME_HELPERS_01_ENTRY=dist --stub-root …/stubs --stub-targets …/targets.txt`。
- 报告里的 `commit` 字段记录旧门跑动时的主仓提交号，`node` 为 `v24.14.0`（mise 固定版本）。
- **预登记差异 0 条**：旧行为没有被放宽的断言；桩替换失败的 8 个用例是 7 个测试文件的加载级失败
  - 文件级汇总（模块 import 即抛 → 整个测试文件不可加载），符合「桩替换后契约测试必须全部失败」。
- 先前一版 gate（合同测试里有 3 个纯文档断言）曾出现 `pass=3`，已把这 3 个断言并入需要加载被测
  模块的用例，重跑后 `pass=0`。

## 四、契约测试覆盖

- **47 条行为条目（B1–B47）逐条至少一个断言**，加接口面 2 个用例，共 63 个用例 / 7 个测试文件；
  逐条映射见 `README.md` 的「条目 → 测试对照表」（无空行）。
- 只走公开入口：`runtime/helpers/index.ts` 桶入口 + `interface.md` 里的 60 个模块路径；
  两种入口（源码 / dist）跑同一份用例。
- 端口全部注入（文件系统、附件产物库、会话存储、日志器、运行时事件面），不读真实磁盘、
  不联网、不写凭据。

## 五、运行时时序条（计划书 CLI 节明文要求）

`tests/errors-timing.test.ts` 的「事件序列：模拟模型流（并发工具 + 压缩触发点 + 中途取消）」：

1. **模拟模型流**：事件序列取自 `fixtures/model-stream-events.json`（两个并发工具调用 →
   压缩触发点 → 中途取消 → 结束），流本体由现有模型适配器测试夹具
   （`adapters/test/model-subsystem-contract/harness/fixtures.ts` 的 `streamResult` / `toAsyncIterable`）
   驱动 `fullStream`。
2. **断言四组序列**：流事件消费序列；事件**进入**顺序（账本 A → 账本 B → 回合结果）；事件**完成**
   顺序（账本 A 挂起时 B 与回合结果先落盘，放行后 A 才落盘 —— 并发交错）；**持久化记录内容**
   （attempt id 共用、工具调用 id、`resultType: "cancelled"`、时长）。
3. **重试交错**：压缩触发点走 `truncateCompactSummaryRequestEntriesAfterPromptTooLong`，断言重试
   `warn` 事件（`attempt`/`maxAttempts`/`droppedMessages`）在回合取消 `error` 之前。
4. **取消**：父作用域中止 → 取消判定 → `TurnCancelled` 映射 → `TurnComplete(resultType: cancelled)`
   落盘，`dispose` 后不再级联。
5. **没有 sleep、没有固定超时**：并发交错靠 `gateNext()` 握手（显式放行），顺序完全由代码路径决定。

## 六、往返与兼容

| 类型                                               | 往返断言                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 计划文件（`.knorvia-studio/plans/plan-<会话>.md`） | 写 A → 读回 A → 写 B → 读回 B，路径两次一致（B22）                                                     |
| 工作区检查点产物（JSON）                           | `stringifyWorkspaceCheckpointArtifact` → JSON.parse → `parseWorkspaceCheckpointArtifact` 可解析（B43） |
| 远程会话路径修复                                   | CAS 写回 + 回读复核 + 未命中降级（B44）                                                                |
| 工具结果媒体布局                                   | `FilePart[]` + 布局表（文本/附件相对位置）落盘顺序一致（B12）                                          |

平台双兼容：路径一律 `path.join` / `basename`；反斜杠与斜杠在路径比较前归一（B21、B22）；
字节数按 UTF-8 计（B4、B9、B18）；扩展名判定先转小写（B4、B5）；会话 id 与 slug 清洗与平台无关
（B22、B41）。

## 七、未覆盖项

见 `known-differences.md` 第五节：钩子执行器的内部实现、记忆代理的模型请求元数据组装、
文件系统端口本身的字节/行号语义，都不属于本合同的断言范围（分别由 runtime/methods、memory、
端口实现的合同负责）。

## 八、本地环境说明

- 本机 `pnpm build:cli-packages` 会卡在 `@knorvia/cua-plugin` 的驱动下载（网络依赖，GATE-PLAYBOOK
  已记录），因此旧门只构建受影响的 `apps/cli/packages/core`（`tsc` 通过、产物在场）；dist 入口的
  完整性以 CI 的 `build:cli-packages` + `test:studio` 双平台结果为准。
- 本机的环境类测试失败（device-fs 60s、plugin-staging 崩溃等）与本包无关，如实记录不追。
