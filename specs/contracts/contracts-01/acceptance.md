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
| source | 27   | 27   | 0    | 0          |
| dist   | 27   | 27   | 0    | 0          |

- 明细见 `gate-old.json`；测试只通过公开入口做黑盒断言，未 import 任何内部实现文件。
- 覆盖重点：常量取值（命令/紧凑/配置/插件/日志/事件类型）、schema 校验矩阵（紧凑三类 payload 的必填/默认值/strict 未知键）、命令参数切分与模板展开、动态 shell 语法拒绝、投影初值与领域 changes、保留策略、内存事件存储、媒体策略、公网出口 IP、Git Bash 路径、官方 marketplace 判定矩阵。

## 门禁

| 检查                                          | 结果                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm fmt:check`                              | 0                                                                             |
| `pnpm provenance:report` / `provenance:check` | 0 / 0                                                                         |
| `pnpm lint`                                   | 0（仅 1 条既有 warning）                                                      |
| `pnpm architecture:check`                     | 0                                                                             |
| `pnpm typecheck`                              | 0（含 `@knorvia/contracts` 包 `tsc --noEmit`）                                |
| `pnpm knip`                                   | main 同失败；相对 main 只少本包已删除的 7 个未使用导出，无新增未使用文件/导出 |
| 全量 `pnpm test:studio`                       | 交 CI（Linux 与 Windows），结果见合同 PR                                      |

## 未覆盖（如实列出）

1. `config/index.ts` 与 `plugins/index.ts` **没有运行时 schema 解析**（只有常量、类型与一个纯谓词），所以不存在「接受/拒绝矩阵」可测；本合同以 B25/B26 断言它们的常量取值、默认运行配置形状与官方 marketplace 判定矩阵。逐键的配置解析/合并与插件清单 schema 在 `adapters` 包（config adapters、插件加载器）里，属其替换包范围。
2. `hooks/` 的 workspace hook 信任**逐条判定行为**由 `specs/contracts/core-hooks`（试点 1 合同）覆盖；本合同只覆盖 `@knorvia/contracts/hooks` 的类型与导出面（B24），不重复断言判定逻辑。
3. `interfaces/*.port.ts` 与各 `*.events.ts` 的类型层契约：由 B1 的导出面断言覆盖（名字与种类），不逐字段断言类型形状（TypeScript 编译期约束，且 CLI 其余包按这些类型编译）。
4. `events/session-projection-transition.ts` 中未在行为测试里触发的分支（例如部分 stream-recovery / workflow 事件分支）：B18/B19 覆盖了紧凑、流式 ledger、恢复锚点、后台任务与队列五类；其余分支未逐条断言。
5. 平台差异：本包为纯逻辑与类型，测试在 Windows 上执行；POSIX 由 CI Linux 覆盖（同一测试文件）。
6. `callers.md` 目前用文本扫描生成（全仓 ts-morph 扫描会 OOM）；v2 用修好的 `dep:refs` 全量重生成并逐入口复核。

以上未覆盖项在 v2 补条目时同步补测试并重跑旧门、升合同版本（合同改动必须升版本）。
