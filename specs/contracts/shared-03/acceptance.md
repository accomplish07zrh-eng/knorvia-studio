# shared-03 合同验收（v1）

对应计划书「合同八件套」验收清单。旧门产物：[`gate-old.json`](gate-old.json)。

## 1. 范围

`packages/shared/src` 继承剩余的 **34 个文件**（六簇，见 [`README.md`](README.md) §一.3）；
`index.ts` 根桶归 shared-04 末包；`unreviewed` 51 件不入口径。

## 2. 八件套完成度

| 件       | 位置                                                                                                                    | 状态     |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| 行为规格 | [`behavior.md`](behavior.md)（B1–B43，九项 + 语义常量对照 + 金样口径）                                                  | ✅       |
| 接口面   | [`interface.md`](interface.md) + [`interface-appendix.json`](interface-appendix.json)（机器生成：195 运行时/90 纯类型） | ✅       |
| 调用方   | [`callers.md`](callers.md)（73 import / 68 真实调用，入口四类）                                                         | ✅       |
| 黑盒测试 | [`tests/`](tests/)（8 文件 47 断言，源码 + dist 两入口）                                                                | ✅       |
| 金样     | [`fixtures/`](fixtures/)（①codec 往返含转义 ②workspace-hook 摘要稳定 ③task-realtime gate 握手 ④分享 schema 往返）       | ✅       |
| 已知差异 | [`known-differences.md`](known-differences.md)（红线清单 + 平台边界）                                                   | ✅       |
| 合同桩   | 替换落地后已删除 `stubs/`                                                                                               | ✅       |
| 旧门     | [`gate-old.json`](gate-old.json)                                                                                        | ✅ 见 §3 |

## 3. 旧门输出（gate-old.json 实测）

| 入口                                        | tests        | pass  | fail | skipped | exit |
| ------------------------------------------- | ------------ | ----- | ---- | ------- | ---- |
| 源码入口                                    | 47           | 47    | 0    | 0       | 0    |
| dist 入口（`KNORVIA_SHARED_03_ENTRY=dist`） | 47           | 47    | 0    | 0       | 0    |
| 桩替换 34 目标后重跑                        | 8 个测试文件 | **0** | 8    | —       | 1    |

`allFail=true`：桩替换后契约测试 8 文件全部失败（file 级），说明测试确实测到公开行为。
金样口径：`fixtures/*.json` 由旧实现录制（`.scratch-exec4/s03-record-fixtures.mjs`，不入库），
两入口断言全部对金样逐字段/逐字节比较。

## 4. 首败与修正（代表性）

- contract-gate 误用 `--env` 全局注入 dist 变量 → 桩替换跑实为 dist 真件、allFail=false；
  改 `--dist-env`（仅 dist 入口注入）后 allFail=true（脚本自身口径问题，非实现问题）。
- 夹具形状三修（录制脚本以旧实现 schema 为准）：mirror op 判别面内联 seq、
  conversation row 基础面（rowId/turnId/createdAt/createdAtSeq）、capabilities wire 字段名
  （allowed_artifacts/access_modes）；descriptor 需 artifact_id/logical_artifact_key/
  producer_product_turn_id/artifact_version 四字段。
- 断言修正七处（真实行为为准并回写 behavior.md）：messageParts 保序不去重、
  `KNORVIA_KNOWN_TOOL_NAMES` 31 项（非 32）、B28 空 query「文件优先、目录在后」（非目录优先）、
  B29 回绕取 0 起首命中、B36 kind 回退即标题值、B39 unknown/forbidden 两清单可重叠、
  遥测白名单键为 snake_case（`tool_name`）。

## 5. 说明

- 测试断言与金样零改动原则同样适用于本合同：fixtures 一旦落库只读；
- 登记与 CI/合并记录见 PR「contract: shared-03 v1」与 issue #177。
