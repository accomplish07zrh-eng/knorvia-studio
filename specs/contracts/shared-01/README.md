# shared-01 合同（`packages/shared/src` · `node`、`protocol-v4`）

**合同版本：v2**（v2 = v1（2026-10-14，PR #152）按 Lead 裁决 C（2026-10-14，issue #148 评论）的收尾修订：**删除 `stubs/`**，桩替换证据转 `gate-old.json` 留证；本包契约测试没有读桩的断言，故无 oracle 可换，详见 `known-differences.md` 第 7 节。旧门基线以 [`gate-old.json`](gate-old.json) 的 `commit` 字段为准；此后合同任何改动都要重跑旧门并升版本）

v2 另含两处配套：① `README.md`/`acceptance.md` 按 core-hooks v1.1 先例升版本并记录旧门复跑；
② 按 core-tool-01 v2 先例把 `gate-old.json` 的 `stubReplacement` 标为 historical（记录本身保留）。

本目录是 M3 首包 `shared-01` 的**兼容合同**：先冻结公开行为与签名，再按合同独立实现
（替换阶段见计划书「每包流程」四、五）。

- 分支：`replace/shared-01`（替换阶段 PR；v1 合同原分支 `contract/shared-01`，工作树 `wt/exec-5-contract`）
- 依据：《Knorvia 独立替换任务计划书》「每包流程」一～三、分包总表 `shared-01` 行、
  「共享、服务与服务端」区域的「协议与 wire-codec」要求
- 第三方核实结论：`docs/knorvia-third-party-verification-20261011.md` 的 `shared-01` 小节（M0-6）——
  `wire-codec.ts` 与 microsoft/vscode 固定提交比对为「**无上游**」，随本包重写，本包没有需要原样
  登记的第三方文件

## 一、范围与边界

范围 = `packages/shared/src/node/**` + `packages/shared/src/protocol-v4/**` 里的继承文件。

| 继承分类             | 文件数 | 本包处置                                                                                         |
| -------------------- | -----: | ------------------------------------------------------------------------------------------------ |
| `upstream-unchanged` |     22 | 按合同重写（接口与帧格式一字不改）                                                               |
| `upstream-modified`  |      5 | 同上，ZCode 改动部分一并重写                                                                     |
| **继承文件小计**     | **27** | 与计划书分包总表的「27 文件」一致；单包 ≤60 ✓                                                    |
| `unreviewed`         |     30 | **不在本包选包口径内**：属 M0-2/M0-3 复核范围，不重写、不删（见 `known-differences.md` 第 2 节） |
| 合计                 |     57 | —                                                                                                |

逐文件清单见 [`scope-files.json`](scope-files.json)（机器生成）。

**不在范围**：`packages/shared/src` 其余目录（`shared-02/03/04`）；`packages/rpc/src`
（`packages-02`）；`packages/shared/src/protocol`（旧协议面，其它包）；两个入口桶
`node.ts` / `protocol-v4/index.ts` 的内部实现可任意重组，但导出面冻结。

## 二、兼容面（公开入口）

| 子路径                        | 源文件                                     | dist 文件（`tsc -b packages/shared` 产物）  |
| ----------------------------- | ------------------------------------------ | ------------------------------------------- |
| `@knorvia/shared/node`        | `packages/shared/src/node.ts`              | `packages/shared/dist/node.js`              |
| `@knorvia/shared/protocol-v4` | `packages/shared/src/protocol-v4/index.ts` | `packages/shared/dist/protocol-v4/index.js` |

- `node`：13 个导出（10 个运行时值 + 3 个接口），逐项见 [`interface.md`](interface.md)。
- `protocol-v4`：571 个导出（314 个运行时值 + 257 个纯类型），逐项见
  [`interface-appendix-protocol-v4.md`](interface-appendix-protocol-v4.md)（机器生成，不手改）。
- 两个入口都是 **re-export 桶**：内部文件怎么拆由替换 Agent 定，导出名/类型/运行时值必须一一对应。

## 三、调用方

[`callers.md`](callers.md)：全仓 **279 个源文件** import 这两条子路径，覆盖 8 个工作区
（`packages/ui` 最多，其次 `packages/services`、`apps/cli/packages/*`）。
替换时逐条核对导出仍然可用；UI 包的调用方按 M5 的截图与几何门槛另行验证。

## 四、计划书对本包的额外要求（已落实）

> **协议与 wire-codec**：先核实 VS Code 派生部分并登记，再重写 ZCode 的改动；字段与帧格式一字不改。

1. **录制帧对比**：`fixtures/frames/encode-cases.json`（7 组：单帧、整包络边界、两种分片、
   三种错误）与 `fixtures/frames/measure-cases.json`（3 组三层计量）全部由旧实现录制；
   `tests/wire-frames.test.mjs` 在同一输入上重放并断言逐帧等价。
2. **存储往返**：`fixtures/old-write/subagent-state.*` 记录旧实现写出→迁移→再迁移的字节，
   `tests/node-persistence.test.mjs` 做「旧写 → 新读 → 新写 → 旧读」四步断言；插件缓存布局、
   锁 owner 元数据同样按旧写格式录制。
3. **纯声明文件**：`interface.md` / 附录列出的纯类型在替换后必须仍可用（B43 断言导出集合）；
   相似度比较时按这两个清单剔除兼容名。

## 五、合同文件

| 文件                                | 内容                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                         | 本文件：范围、条目 → 测试对照表、旧门结论                                                                                               |
| `behavior.md`                       | B1–B44：输入/输出/错误语义/时序与并发/幂等/资源释放/平台差异/状态所有者/日志级别                                                        |
| `interface.md`                      | 入口与 `node` 的 13 个导出（相似度声明模式的剔除依据）                                                                                  |
| `interface-appendix-protocol-v4.md` | `protocol-v4` 571 项导出清单（机器生成）                                                                                                |
| `callers.md`                        | `dep:refs` 全量调用方                                                                                                                   |
| `tests/`                            | 6 个黑盒契约测试文件（`entry.mjs` 支持源码/dist 两入口）                                                                                |
| `fixtures/`                         | 旧实现录制的帧、计量与旧写样例                                                                                                          |
| `stubs/`                            | 27 个继承模块的最小桩（import 即抛）+ `build-stubs.mjs` + `targets.txt`；**v2 已删除**（裁决 C，桩替换 0/6 的证据留存 `gate-old.json`） |
| `known-differences.md`              | 不在范围的文件、必须逐字保留的部分、旧行为特征                                                                                          |
| `acceptance.md`                     | 验收记录：范围、旧门两入口、桩替换、门禁、未覆盖项                                                                                      |
| `gate-old.json`                     | 旧门报告（`scripts/contract-gate.mjs` 生成）                                                                                            |

## 六、条目 → 测试对照表

| 条目                       | 测试（`tests/` 下，只走公开入口）                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 文件锁获取/释放         | `node-persistence.test.mjs`「B1 文件锁：获取、所有权校验与释放」                                                                                                                                                    |
| B2 锁超时错误形态          | 「B2 文件锁：互斥等待与超时错误形态」                                                                                                                                                                               |
| B3 遗弃锁回收              | 「B3 文件锁：无主遗弃锁回收（grace=0）」「B3 文件锁：持有进程已退出的遗弃锁可回收」                                                                                                                                 |
| B4 元数据承认规则          | 「B4 文件锁：损坏元数据按无主处理、时间戳不被超前值承认」                                                                                                                                                           |
| B5 withFileLock 串行化     | 「B5 withFileLock：同路径进程内严格串行（事件序列）」「B5 withFileLock：operation 抛错原样透传且锁释放」                                                                                                            |
| B6 原子写                  | 「B6 atomicWritePrivateTextFile：原子写、换行原样、无临时残留」                                                                                                                                                     |
| B7 损坏文件备份            | 「B7 backupCorruptFile：备份命名、内容一致、幂等」                                                                                                                                                                  |
| B8 子代理状态迁移          | 「B8 migrateSubagentStateFile：旧写→新读→新写→旧读 往返与幂等」「B8 migrateSubagentStateFile：坏 JSON 与缺文件安静返回」                                                                                            |
| B9 子代理 Markdown 迁移    | 「B9 migrateUserSubagentMarkdown：递归扫描、结果汇总、幂等」「B9 migrateUserSubagentMarkdown：frontmatter 模型行被迁移改写」                                                                                        |
| B10 官方插件缓存扫描       | 「B10/B11 scanOfficialPluginCacheRoots：旧写布局→新读扫描（排序与临时条目跳过）」「B10 scanOfficialPluginCacheRoots：缺失根返回空数组」                                                                             |
| B11 临时条目跳过规则       | 「B10/B11 scanOfficialPluginCacheRoots：旧写布局→新读扫描（排序与临时条目跳过）」（夹具 `expected` 不含 `.backup`/`.seed-lock`/`.tmp-`）                                                                            |
| B12 自采样器差分换算       | 「B12 createNodeSelfResourceSampler：差分换算、舍入与降级」「…：逻辑核数钳制到 [1, 4096]」「…：读数抛错时返回 null 并可恢复」                                                                                       |
| B13 单帧编码               | `wire-frames.test.mjs`「B13/B14 录制帧重放：编码输出与旧实现逐帧等价」「B13/B16 utf8JsonByteLength：utf-8 字节数（跨平台）」                                                                                        |
| B14 分片编码               | 「B14 分片：dataBase64 重组等于逻辑字节、索引连续、checksum 一致」＋录制帧重放                                                                                                                                      |
| B15 编码错误族             | 「B15 编码错误族：reasonCode 稳定且不返回部分结果」「B15 片数超界抛 frameFragmentCountExceeded」「B15 限额边界：NaN / 非正数 / 非整数 / 缺席的判定」                                                                |
| B16 三层承载计量           | 「B16 三层承载计量：与录制值逐字节一致」＋「B13/B16 utf8JsonByteLength」                                                                                                                                            |
| B17 wire 帧 schema         | 「B17 wire 帧 schema：合法帧通过」「B17 wire 帧 schema：严格校验与 superRefine 规则」                                                                                                                               |
| B18 wire 候选 schema       | 「B18 wire 候选 schema：服务边界只校验外层、保留未知键」                                                                                                                                                            |
| B19 wire 词汇表常量        | 「B19 wire 词汇表常量：checksum / deliveryKind / 协议版本」                                                                                                                                                         |
| B20 提交模式枚举           | `protocol-schemas.test.mjs`「B20 提交模式枚举：build\|edit\|plan\|yolo，auto 不被接受」                                                                                                                             |
| B21 共享上下文引用         | 「B21 共享上下文引用：strict + trim 后非空」                                                                                                                                                                        |
| B22 附件引用               | 「B22 附件引用：previewRef 可缺席、bytes 任意数值、未知键拒绝」                                                                                                                                                     |
| B23 稳定 fork 目标         | 「B23 稳定 fork 目标：boundary 必须是 orderedMessageIds 的最后一项」                                                                                                                                                |
| B24 输入意图               | 「B24 输入意图：必填面、缺省补 [] 与三态 delivery/order/steer/dispatch 枚举」                                                                                                                                       |
| B25 会话配置状态           | 「B25 会话配置状态：thoughtLevels/mode 默认值（旧快照兼容）与 modelTransition 形态」                                                                                                                                |
| B26 共享上下文导入状态     | 「B26 共享上下文导入状态：v2 的 canonical /cn/share/<code> URL 与 legacy 形态」                                                                                                                                     |
| B27 CUA 权限               | 「B27 CUA 权限状态：strict 形态与需求推导判定表」                                                                                                                                                                   |
| B28 会话增量               | 「B28 会话增量：五个 op 的封闭集合与各自必备字段」                                                                                                                                                                  |
| B29 状态补丁               | 「B29 状态补丁：键集合封闭（18 键）、未知键被剥离、解析结果按键原样带入」                                                                                                                                           |
| B30 交付档案过滤           | 「B30 交付档案过滤：等长拷贝、按 streamPaths 过滤 row.delta、顺序与入参不变」                                                                                                                                       |
| B31 限额常量表             | `workflow-runs.test.mjs`「B31 workflowRuns 限额常量表：数字即契约」                                                                                                                                                 |
| B32 run 状态 schema 退化   | 「B32 run 状态 schema：最小对象通过、可选键整组缺席、数组零条允许」                                                                                                                                                 |
| B33 run 状态 schema 边界   | 「B33 run 状态 schema：长度与枚举的边界拒绝都给出对应 path」                                                                                                                                                        |
| B34 设置调整命令           | 「B34 run 设置调整命令：三态载荷、结果形态与 8 项拒绝词表」                                                                                                                                                         |
| B35 run-started 归约       | 「B35 run-started 归约：残影剥除、用量归零、lineage 搬运与幂等」                                                                                                                                                    |
| B36 run-settled 归约       | 「B36 run-settled 归约：停止原因白名单、lineage 条件与未知状态兜底」                                                                                                                                                |
| B37 产物序列化             | 「B37 脚本产物序列化：string 原样、其余 pretty JSON、退化路径不抛错」                                                                                                                                               |
| B38 sessions-index topic   | `payload-schemas.test.mjs`「B38 sessions-index topic 键对偶：构造与解析互逆，空 id 不算」                                                                                                                           |
| B39 快照与增量             | 「B39 sessions-index 快照与增量：必备键、可选键与 protocolVersion」                                                                                                                                                 |
| B40 CreateWorkflow display | 「B40 CreateWorkflow 工具卡 display：strict 形态、诊断与因果图界限」                                                                                                                                                |
| B41 工作区 transcript      | 「B41 工作区 transcript 词汇表：限额常量、节点行 strict 与两条查询」                                                                                                                                                |
| B42 hook 审核              | 「B42 hook 审核：信任态词表、决策去重与请求载荷的三处计数一致性」                                                                                                                                                   |
| B43 公开入口导出面         | `surface.test.mjs`「B43 protocol-v4 入口导出面：与附录 571 项逐名一致（运行时值 314 个）」「B43 node 入口导出面：interface.md 13 项中 10 个运行时值」＋`node-persistence.test.mjs`「B43 node 入口导出面与行为可达」 |
| B44 模块路径兼容面         | `surface.test.mjs`「B44 模块路径兼容面：两个桶与 27 个继承模块在源码侧存在，dist 入口时产物也在」                                                                                                                   |

B1–B44 全部有条目、全部有测试（无空行）；未被行为条目覆盖的纯类型导出见 `acceptance.md`「未覆盖项」。

## 七、旧门（旧实现上的结论，v2 复跑 2026-10-15）

```powershell
# v1 用法（含桩替换那段；stubs/ 已在 v2 删除，命令仅作历史记录）
node scripts/contract-gate.mjs --contract specs/contracts/shared-01 --tests "*.test.mjs" `
  --dist-env KNORVIA_SHARED_01_ENTRY=dist `
  --stub-root specs/contracts/shared-01/stubs --stub-targets specs/contracts/shared-01/stubs/targets.txt
```

- 源码入口：tests=56 **pass=56** fail=0
- dist 入口（前置：`tsc -b packages/shared` 生成 `packages/shared/dist`）：tests=56 **pass=56** fail=0
- 桩替换（27 个目标文件）：tests=6 **pass=0** fail=6 → `allFail=true`：契约测试确实测到公开行为。
  **v2 起为历史项**：`stubs/` 已按裁决 C 删除，该段不再可复跑，记录保留在 `gate-old.json`
  的 `stubReplacement`（`status: historical`）。
- 预登记差异：**无**；跳过：0；详细输出见 [`gate-old.json`](gate-old.json)
- v2 复跑基线：Node **v24.14.0**、`commit` = `5a129165`（合同 v1 合入 main 的那个提交），
  旧实现取 `.scratch-exec4/old` 的 27 个文件（与 `origin/main` 同内容），复跑后工作树已换回
  新实现并 `tsc -b packages/shared --force` 重建 dist。

## 八、运行契约测试（两个入口）

```powershell
# Node 24.14.0（mise.toml 固定版本），仓库根目录
$env:TSX_TSCONFIG_PATH = "<repo>/packages/ui/tsconfig.json"

# 源码入口（pnpm test:studio 用的就是这一档）
node --import tsx --test "specs/contracts/shared-01/tests/*.test.mjs"

# dist 入口（先 tsc -b packages/shared 生成 packages/shared/dist）
$env:KNORVIA_SHARED_01_ENTRY = "dist"
node --import tsx --test "specs/contracts/shared-01/tests/*.test.mjs"
```

## 九、计分口径（替换阶段）

- 实现文件（`wire-codec.ts`、`atomicFileLock.ts`、各 reducer…）：相似度工具**普通模式**
  （行 + 结构两道门槛）。
- 纯声明与桶文件：`--declaration --interface specs/contracts/shared-01/interface.md`
  （`protocol-v4` 的导出按 `interface-appendix-protocol-v4.md` 剔除兼容名）。
- `unreviewed` 的 30 个文件不在范围内，替换阶段不动。
