# contracts-01 已知差异（known-differences.md）

## 旧门的预登记差异

当前**没有预登记差异**：旧门在源码入口与 dist 入口各 27/27 通过，契约测试断言的都是旧实现的既有行为，没有为了让测试通过而放宽任何断言。

## 替换期登记：必须逐字一致的兼容签名（第三步计分依据）

以下三处按 Lead 裁定走「三步走第三步」——兼容面行数本身已 ≥ 残留归一化行数的 20%，普通模式数学上不可达，因此该文件用 `--declaration --interface` 计分（门槛不因此放宽）。登记它们「哪些签名必须逐字一致、为什么」：

1. **`commands/index.ts`**（兼容面 ≥ 50%）：`splitCustomCommandArguments`、`expandCustomCommandTemplate`、`formatCustomCommandPrompt`、`detectUnsupportedDynamicSyntax`、`expandCustomCommandPrompt` 五个导出函数的参数与返回类型，以及 15 个导出接口/类型别名。调用方是 CLI 的命令发现与展开路径，改名或改形状即破坏兼容面。行为由 B4–B8 契约测试覆盖。
2. **`compact/index.ts`**（兼容面 ≥ 50%）：三个导出 schema 常量（`compactBoundaryPayloadSchema`、`compactTimelinePayloadSchema`、`microcompactBoundaryPayloadSchema`）的字段与校验语义、10 张取值表的键与字面量、6 个导出类型。调用方是会话投影与上下文压缩路径。行为由 B9–B13 覆盖。
3. **`config/index.ts`**（兼容面 ≥ 45%）：`ConfigKey` 的 39 个配置键字符串、`ConfigScope` 六个取值、`ConfigScopePriority` 的数值优先级、`DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS = 600000`、`DefaultRuntimeConfig` 的逐字段默认值，以及 10 个导出接口/类型。调用方是配置适配器与运行时。行为由 B25 覆盖。
4. **`events/in-memory-session-event-store-core.ts`**（兼容面 22/66 = 33%）：`SessionEventStorePort` 的 8 个方法名/参数/返回类型、`InMemorySessionEventStoreOptions` 的两个字段、工厂函数签名。调用方是存储适配器与运行时。行为由 B17 覆盖。
5. **`model/protocol-error_core.ts`**（兼容面 13/13 = 100%）：`ModelProtocolError` 的类名、构造参数顺序（`code, message, context?`）与两个只读成员名。调用方按 `name` 与 `code` 识别协议错误。行为由 B1 导出面与 `ModelErrorCode` 取值断言覆盖。

以上重合是**兼容面本身**（协议字段名、外部可见字符串、调用方依赖的签名），不是逐行照搬实现：实现部分（控制流、数据结构、注释）均已改写，各文件的相似度实测值见 `docs/knorvia-contracts-01-acceptance.md` §3。

## 构建产物差异：两个 dist 声明的类型打印顺序（已按先例重固定 receipt）

`apps/cli/packages/contracts/dist/workflow/run-schema.d.ts` 与 `dist/workflow/script.d.ts` 的字节与替换前不同，差异**只在类型打印顺序**：前者是 `WorkflowFailureSchema` 的 `kind` 联合成员顺序，后者是 `ScriptWorkflowRunStatsSchema` 推导类型里 `input`/`output` 的先后。源码侧 `src/workflow/run-schema.ts` 的 `z.enum([…])` 取值与顺序、`src/workflow/script.ts` 全文在两棵树上完全相同，成员集合与字段集合未变；同文件 `.js` 产物字节一致，运行时行为不变。

原因是 tsc 按程序级 literal 类型 interning 顺序打印联合/映射类型，本次把 58 个文件重排为「薄壳 + 内部实现」、新增 11 个内部模块，改变了编译程序内的文件处理顺序。处置：重固定 `apps/cli/packages/core/test/current-message-buffer-artifact-receipt-20261003.json` 的这 2 条摘要并同步该测试的 JSON 自校验摘要（先例 commit `4bf32a33`）；新摘要取自真实构建，跨 Windows/Linux 一致，重建后 220/220 匹配，core 的 6 个 workflow 测试 30/30 通过。详见 `docs/knorvia-contracts-01-acceptance.md` §9。
