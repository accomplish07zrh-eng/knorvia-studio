# dynamic-workflow-02 替换验收

- 包：`@knorvia/dynamic-workflow` 的运行时侧（`apps/cli/packages/dynamic-workflow/src` 下 `analysis/`、`compiler/` 之外）：合同范围 **40 个继承文件**（37 个重写目标 + 3 个 unreviewed 不动），重写时另拆 **4 个新模块**，共 **41 个自有/重写源文件**。
- 合同：**v3**（`specs/contracts/dynamic-workflow-02`）。v3 按计划书「每包流程」第五步删除 `stubs/`（37 个桩 + `build-stubs.mjs` + `targets.txt`），新增 `design.md`，并登记来源；测试断言一字未改。旧门的两份记录（`gate-old.json` v1、`gate-old-v2.json` v2）保持原样，桩替换的 allFail 证据留在后者。
- 契约测试：源码入口 420/420、dist 入口 420/420（15 个测试文件 / 62 suite，`KNORVIA_DW02_ENTRY=dist`）。合同阶段在旧实现 `8c9a9e86` 上的两次旧门同样是 420/420 + 桩替换 15/15 全失败。
- 相似度：**41/41 通过**（普通模式 29 + 声明模式 12）。全仓搜 `not implemented: dynamic-workflow-02` 结果为零。

## 相似度

工具：`scripts/provenance/similarity.mjs`（main 上的新版本：先按仓库 oxfmt 口径格式化、再去注释后比较）。门槛不变：行包含率 `< 0.20`、最长相同段 `< 8`、结构相似度 `< 0.40`。被替换实现取提交 `8c9a9e86`，上游固定树取 `872ad960`。

```bash
# 普通模式：41 个候选
node scripts/provenance/similarity.mjs \
  --old-rev 8c9a9e86 \
  --candidate-list /tmp/dw02-candidates.txt \
  --upstream-dir /workspace/ktools/zcode-upstream \
  --upstream-rev 872ad960 \
  --json /tmp/dw02-sim-ordinary.json

# 声明模式：普通模式不达标的 12 个纯声明/桶/数据表文件
node scripts/provenance/similarity.mjs \
  --old-rev 8c9a9e86 \
  --candidate-list /tmp/dw02-candidates-decl.txt \
  --upstream-dir /workspace/ktools/zcode-upstream \
  --upstream-rev 872ad960 \
  --declaration \
  --interface specs/contracts/dynamic-workflow-02/interface.md \
  --json /tmp/dw02-sim-decl.json
```

- 普通模式：41 个候选，**29 通过**、12 未过（未过的 12 个全部走声明模式）；最大行包含率 0.1910（`engine/journal-memory.ts`），最长相同段 7（`engine/engine-artifacts.ts` / `engine/engine-report.ts` / `engine/engine-world.ts`），结构相似度最大 0.1905（`schema/validate.ts`）。
- 声明模式：12 个候选，**12 通过**；每个文件的 `residual-lines` 都是 0，行包含率 / 最长相同段 / 结构相似度也都是 0.000。被剔除的声明块数见下表（`stripped-blocks`）。

### 声明模式文件清单与理由

| 文件                              | 声明块 | 声明模式理由                                                            |
| --------------------------------- | -----: | ----------------------------------------------------------------------- |
| `engine/ask-observation-types.ts` |      6 | 观察载荷与 64/120/240 常量的纯类型/常量面，兼容声明占满可比较行         |
| `engine/engine-state.ts`          |      3 | run 结算袋与引擎状态的纯类型面                                          |
| `engine/imported-cache-types.ts`  |      4 | 导入缓存条目与队列的纯类型面                                            |
| `engine/index.ts`                 |      2 | 引擎桶，只有再导出与类型转发                                            |
| `engine/run-terminal.ts`          |      2 | `ProviderStopDetails` / `RunStallInfo` 的纯类型面                       |
| `engine/scheduler-types.ts`       |      4 | 调度器数据结构与 `defer` 兼容工具                                       |
| `engine/types.ts`                 |     41 | Boundary A/B/C、record 与上限常量的总类型面，兼容声明占比最高           |
| `facade/artifact-caps.ts`         |      2 | 8 键常量表与 id 正则；值由 B22 逐字钉住，正文没有可独立改写的运行时逻辑 |
| `facade/registry-tables.ts`       |      7 | 两张注册表的数据行与 op 类型；身份按声明判定，B29 逐行断言              |
| `facade/world-read-caps.ts`       |      1 | 9 键常量表；值由 B22 逐字钉住                                           |
| `schema/types.ts`                 |      6 | JSON Schema / 违规 / 诊断码的纯类型与常量面                             |
| `index.ts`                        |     17 | 根桶，只有再导出与类型转发                                              |

判定口径与 `specs/contracts/dynamic-workflow-02/acceptance.md` 第八节、dw01 验收第九节一致：当兼容面声明行本身 ≥ 残留归一化行数的 20% 时，普通模式在数学上不可达，按声明模式计分；声明模式仍要过行与结构两道门槛，工具只剔除 `interface.md` 列出的兼容名字所在块/行。`facade/dts.ts` 的注释全部自写，普通模式实测 0.1225 / 2 / 0.0909，三项全过，不需要单开声明面计分。

## 门禁（本地，Node v24.14.0）

| 门禁             | 命令                                                                                                                                    | 结果                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 构建             | `pnpm --dir apps/cli/packages/dynamic-workflow build`                                                                                   | 退出码 0（`generate-libs.mjs && tsc`）                                                  |
| 契约测试（源码） | `node scripts/contract-gate.mjs --contract specs/contracts/dynamic-workflow-02 --tests "*.test.mjs" --dist-env KNORVIA_DW02_ENTRY=dist` | 420/420 通过                                                                            |
| 契约测试（dist） | 同一命令的 dist 入口                                                                                                                    | 420/420 通过                                                                            |
| 格式             | `pnpm fmt:check`                                                                                                                        | `All matched files use the correct format.`（8,388 文件）                               |
| Lint             | `pnpm lint`                                                                                                                             | `Found 215 warnings and 0 errors.`（3,800 文件）——warning 全部是既有基线                |
| 类型检查         | `pnpm typecheck`                                                                                                                        | 退出码 0；`i18n:check` 先行通过（5,573 键一致）                                         |
| 未使用代码       | `pnpm knip`                                                                                                                             | 退出码 1（仓库既有基线：327 个 unused files / 673 个 unused exports 等）；本包残留 0 行 |
| 来源登记         | `pnpm provenance:report` → `pnpm provenance:check`                                                                                      | `reviewProblems 0`、`missingReviews []`；reviews.json 12,262 → 12,344 条                |
| 离线回归         | `pnpm test:studio`（前置 `pnpm build:cli-packages`）                                                                                    | 10,091/10,103 通过；3 失败 + 1 cancelled 均为环境项，见下                               |

- `knip` 的全仓不干净是既有基线，dw01 验收同样记录过；本包新增的 4 个录制/生成器脚本与 3 个测试辅助入口已写入 `knip.json` 根 entry，全仓输出里不再有 `dynamic-workflow-02` 的任何行。
- `licensing/reviews.json` 的 82 条新登记全部程序化追加：41 个源文件（37 个继承目标 + 4 个新拆模块）与 39 个合同文件先登记，替换验收文档与合同验收记录的 v3 追加随后登记；每条都带 `normalizedSha256`、实测相似度数值或旧门证据。`current-files.json` 重新生成后 41 个源文件的分类都是 `original`，3 个 unreviewed 保持不动。
- 契约测试的范围断言在登记后仍指向原 40 个继承文件：`tests/scope.mjs` 把已登记目标按合同基线冻结的 24 个 `upstream-unchanged` 名单归位、其余算 `upstream-modified`，并跳过 4 个新拆模块；断言本身未改。

### 下游 core 哈希 re-pin

`facade/dts.ts` 是 core 两个工具描述的直接来源（`create-workflow-description.ts` / `eval-workflow-snippet-description.ts` 内嵌 `FACADE_DTS` / `SNIPPET_FACADE_DTS`）。本次重写替换了模型可见正文，两个 core 测试里的摘要值随之更新——只改哈希值，断言一字未动，沿用 dw01 #193 的 pure hash re-pin 先例：

| 文件                                                      | 字段                  | 新值                                                               |
| --------------------------------------------------------- | --------------------- | ------------------------------------------------------------------ |
| `core/test/create-workflow-graph-fold-contract.json`      | `public`              | `c8ee774be2a153e12b2a35748a754fcf72044b4418fc2925e5945737239ca86a` |
| `core/test/eval-workflow-snippet-execution-contract.json` | `modelContractSha256` | `c9361a3cf1d5a977801aee1031c6e856a89b3e28b9b9c5d53ca34efdc7c955e9` |

可逆实验确认因果：临时换回旧 `dts.ts` 重建后，这两个测试文件 13/13 通过；还原重写版并 re-pin 后同样 13/13。`licensing/reviews.json` 里这两个文件的既有 `original` 记录只随动更新 `normalizedSha256`（不新增条目，条数不变）。

### test:studio（全量）

`pnpm test:studio`（前置 `pnpm build:cli-packages`）最终结果：`tests 10103` / `suites 68` / `pass 10091` / `fail 3` / `cancelled 1` / `skipped 8` / `duration_ms 794407.379083`。4 个未通过项与 dw01 #193 / #198 相同，均为本机环境而非本包代码：

- 3 个 `file-watcher-native-fast-20261001.test.ts` 用例：容器 `fs.inotify.max_user_instances=128` / `max_user_watches=127859` 触顶，报 `ENOSPC: System limit for number of file watchers reached`，其中递归监听用例超时后计为 cancelled。临时提高容器 inotify 限额后隔离复跑该文件：3/3 通过（限额已恢复原值）。
- 1 个 `studio-cli-catalog-20261006.test.ts` 用例：本机装了 `~/.grok/bin/grok`，`resolveExecutable` 的每用户候选命中真实安装，预期的「未安装」拒绝没有触发。干净 `HOME` 隔离复跑该文件：4/4 通过。

两处复跑都没有修改测试代码或断言；CI 环境无 `~/.grok` 且 inotify 限额更高，以 CI 结果为准。

## 未闭合项

- **K10 的 message 文本**：golden 仍钉住旧实现的 21 处引擎错误 `message`，与「流程判断只看码」的口径相冲，等 Lead 裁定（合同阶段已登记，不在替换阶段擅自放宽）。
- **Windows 腿**：本地只在 Linux 实测；本阶段不 push、不开 PR，`studio-offline.yml` 的 Windows 结果尚未取得。
- **符号级引用回溯**：`pnpm dep:refs` 在 537 项导出规模下 V8 OOM；兼容面判断仍建立在语法级 import 扫描 + 字符串路径人工核对之上（`callers.md`）。
- **跨实现进程交接**：旧实现落库 → 新实现 resume 的 SQLite 侧由 bootstrap/runtime 负责，本包只保证 `dwf_*` 行与事件轨的逐字节形状。
