# Knorvia Studio 契约测试收录（M0-10）

2026-10-11。依据《Knorvia 独立替换任务计划书》M0-10 编写；本规格先于实现。分支 `m0/10-contract-tests`，基线 `origin/main` `70edae4b`。

## 背景与现状（已核对源码与实测）

计划书规定合同放在 `specs/contracts/<包 ID>/`（`README.md`、`behavior.md`、`interface.md`、`callers.md`、`tests/`、`fixtures/`、`known-differences.md`、`acceptance.md`、`stubs/`），合同 PR 必须先让契约测试在旧实现上全过。但 `pnpm test:studio` 的唯一入口 `scripts/test-studio.mjs` 只扫描 15 个固定测试目录，加上 43 个显式登记的 `scripts/` 与包内测试文件；`specs/` 不在任何扫描范围内。合同合入 main 后，它的契约测试不会被 CI 跑到，等于「合同进了 main、旧行为没人守」。

本规格定义收录规则，让 `specs/contracts/*/tests` 与既有测试同一子进程、同一超时、同一隔离环境运行；同时保证还没有合同时（当前 main 就是这种状态）空跑通过。

## 术语

- **合同目录**：`specs/contracts/<包 ID>/`，`<包 ID>` 是计划书分包总表里的 ID（如 `core-tool-01`）。直接子目录才算合同目录；`specs/contracts/` 下的普通文件（如顶层 `README.md`）与符号链接都不收录，与来源工具不跟随链接的做法一致。
- **契约测试文件**：合同目录 `tests/` **顶层**、名字匹配 `*.test.ts` 或 `*.test.mjs` 的文件（含 `.hidden.test.mjs`、`.test.mjs` 这类点开头名字，与既有目录扫描规则一致）。
- **收录结果**：`pnpm test:studio` 实际传给 Node 测试运行器的文件全集；唯一来源是文件系统扫描。
- **原生 glob 参数**：argv 长度受限，逐文件传参在 Windows 上会超长，因此选择集用目录模式表达；模式只是载体，模式实际命中的集合必须与收录结果逐文件相等（既有 `compactStudioTestArguments` 规则）。
- **失败封闭**：宁可报错退出，也不放过任何「看着跑了、实际没跑」或「选择集与实际不符」的情况。
- **契约测试入口**：契约测试要断言的被测实现来自哪里——源码入口（`source`）还是构建产物入口（`dist`）。计划书二.合同要求同一份契约测试能分别对两种入口运行，合同 README 写明入口。

## 规则

1. **R1 收录范围。** `pnpm test:studio` 必须收录每个合同目录 `tests/` 顶层的契约测试文件；收录后与既有测试一起跑，不另起进程、不单独超时、不放宽断言。`tests/` 的子目录不被扫描（与既有 15 个测试目录只扫顶层的规则一致）。
2. **R2 空集合通过。** `specs/contracts` 不存在、`specs/contracts` 下没有合同目录、或某个合同目录没有 `tests/` 子目录时，收录结果为空集合，**不报错、不打印失败**，`pnpm test:studio` 照常跑既有测试并以既有结果退出。第三个情形是计划书五.2 的正常终态：替换完成后契约测试移入对应包的 `test/`，合同目录只剩文档，此时不能因为缺 `tests/` 而让整轮失败。
3. **R3 失败封闭。** 以下情形必须报错并以非 0 退出，不能静默漏跑，也不能「找不到就跳过」：
   - `tests/` 目录存在，但顶层没有任何契约测试文件（例如只有夹具、只有 `.spec.ts`、测试写进了子目录）；
   - 合同目录名含原生 glob 元字符（`*`、`?`、`[`、`]`、`{`、`}`、`!`、`(`、`)`、`@`、`+` 等）或不是 ASCII 安全名——这类名字无法用模式可靠表达，继续跑会让选择集扩大或缩小；
   - 原生 glob 实际命中的集合与收录结果不一致（多一个、少一个、大小写变体被大小写不敏感的文件系统顺带匹配上）。
4. **R4 集合对账。** 原生 glob 命中集合与收录结果必须逐文件相等，差异写成 `missing` / `unexpected` 报出；收录结果为空（一个测试都没有）也算失败，防止入口被改坏后「成功跑了 0 个用例」。
5. **R5 单一清单所有者。** 测试目录与显式测试文件清单由 `scripts/studio-test-manifest.mjs` 唯一持有；新增测试入口只改这一处。收录逻辑在 `scripts/studio-test-selection.mjs`，argv 压缩与集合对账仍在 `scripts/studio-test-arguments.mjs`。`scripts/` 不在目录扫描范围内，本规格新增的测试文件必须显式登记进清单。
6. **R6 平台一致。** 路径一律按 `/` 归一后对账，文件系统访问用 `path` 拼接；目录不存在（`ENOENT`）按 R2 处理而不是错误；大小写不敏感的文件系统必须按 R3 失败封闭（不能用大小写差异放宽）。夹具与断言同时兼容 Windows 与 POSIX。
7. **R7 收录必须被执行证明。** 回归必须覆盖三件事：没有合同目录时整轮跑通、有契约测试时被收录、被收录文件确实执行且失败不被吞（失败用例让整轮非 0 退出）。只断言「选择集里有这个路径」不算证明。
8. **R8 可见性。** 收录了契约测试时，入口启动行要写清来源目录、契约测试文件数与契约测试入口，便于在 CI 日志里确认合同真的被跑到。
9. **R9 入口传导。** 契约测试对源码入口与 dist 入口分别运行，入口由收集器唯一决定并通过环境变量 `KNORVIA_CONTRACT_ENTRY` 传给测试进程：默认 `source`，可选 `source`、`dist`。取值非法时在启动测试前报错并非 0 退出，不静默按默认入口跑。入口只决定契约测试如何解析被测实现，**不参与收录**：同一仓库在两种入口下的收录集合与对账结果必须一致，入口不能变成筛选或跳过测试的开关。

## 收录流程

```text
specs/contracts/<包 ID>/tests/*.test.{ts,mjs}  ─┐
15 个既有测试目录（顶层）                      ─┼─→ 文件系统扫描（唯一来源）
scripts/ 与包内显式登记文件（清单）             ─┘        │
                                                          ├─→ 收录结果 → 逐文件相等 ← 原生 glob 命中集合
                                                          │      （不一致即失败退出）
                                                          └─→ Node 测试运行器（同一子进程、同一超时、同一隔离环境，
                                                                契约测试入口经 KNORVIA_CONTRACT_ENTRY 传导）
```

## 判定表：合同目录状态

| 合同目录状态                                  | 收录结果 | 退出行为                             |
| --------------------------------------------- | -------- | ------------------------------------ |
| `specs/contracts` 不存在                      | 空       | 照常跑，不报错                       |
| 合同目录存在，无 `tests/`（替换完成后的终态） | 空       | 照常跑，不报错                       |
| `tests/` 顶层有契约测试文件                   | 全部收录 | 照常跑，不报错（入口不改变收录集合） |
| `tests/` 存在但顶层无契约测试文件             | —        | 报错、非 0 退出                      |
| `KNORVIA_CONTRACT_ENTRY` 不是 `source`/`dist` | —        | 报错、非 0 退出（未启动任何用例）    |
| 合同目录名含原生 glob 元字符                  | —        | 报错、非 0 退出                      |
| 模式命中集合与收录结果不一致（含大小写变体）  | —        | 报错、非 0 退出                      |
| 收录结果为空（清单与扫描都没结果）            | —        | 报错、非 0 退出                      |

## 验收场景

1. 当前 main（无 `specs/contracts`）跑 `pnpm test:studio`：通过，启动行的文件数与收录结果一致，日志不出现契约测试来源行。
2. 夹具仓库无 `specs/contracts`：入口 `node scripts/test-studio.mjs` 退出码 0，`# fail 0`，不出现契约测试来源行。
3. 夹具仓库放入 `specs/contracts/<包 ID>/tests/pass.test.mjs`：入口退出码 0，输出含该用例名，启动行写出契约测试来源与文件数。
4. 同一夹具再放入失败用例：入口退出码 1，输出含 `# fail 1` 与失败原因（不被跳过、不被吞），同时收录的通过用例确实执行。
5. 单测覆盖 R2、R3、R4、R6：空集合、缺 `tests/`、顶层无可运行测试文件、非法合同目录名、大小写变体、元字符文件名的精确对账。
6. 上述单测文件 `scripts/studio-test-selection.test.mjs` 已显式登记进清单，随 `pnpm test:studio` 一起运行。
7. 入口传导（R9）：夹具契约测试读取 `KNORVIA_CONTRACT_ENTRY`，不设变量时得到 `source`，显式设 `dist` 时得到 `dist`，两种入口下启动行的文件数一致；取值非法时入口在启动任何用例前非 0 退出，输出不含夹具用例名。

## 条目 → 测试对照表

除注明外，测试都在 `scripts/studio-test-selection.test.mjs`（已显式登记进清单）。

| 条目                                                             | 要求                                                                  | 对应测试                                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 计划书 M0-10                                                     | `specs/contracts/*/tests` 被 `pnpm test:studio` 收录                  | contract tests under specs/contracts/\*/tests join the validated selection and execute                                                                                                                                             |
| 计划书 M0-10                                                     | 没有合同时空跑通过                                                    | a repository without specs/contracts keeps an empty contract selection and passes；the studio entry point passes without any contract directory                                                                                    |
| R1 收录范围                                                      | 只收 `tests/` 顶层的 `*.test.ts` / `*.test.mjs`                       | contract tests under specs/contracts/\*/tests join the validated selection and execute；glob metacharacters and spaces in contract test names stay selected exactly once                                                           |
| R2 空集合通过                                                    | 缺 `specs/contracts`、缺 `tests/` 都不报错                            | a repository without specs/contracts keeps an empty contract selection and passes；a contract directory without tests keeps an empty selection after replacement                                                                   |
| R3 失败封闭                                                      | `tests/` 顶层无可运行测试文件、目录名含原生 glob 元字符、入口取值非法 | a contract tests directory without a top-level test file fails closed；a contract directory name a native glob cannot express fails closed；an unknown contract entry fails closed before any contract test runs                   |
| R4 集合对账                                                      | 模式命中集合 = 收录结果，差异按 `missing` / `unexpected` 报出         | case-insensitive native globs cannot widen contract discovery；`scripts/studio-test-arguments.test.mjs`（既有：missing / unexpected / 空集合 / 重复）                                                                              |
| R5 单一清单所有者                                                | 清单唯一，新测试文件已登记                                            | the checked-in manifest selection stays consistent with the repository tree                                                                                                                                                        |
| R6 平台一致                                                      | Windows 与 POSIX 的路径、换行、大小写                                 | case-insensitive native globs cannot widen contract discovery（按平台分支）；夹具一律用 `path` 拼接、断言一律按 `/` 归一                                                                                                           |
| R7 收录必须被执行证明                                            | 被收录文件确实执行，失败不被吞                                        | contract tests under specs/contracts/\*/tests join the validated selection and execute；a failing contract test fails the aggregate run instead of being skipped；the studio entry point exits non-zero when a contract test fails |
| R8 可见性                                                        | 启动行写出契约来源目录与文件数                                        | the studio entry point includes contract tests and reports them                                                                                                                                                                    |
| R9 入口传导（计划书二.合同「能分别对源码入口和 dist 入口运行」） | 默认 `source`                                                         | the studio entry point conveys the source contract entry by default                                                                                                                                                                |
| R9 入口传导                                                      | 显式 `dist`                                                           | the studio entry point conveys the dist contract entry without changing the collected set                                                                                                                                          |
| R9 入口传导                                                      | 非法取值在启动任何用例前失败封闭                                      | an unknown contract entry fails closed before any contract test runs                                                                                                                                                               |
| R9 入口传导                                                      | 入口不参与收录：两种入口收录集合一致                                  | the studio entry point conveys the dist contract entry without changing the collected set（断言两种入口的启动行文件数一致）                                                                                                        |

## 未覆盖与偏离

- 夹具里的入口回归把 `scripts/studio-test-manifest.mjs` 换成本夹具自己的最小清单（同名的 `testDirectories` / `explicitTests` 导出），不复制真实仓库的全部用例；真实清单由每次 `pnpm test:studio` 实跑覆盖。
- 夹具在 `node_modules/tsx/` 放一个一行转发到真实 `tsx` 载入器的包，只为让 `--import tsx` 在临时目录里解析到真实加载器；不替换 TypeScript 转译实现，也不改产品代码。
- macOS 未实机验证（平台差异按计划书如实标注）；Windows 与 Linux 由 CI 双平台覆盖。
- 当前 main 还没有合同目录，dist 入口只能验证到「收集器把入口取值原样传导给契约测试、且不改变收录集合」；某个包真正解析源码/dist 入口的断言由该包合同（M0-13 起）在自己的契约测试里写。
