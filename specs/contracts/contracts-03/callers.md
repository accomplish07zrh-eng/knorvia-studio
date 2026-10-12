# contracts-03 调用方（callers.md）

范围：`@knorvia/contracts` 的 `skills`（1 继承）、`telemetry`（2）、`time`（1）与包根 `index.ts`（1）。
方法：对每个公开入口做全仓文本搜索（`apps/cli/packages`、`packages`、`scripts`，排除 `node_modules`、`dist` 与本地工具目录），
列出 import 调用点；再用 `dep:refs` 对关键导出抽样核对（见文末）。同一文件多次命中只记一行。

## `@knorvia/contracts/telemetry`

命中 7 处，全部在 `apps/cli/packages/telemetry`：

- `apps\cli\packages\telemetry\src\provider-endpoint.ts:1` — `import type { ProviderEndpointIdentity } from "@knorvia/contracts/telemetry";`
- `apps\cli\packages\telemetry\src\otlp-exporter.ts:26` — `} from "@knorvia/contracts/telemetry";`（`TELEMETRY_SCHEMA_VERSION`、`TelemetryResourceContext`、`TelemetryIdentitySnapshot` 等）
- `apps\cli\packages\telemetry\src\bootstrap.ts:13` — `} from "@knorvia/contracts/telemetry";`（`AgentExecutionTelemetryPort`、`AgentTelemetryRuntimeOwner` 等）
- `apps\cli\packages\telemetry\src\agent-trace-runtime.ts:44` — `} from "@knorvia/contracts/telemetry";`（实现 `AgentExecutionTelemetryPort`、`ModelExecutionTelemetryPort`）
- `apps\cli\packages\telemetry\src\agent-trace-support.ts:18` — `} from "@knorvia/contracts/telemetry";`
- `apps\cli\packages\telemetry\src\model-api-recorder.ts:16` — `} from "@knorvia/contracts/telemetry";`（`ModelApiOperationKind` 等）
- `apps\cli\packages\telemetry\src\compatibility-adapters.ts:2` — `import type { ResolvedModelTelemetryDescriptor } from "@knorvia/contracts/telemetry";`

## `@knorvia/contracts/skills`

命中 **0** 处：`skills/index.ts` 的类型没有包外调用方从该子路径导入。
它仍被两类调用方使用：

- 包内：`apps\cli\packages\contracts\src\plugins\index.ts:4`（`SkillRoot`）、`apps\cli\packages\contracts\src\events\session.events.ts:48`（`SkillTelemetryMetadata`）。
- 包外：经包根 `@knorvia/contracts` 导入其类型，例如 `apps\cli\packages\bootstrap\src\skills.ts:4`、`apps\cli\packages\core\src\context\sections\skills.ts:1`、`apps\cli\packages\adapters\src\skills\index.ts:7`（`SkillLoadOutcome`/`SkillMetadata`/`SkillContent`/`SkillDiagnostic`）。

保留 `./skills` 子路径是为了不改动既有公开入口；本包不删除它（计划书「接口默认不可变」）。

## `@knorvia/contracts`（包根 `index.ts`）

命中 **961** 个源文件（`apps/cli/packages` + `packages` + `scripts`，排除 `node_modules`/`dist`）。
包根是本包唯一的"全量"入口：54 个相对模块路径与 5 个 `@knorvia/shared` 名字都从这里可见。

- `apps\cli\packages\adapters\src\browser\descriptor.ts:1`
- `apps\cli\packages\adapters\src\context\index.ts:9` — `import { formatLocalIsoDate } from "@knorvia/contracts";`
- `apps\cli\packages\core\src\runtime\deps.ts:83` — 转出 `formatLocalIsoDate`
- `apps\cli\packages\core\src\runtime\helpers\project-memory-agent.ts:2` — `import type { AgentTelemetryCausation, ModelApiOperation } from "@knorvia/contracts";`
- `apps\cli\packages\bootstrap\src\protocol\skill-reference-catalog.ts:8` — `import type { SkillLoadOutcome, SkillMetadata } from "@knorvia/contracts";`
- `apps\cli\packages\bootstrap\src\app\types.ts:74`、`apps\cli\packages\core\src\context\types.ts:11`、`apps\cli\packages\core\src\runtime\types.ts:6`、`apps\cli\packages\core\src\tool\executor\types.ts:2` — 类型装配点
- （其余 950 余处为整包其他区的调用方，不在本包范围，见 `contracts-01` / `contracts-02` 的 `callers.md`）

## 本包符号级命中（排除规范文件自身与 `docs/evidence` 草案）

| 符号                          | 包外调用方                   | 代表位置                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatLocalIsoDate`          | 3 个文件                     | `apps\cli\packages\adapters\src\context\index.ts:9`、`apps\cli\packages\core\src\runtime\deps.ts:83`、`apps\cli\packages\core\src\runtime\methods\turn-command-data.ts:4`                                                                                                                                                                                                                                                    |
| `AgentExecutionTelemetryPort` | 8 个文件                     | `apps\cli\packages\core\src\runtime\types.ts:6`、`apps\cli\packages\core\src\tool\executor\types.ts:2`、`apps\cli\packages\core\src\telemetry\runtime-telemetry.ts:2`、`apps\cli\packages\bootstrap\src\app\workflow-facade.ts:23`、`apps\cli\packages\bootstrap\src\app\script-workflow-child-runtime.ts:16`、`apps\cli\packages\telemetry\src\bootstrap.ts:8`、`apps\cli\packages\telemetry\src\agent-trace-runtime.ts:14` |
| `TELEMETRY_SCHEMA_VERSION`    | 1 个文件                     | `apps\cli\packages\telemetry\src\otlp-exporter.ts:22`                                                                                                                                                                                                                                                                                                                                                                        |
| `ModelApiOperation`           | 2 个源文件（+ 1 个测试夹具） | `apps\cli\packages\core\src\runtime\helpers\project-memory-agent.ts:2`、`apps\cli\packages\telemetry\src\model-api-recorder.ts:10`（该文件用 `ModelApiOperationKind`）                                                                                                                                                                                                                                                       |
| `SkillLoadOutcome`            | 15 个文件                    | `apps\cli\packages\bootstrap\src\skills.ts:4`、`apps\cli\packages\core\src\context\sections\skills.ts:1`、`apps\cli\packages\core\src\runtime\methods\context.ts:11`、`apps\cli\packages\adapters\src\skills\index.ts:7`、`apps\cli\packages\bootstrap\src\protocol\skill-reference-catalog.ts:8`                                                                                                                            |
| `AgentTelemetryOperation`     | 0 个（包内自用 + 公开面）    | 仅 `contracts/src/telemetry/{index,agent-execution}.ts`                                                                                                                                                                                                                                                                                                                                                                      |

## `dep:refs` 抽样核对（符号级，含工具假阴性）

抽样覆盖：`ModelApiOperation`、`formatLocalIsoDate`、`SkillLoadOutcome`、`AgentExecutionTelemetryPort`、`TELEMETRY_SCHEMA_VERSION`、`resolveModelApiCallObservation`。实测结果（`pnpm dep:refs <file>:<export>`）：

| 查询                                                       | dep:refs 结果                                               | 与文本搜索是否一致                                                                                                                                                                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `telemetry/index.ts:ModelApiOperation`                     | 18 处引用（全部在 `contracts/src/telemetry/index.ts` 内部） | 一致：包外只有 `core/runtime/helpers/project-memory-agent.ts` 与 `telemetry/model-api-recorder.ts`（后者用 `ModelApiOperationKind`），dep:refs 未列出包外命中                                                                    |
| `time/local-date.ts:formatLocalIsoDate`                    | **0 处**（"Safe to delete"）                                | **不一致（工具假阴性）**：`apps/cli/packages/adapters/src/context/index.ts:9` 从 `@knorvia/contracts` 导入并调用；`apps/cli/packages/core/src/runtime/deps.ts:83` 再转出，`core/src/runtime/methods/turn-command-data.ts:4` 使用 |
| `skills/index.ts:SkillLoadOutcome`                         | 1 处（本文件内）                                            | **不一致（工具假阴性）**：`bootstrap/src/skills.ts:4`、`core/src/context/sections/skills.ts:1`、`adapters/src/skills/index.ts:7` 等 15 个文件经包根导入                                                                          |
| `telemetry/agent-execution.ts:AgentExecutionTelemetryPort` | 2 处（本包内）                                              | **不一致（工具假阴性）**：8 个包外文件使用（`core/src/runtime/types.ts:6`、`core/src/tool/executor/types.ts:2`、`bootstrap/src/app/workflow-facade.ts:23` 等）                                                                   |
| `telemetry/agent-execution.ts:TELEMETRY_SCHEMA_VERSION`    | **0 处**                                                    | **不一致（工具假阴性）**：`telemetry/src/otlp-exporter.ts:22` 使用                                                                                                                                                               |
| `telemetry/index.ts:resolveModelApiCallObservation`        | **0 处**                                                    | 待替换阶段实现后由契约测试覆盖；当前包外无调用方，仅作为公开面保留                                                                                                                                                               |

**工具局限（如实记录）**：`dep:refs` 只做静态、按文件路径的符号解析，不跟随 `@knorvia/contracts` 这种**包名入口 + 桶再导出**的引用（issue #116 记录过同类问题）。
因此"0 引用"不能当作"可以删除"的依据。反证很直接：把 `formatLocalIsoDate` 去掉会让 `apps/cli/packages/adapters/src/context/index.ts` 编译失败（`pnpm typecheck` 覆盖它）。
本包的判定口径因此是：**文本搜索（入口级）为主，`dep:refs` 只用于看包内实现引用**；两者不一致时以上表为准并记录在案。
