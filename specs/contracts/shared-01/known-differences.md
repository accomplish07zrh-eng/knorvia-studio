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
