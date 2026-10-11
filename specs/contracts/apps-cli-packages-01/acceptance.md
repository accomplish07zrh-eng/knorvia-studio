# apps-cli-packages-01 合同验收（acceptance.md）

本文件按计划书「每包流程 · 二、合同」与「验收清单 · 合同审查」逐项给出证据。合同版本 **v1**。

## 一、范围与切包

- 包 ID：`apps-cli-packages-01`（M2）。继承文件 **55**（`licensing/current-files.json` 口径）。
- 原计划行（53 文件 / 9,861 行）是 `1ac688f7` 的继承口径；当前实测 `adapters/src` 继承 **63**，
  与 `browser-use-plugin` 的 16 合计 **79 > 60**，已按计划书重切：
  - `apps-cli-packages-01` = `adapters/src` 不含 `browser` → **55**；
  - `apps-cli-packages-01-browser` = `adapters/src/browser` + `browser-use-plugin` → **24**。
- 不在范围：`adapters/src` 里其余 232 个 `independent-replacement` 文件（不动）；`browser/` 8 个
  文件与 `browser-use-plugin` 归第二个包，本包合同不覆盖（见 README §二）。
- 清单与依据：`README.md` §一/§二/§三。

## 二、合同产物

| 文件                      | 内容                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `README.md`               | 范围、重切、55 文件清单、风险、分批进度、条目 → 测试对照表（134 行，无空行）                     |
| `behavior.md`             | B1–B134，每条含输入/输出/错误语义/时序与并发/幂等/资源释放/平台差异/状态所有者/日志级别/可测断言 |
| `interface.md`            | 55 个文件、203 个导出声明、38 条 re-export，签名用 TypeScript 编译器 API 逐字提取                |
| `callers.md`              | 48 个包外导入方                                                                                  |
| `tests/`                  | 9 个 `node:test` 契约测试文件 + 入口解析、PNG 夹具生成、对照表生成、旧门 runner                  |
| `fixtures/session-store/` | 冻结账本 checksum 表 + 脱敏旧写切片                                                              |
| `stubs/`                  | 55 个最小桩（`interface.md` 的导出与签名，函数体抛 `not implemented: apps-cli-packages-01`）     |
| `known-differences.md`    | 必须保留的既有行为、唯一一条覆盖例外、lint/Node/macOS 环境事实                                   |
| `acceptance.md`           | 本文件                                                                                           |
| `gate-old.json`           | 旧门结果（两入口 + 桩替换 + 桩 lint）                                                            |

## 三、旧门结果（`gate-old.json`）

命令（仓库根目录，Node v24.14.0）：

```text
pnpm build:cli-packages
node specs/contracts/apps-cli-packages-01/tests/run-old-gate.mjs --with-stubs
```

| 项                          | 结果                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 用例数                      | **118**（9 个测试文件）                                                                                                                                                  |
| 源码入口                    | **118 / 118 通过**，0 失败，**0 跳过**，0 todo                                                                                                                           |
| dist 入口                   | **118 / 118 通过**，0 失败，**0 跳过**，0 todo                                                                                                                           |
| 预登记差异                  | **0**（`preRegisteredDifferences: []`）                                                                                                                                  |
| 断言放宽                    | **无**（`assertionsRelaxed: false`）                                                                                                                                     |
| 桩替换（55 个桩覆盖 `src`） | **0 通过 / 118 失败**（`allFail: true`）                                                                                                                                 |
| 桩替换时的包级 lint         | 194 warnings / 1 error（见 known-differences §三：那 1 个 error 是**非本包**文件 `model/runner-stream.ts` 既有的 `max-lines`；stub 自己的 warning 全部是「参数未使用」） |

测试只走公开入口：`tests/entry.mjs` 的 `load()` 按 `KNORVIA_ADAPTERS_ENTRY` 在
`apps/cli/packages/adapters/src` 与 `dist` 之间切换同一模块路径；契约产物
（`@knorvia/contracts`）按 `apps/cli/packages/contracts/dist/index.js` 载入，保证类身份一致。

## 四、逐项对照与「没有空行」

- 对照表由 `node specs/contracts/apps-cli-packages-01/tests/build-case-map.mjs` 生成，`--check` 模式
  在缺条目时退出码非 0；生成时打印 `写入 134 行对照表；缺用例 0 条`。
- 时序类用例没有 `sleep` 或固定超时凑结果；唯一等待真实时间的两处是
  `process-probe` 的 1000 ms 采样截止（B79，契约本身就是「1 秒截止」）与 `cli-device-mid` 的
  200×10 ms 锁重试（B87，契约本身就是「重试后回退」）。
- 存储/配置类有往返测试：`tests/session-store.test.ts` 的 `B17/B124` 做「旧写 → 新读 → 新写 → 旧读」，
  旧库是**合成**的 0019 及以前切片 + `schema_migration` 账本 + 一行虚构 `local_setting`；
  `tests/config.test.ts` 的 `B50/B51` 覆盖配置文件的读、迁移落盘与二次读取。

## 五、首次失败与修正记录（如实记录，不是放宽断言）

起草合同与写测试时，有 4 处「合同写错、实测旧实现为准」的修正；每一次都是**改合同/改测试以匹配
旧实现的真实行为**，没有放宽任何断言：

1. **B33**：原写「同 key 以 `skill` 分区为准」，实测 `mergeSkillCommandOverrides(parsed.skill, parseSkillOverridesFromPluralSkills(parsed.skills))`
   是 plural `skills` 在后覆盖 → 合同改为以 plural 为准，测试同步。
2. **B45**：原写「空串也算值」并断言项目配置 `storage.dir: ""` 可覆盖；实测 `storage.dir` 的
   schema 是 `min(1)`，空串在真实配置文件里不可达 → 合同改为「判据是 `!== null && !== undefined`，
   但 schema 让空串不可达」，测试改用「最后一个已发现文件胜出」与 `sessionDbPath` 分支。
3. **B90**：原写「WebP 直通返回输入原引用」；实测 `prepareJimpImageForModel` 先
   `Buffer.from(request.data)` 复制 → 合同改为「返回输入副本；只有直接调用
   `prepareWebpPassthrough` 才是原引用」。
4. **B120**：原写 `cutoffDate === "2026-01-01"`（把「保留 7 天」当成 cutoff=今天-7）；实测
   `cutoff = 今天 - (retentionDays - 1)` → 合同与测试改为 `2025-12-31`（now=2026-01-06）。

另有 3 处测试夹具自身写错（项目配置发现文件名应为 `<dir>/knorvia.json` 或
`<dir>/.knorvia-studio/config.json`；`local_setting.value` 是 JSON 文本；tasklist CSV 是 5 列），
已按实现修正夹具，不是修实现。

## 六、合同审查清单逐条

- [x] 范围、不在范围的相邻文件、可变接口写清；`callers.md` 覆盖全部 48 个包外导入方。
- [x] `behavior.md` 每条都有测试，对照表没有空行（`build-case-map.mjs --check`）。
- [x] 测试只走公开入口（`interface.md` 的模块路径与包导出子路径）。
- [x] 时序类用事件序列/顺序断言，没有 sleep 或固定超时凑结果。
- [x] 存储/配置类有往返测试（B17/B124、B50/B51）。
- [x] 旧门两种入口全过；预登记差异为空。
- [x] 桩只含 `interface.md` 的导出与签名，函数体抛 `not implemented: apps-cli-packages-01`。
- [x] 夹具脱敏：只有虚构占位值（`tests/session-store.test.ts` 的 `B122` 逐字校验夹具内容与禁止模式）。

## 七、未覆盖 / 留给替换阶段

1. **macOS 进程探测未实机验证**（B85 只用合成 `ps` 输出）。
2. **包级 lint 的既有失败**（known-differences §三）：替换阶段的每个新文件必须 ≤ 400 行，且要跑
   一次包级 `oxlint src` 确认不新增问题；本包合同不改 lint 配置、不加免检。
3. **`browser/` 与 `browser-use-plugin`（24 文件）**：属于 `apps-cli-packages-01-browser`，本合同
   分支不含其 B 条目、测试与桩。
4. **`owners.test.mjs` 的删除**：在本包契约测试跑通（源码与 dist 双入口）之后才允许在替换阶段删除，
   依据见 B48 与 `README.md` §六。
