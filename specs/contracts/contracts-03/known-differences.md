# contracts-03 已知差异（known-differences.md）

## 旧门的预登记差异

当前**没有预登记差异**：旧门在源码入口与 dist 入口各 **9/9** 通过，桩替换后 **9/9 全失败**。契约测试断言的都是旧实现的既有行为，没有为了让测试通过而放宽或删除任何断言。

三处"看起来像差异、实际是冻结的既有语义"在此登记清楚，替换阶段必须原样保留：

1. **`formatLocalIsoDate` 用本地时区而不是 UTC**：同一时刻在 UTC 与 UTC+8 可能得到不同日期；年份按 `getFullYear()` 原样输出（不补零）。这不是缺陷，是调用方（终端命令数据展示）需要的"本地日历日"。测试用本地 `get` 字段对照断言，跨时区稳定。
2. **`resolveModelApiCallObservation` 的 `querySource` 大小写敏感、按 trim 后匹配**：`" main_turn "` 与 `"main_turn"` 等价，`"Main_Turn"` 落到默认分支 (tool_internal_model_call, system)；未给 `logicalCallId` 或只给空白时每次生成新的 UUID v4（该字段不承诺幂等）。
3. **`AgentTelemetryOperation` 与 `ModelApiOperation` 是两张同名不同键的表**：13 个语义一一对应、取值相同，但键名不同（例如 `ModelApiOperation.SessionTitle` ↔ `AgentTelemetryOperation.SessionTitleGeneration`）。两张表都是公开兼容面，替换时不得合并成一张。

## 范围与接口上的说明（不是行为差异）

1. **`./skills` 子路径当前没有包外调用方**（见 `callers.md`）：`skills/index.ts` 的类型由包内（`plugins/index.ts`、`events/session.events.ts`）与包外经包根 `@knorvia/contracts` 的调用方使用（15+ 文件用 `SkillLoadOutcome` 等）。按"接口默认不可变"，本合同保留该子路径，不删除。
2. **类型面用编译期用例冻结**（B6）：`skills/index.ts` 与 telemetry 的大部分导出是纯类型，运行时断言不到；因此 `tests/types.test.mjs` 在当前入口模式下编译一份正/反向用例，反向用例用 `@ts-expect-error` 固定"必须报错"。这比只断言名字存在更强：实现放宽类型时编译会失败。
3. **`dep:refs` 对经包名入口（`@knorvia/contracts` + 桶再导出）的引用有假阴性**：它把 `formatLocalIsoDate`、`TELEMETRY_SCHEMA_VERSION` 等报成 0 引用。判定以文本搜索为准，理由与反证记在 `callers.md` 末节。
4. **本包 5 个文件没有未使用文件或导出**：`pnpm knip` 报告里没有 `contracts/src/{skills,telemetry,time}/` 与 `contracts/src/index.ts`（全仓 1791 未使用文件 / 597 未使用导出都是既有基线，与本包无关），因此本包没有"无用代码直接删除"的提交。

## 替换阶段登记：包根桶重写引起的 receipt 重固定（第三次，同一套流程）

`apps/cli/packages/contracts/src/index.ts` 是包根再导出桶，替换阶段按合同重写（54 个相对再导出与 5 个 `@knorvia/shared` 名字完全不变，只有注释、分组与命名再导出的书写方式变化）。因此 `apps/cli/packages/core/test/current-message-buffer-artifact-receipt-20261003.json` 中：

- `apps/cli/packages/contracts/src/index.ts`（源字节）、
- `apps/cli/packages/contracts/dist/index.js`、`apps/cli/packages/contracts/dist/index.d.ts`（真实 `tsc` 产物）

这 3 条摘要被重固定，并同步该测试的 JSON 自校验摘要；其余 217 条与 `formatVersion`/`sourceCheckpoint`/`previousReceipt` 链未动。重固定后 220/220 匹配，固定这些路径的 5 个 selector 测试 28/28 通过。

与 PR #129 的区别：那次是**其它文件**（`workflow/*.d.ts`）的产物因编译器 interning 顺序变化而变；这次是本包**自己**的公开桶被重写，源字节与产物都变——同属"真实构建 → 重固定 → 留痕"的既定流程（先例 commit `4bf32a33`），不是放宽测试：`current-artifact-receipt-20261003.ts` 的 220 条断言、220 个摘要全部保留。
