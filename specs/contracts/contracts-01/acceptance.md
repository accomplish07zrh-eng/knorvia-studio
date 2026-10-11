# contracts-01 验收（acceptance.md）

## 范围

- 包：`apps/cli/packages/contracts`（`@knorvia/contracts`）。
- 本合同覆盖 `src` 下 12 个目录共 **57 个继承文件**（按 `licensing/current-files.json` 的继承分类）：capabilities 1、commands 1、compact 1、config 1、events 11、hooks 3、interfaces 28、logging 1、model 6、network 1、path 2、plugins 1。
- 不在范围：`errors/`（已登记 independent-replacement）、`interfaces/browser-control.port.ts` 与 `interfaces/project-permission-update.port.ts`（已登记 independent-replacement/original）、以及 `tools/`、`tracing/`、`workflow/`、`rewind/`、`skills/`、`telemetry/`、`time/`、包根 `index.ts`（属 `contracts-02`）。
- 已注册为 `independent-replacement`/`original` 的文件不动；本合同不改变它们的登记结论。

## 旧门（旧实现）

- 命令：
  - 源码入口：`node --import tsx --test specs/contracts/contracts-01/tests/api-surface.test.mjs specs/contracts/contracts-01/tests/behavior.test.mjs`
  - dist 入口：`pnpm build:cli-packages` 后 `KNORVIA_CONTRACTS_ENTRY=dist` 重跑同一命令
- 结果（主仓提交 `6ea4cbe7`，Node 24.14.0 + pnpm 10.33.2）：

| 入口   | 用例 | 通过 | 失败 | 预登记差异 |
| ------ | ---- | ---- | ---- | ---------- |
| source | 25   | 25   | 0    | 0          |
| dist   | 25   | 25   | 0    | 0          |

- 明细见 `gate-old.json`；测试只通过公开入口做黑盒断言，未 import 任何内部实现文件。

## 门禁

| 检查                                          | 结果                                           |
| --------------------------------------------- | ---------------------------------------------- |
| `pnpm fmt:check`                              | 0                                              |
| `pnpm provenance:report` / `provenance:check` | 0 / 0                                          |
| `pnpm lint`                                   | 0（仅既有 warning）                            |
| `pnpm architecture:check`                     | 0                                              |
| `pnpm knip`                                   | 与 main 输出逐行一致（未新增未使用文件或导出） |
| 全量 `pnpm test:studio`                       | 交 CI（Linux 与 Windows），结果见合同 PR       |

## 未覆盖（如实列出）

1. `plugins/index.ts` 与 `config/index.ts` 的**逐 schema 校验行为**：v1 只覆盖导出面（B23），未逐条断言 schema 的接受/拒绝矩阵。
2. `hooks/` 的 workspace hook 信任判定与 trust store 行为：v1 只覆盖导出面（B24）。
3. `interfaces/*.port.ts` 与各 `*.events.ts` 的类型层契约：由 B1 的导出面断言覆盖（名字与种类），不逐字段断言类型形状（TypeScript 编译期约束，且 CLI 其余包按这些类型编译）。
4. `events/session-projection-transition.ts` 中未在行为测试里触发的分支（例如部分 stream-recovery / workflow 事件分支）：B18/B19 覆盖了紧凑、流式 ledger、恢复锚点、后台任务与队列五类；其余分支未逐条断言。
5. 平台差异：本包为纯逻辑与类型，测试在 Windows 上执行；POSIX 由 CI Linux 覆盖（同一测试文件）。

以上未覆盖项在 v2 补条目时同步补测试并重跑旧门、升合同版本（合同改动必须升版本）。
