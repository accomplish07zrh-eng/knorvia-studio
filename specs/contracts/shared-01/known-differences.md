# shared-01 与旧实现的已知差异（合同阶段）

合同阶段**不改任何产品源码**，只新增合同产物。本文件记录「新旧实现之间被允许的差异」、
「必须逐字保留的部分」以及本包观察到的旧行为特征，供替换阶段自查与审查复核。

## 1. 预登记差异：无

本合同全部 56 个用例都在旧实现上通过（源码入口与 dist 入口各 56/56，见 `gate-old.json`），
**没有**任何断言放宽或跳过，因此没有需要预登记的「旧实现缺陷 / 有意改进」条目。
若替换阶段发现某条断言确实要改，必须先回到 `behavior.md` 升版本并重跑旧门，不得就地放宽。

## 2. 不在本包的文件（不要在替换时顺手改）

| 位置                                                          | 归属                                    | 说明                                                                                                    |
| ------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/node/knorviaPaths.ts`                    | M0-2/M0-3 复核（`unreviewed`）          | 不重写、不删；`resolveKnorviaDataRoot` 的行为经 `node.ts` 桶被 B43 断言                                 |
| `packages/shared/src/protocol-v4/` 下 29 个 `unreviewed` 文件 | 同上                                    | 含 `index.ts` 桶、`rows.ts`、`snapshot.ts`、`transport.ts` 等；本包不冻结其实现，只冻结两个入口的导出面 |
| `packages/shared/src/protocol/`（旧协议面）                   | 其它包                                  | AGENTS.md：协议改动同步更新 `packages/shared/src/protocol/index.ts`                                     |
| `packages/rpc/src`                                            | `packages-02`（VS Code 派生核实与重写） | 与本包同为 VS Code 派生来源，分包处理                                                                   |
| `packages/shared/src` 其余目录                                | `shared-02/03/04`                       | 见计划书分包总表                                                                                        |

`scope-files.json` 里本包只认 `classification != unreviewed` 的 **27 个继承文件**（6 node + 21 protocol-v4）。

## 3. 替换阶段允许改变的部分

- 模块内部组织：文件拆分、命名、常量表组织、私有辅助函数、算法实现（wire-codec 的分片探测
  **顺序与输出边界除外**，见下）。
- 注释与日志文案：本包不写日志（`behavior.md` 通用约定），注释可整段重写。
- 内部错误对象的构造方式（`reasonCode` 与 `message` 取值不可变）。

## 4. 必须逐字保留的部分（金样与断言以此为准）

1. **wire 帧格式**：complete/fragment 帧的字段集合、键序与取值口径；分片边界必须与
   `fixtures/frames/encode-cases.json` 的录制帧逐帧等价（B13/B14）。
2. **错误词表**：`TopicWireFrameEncodingError` 的 `name`、`reasonCode` 取值族与
   「`message` 即 `reasonCode`」（B15）；`KNORVIA_FILE_LOCK_TIMEOUT` 的 message/`code`/`path`/`syscall`（B2）。
3. **zod issue 文案与 path**：如 `boundaryMessageId must be the final orderedMessageId`（B23）、
   `fragmentIndex must be smaller than fragmentCount`（B17）、
   `hookCount must match the immutable request items`（B42）等，均按旧实现录制。
4. **限额数字**：`WORKFLOW_RUNS_LIMITS`（B31）与 `WORKFLOW_WORKSPACE_LIMITS`（B41）逐项取值。
5. **fault 前缀**：`fault.command.workflowRunSettingsRejected.`（B34）。
6. **枚举与字面量**：`V4_WIRE_PROTOCOL_VERSION = 3`、deliveryKind 三值、checksum 的 8 位小写 hex、
   `schemaVersion: 1`、`platform: "darwin"`、`settingsSection/settingsScope` 字面量等。
7. **持久化写回格式**：`migrateSubagentStateFile` 的 2 空格缩进 JSON 与二次迁移逐字节不变（B8）；
   POSIX `0600` 权限位、锁目录/owner 文件命名（B1、B6、B7）。

## 5. 观察到的旧行为特征（看起来奇怪，但按默认裁决「保持原样」）

| 行为                                                                         | 旧实现事实（断言为准）                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `statePatchSchema` 的注释写「键集合封闭」，但对象**非 strict**（B29）        | 未知键不报错、被剥离；`revision` 是任意数值（不做非负/整数校验） |
| `sessionConfigStateSchema` / `sessionSummarySchema` 同样非 strict（B25/B39） | 未知键被剥离而不是报错                                           |
| `run-settled` 载荷的 `stopReason` 白名单外值（B36）                          | 按载荷缺席处理且**不覆盖已知值**：run 上已有的 stopReason 保留   |
| `maxAssemblyBytes: null`（B13/B15）                                          | 按缺席处理（`??` 语义），退回默认限额，不报错                    |
| `serializeWorkflowArtifact` 对循环引用（B37）                                | 退 `String(value)`，不抛错                                       |

以上均按任务书「旧行为看起来奇怪 → 保持原样」处理，**不作为缺陷登记**。

## 6. 与计划书红线的对照

- 不改用户数据格式、协议字段、`KNORVIA_` 环境变量与 `.knorvia-studio` 数据目录。
- 金样全部由旧实现录制（`record-shared01-fixtures.mjs` 只读旧实现并落盘），不改录制口径。
- 夹具只含合成数据（`subagent-state.*`、`plugin-cache-layout.json` 等均自造），无凭据、
  无真实用户数据、无内部地址。

## 7. v2 修订：删桩（Lead 裁决 C，2026-10-14，issue #148 评论）

- **原因**：替换验收的强制终态要求「旧文件与桩全部删除、`not implemented: shared-01` 全仓为零」
  （计划书「每包流程」五.1 与「替换验收」清单，`lead/verify-replace.mjs` 第 1、3 项同样要求
  `specs/contracts/shared-01/stubs/` 目录不存在；已合并的替换 PR 先例一致）。而 v1 的桩目录与
  「桩替换后契约测试必须全失败」这条验证互锁——留桩则验收不过，删桩则验证不可复跑。Lead 裁决选
  **C**：删桩，桩的证据转为 `gate-old.json` 里的留证。
- **本包与 core-tool-01 的差别（如实登记）**：core-tool-01 的 B88 把 `stubs/<32 路径>` 当 oracle
  读取，所以 C 通道在那一包有「换 oracle 到 `interface.md` 导出声明块」这个动作；**shared-01 没有
  这类断言**——`tests/` 下 6 个 `.test.mjs` 中检索 `stubs`、`targets` 均为 0 命中，
  `surface.test.mjs` 的 B43 从 v1 起就是以 `interface.md` 与 `interface-appendix-protocol-v4.md`
  为 oracle，B44 只读 `scope-files.json` 判 27 个继承模块路径存在。因此本包 C 通道**没有 oracle
  可换**，落在合同上的实质动作是：删桩、合同升 v2、旧门复跑、桩替换记录转 historical。
  删桩后契约测试在**源码与 dist 两个入口各 56/56 全过**（`acceptance.md` v2 复跑记录），
  证明没有任何断言依赖桩。
- **变更内容**：删除 `specs/contracts/shared-01/stubs/` 全部 29 个文件（27 个模块桩 +
  `build-stubs.mjs` + `targets.txt`）；`README.md`、`acceptance.md` 升 **v2**；`gate-old.json`
  追加 `contractVersion`/`oldGateReRun` 并把 `stubReplacement` 标记为 historical。
- **强度对照**：**断言方向与强度逐字不变**——56 个用例的断言一条没改、没删、没跳过，
  `interface.md` / 附录内容不变；被拿掉的只是「桩 = 接口派生快照」这半边合同阶段脚手架，
  其证据留存 `gate-old.json` 的 `stubReplacement`（旧实现上桩替换 27 个目标后 0/6 通过、
  失败原因全是 `not implemented: shared-01`）。v2 旧门已在旧实现（`.scratch-exec4/old` 的 27 个
  文件，与 `origin/main` 一致）上复跑：源码 56/56、dist 56/56、桩替换 0/6 `allFail=true`、
  预登记差异 0 条。
- **结论：没有放宽任何测试。** 依据：计划书「合同写错就改测试」通道 + 默认裁决表
  「前后不一致选更保守：不放宽测试」。
- **对应测试**：`surface.test.mjs`「B43 protocol-v4 入口导出面」「B43 node 入口导出面」
  （oracle 自 v1 起即为合同接口文件）与「B44 模块路径兼容面」。
