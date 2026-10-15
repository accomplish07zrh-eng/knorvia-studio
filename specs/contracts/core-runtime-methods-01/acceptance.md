# core-runtime-methods-01 验收（v1）

## 范围

21 个继承文件（`scope-files.json`：`upstream-modified` 12 / `unreviewed` 6 /
`upstream-unchanged` 3），主题「模型调用与流式事件」，2,945 行；49 个导出（48 运行时值 + 1 纯类型）。
不在范围见 [`README.md`](README.md)。

## 旧门结果

实测 [`gate-old.json`](gate-old.json)（commit `9e6a14b6`，Node v24.14.0，`scripts/contract-gate.mjs`）：

| 跑                                                        | 结果                                                      |
| --------------------------------------------------------- | --------------------------------------------------------- |
| 源码入口                                                  | 33 用例 / 33 通过 / 0 失败（4 个测试文件），exit 0        |
| dist 入口（`KNORVIA_CORE_RUNTIME_METHODS_01_ENTRY=dist`） | 33 用例 / 33 通过 / 0 失败，exit 0                        |
| 桩替换（21 个目标换成 import 即抛桩）                     | 5 个加载单元 / 0 通过 / 全失败（`allFail: true`），exit 1 |

`gate-old.json` 的 `pass: true`。此后新增两个金样回放用例（B1/B28 各一），全量 **35 用例双入口
全绿**（门禁输出见 PR 描述）。

## 首败与起草修正

- **B22 `recoveredFromStreamFailure` 观察面**（Lead 裁定）：该 flag 由 `recoverFromModelFailure`
  传入补执行的 `result.providerMetadata`，消费方在 methods-02 的 turn-model-step-\*，本切片无
  黑盒观察面。断言面收窄为补执行可见面（step-finish `reason: "tool-calls"`、
  `committedToolCallIds` 与声明表等长同序、恢复事件交错序），README 对照表 B22 行同步回改；
  **直接观察面留给 methods-02 合同补**（对应测试 `streaming.test.ts ·「B22 模型失败恢复编排」`）。
  不伪造观察面、断言强度不空转。
- **B26 起草修正**（Lead 裁定）：起草文本「checkpoint/rewind 分派错误两者冒泡」与实现（=旧实现）
  真值不一致——`CheckpointCreated` 落账本失败**吞错转 warn**（`checkpoint.persist.failed`），
  `RewindTriggered` 落账本失败**冒泡**。v1 未发版，按真值修正 behavior.md B26 文本（属合同写错
  修正，非放宽断言），记录见 known-differences。rewind 成功落账的载荷形状未探明（zod 必填项），
  该分支按部分覆盖记（冒泡语义已断言）。
- **B1 媒体三段投影观察面**（与 B22 同口径）：媒体附件路径物化 / 输入格式能力投影 / 媒体预算
  投影的中间形态不经公开入口暴露（投影输出即请求的 `messages`）。已断言「投影未改动消息时
  保持原对象引用」与请求组装面；三段投影的逐段形态无黑盒观察面，如实记未覆盖（相关行为已由
  `core-runtime-helpers-01` 的 media 系列合同覆盖）。

## 逐文件计分模式预标注（替换阶段用）

21 个文件均为实现型模块（函数体为主，签名行占比 < 20%）——**全部预标注普通模式**
（包含率 < 0.20、最长相同段 < 8、结构 < 0.40）；替换实测中若某文件被判定「导出声明占主体」，
再按 GATE-PLAYBOOK 改 `--declaration --interface` 并记录变更。`usage-observability-projection.ts`
（1 纯类型 + 5 纯函数）为唯一潜在声明型候选，届时按残差口径实测定夺。

## 覆盖项

- 49 个导出逐个被 [`behavior.md`](behavior.md) B1–B31 条目覆盖（见 README 对照表）。
- 事件序列断言五组：流事件消费序（B2）、进入顺序（B7/B16/B20）、完成顺序交错（B19/B22）、
  持久化记录序（B13/B22/B23）、日志序列（B6/B23/B25）——gate 握手断言，无 sleep。
- 金样往返：模型请求/响应投影、流事件 → 用量/账本投影（`fixtures/`，脱敏虚构数据）。
- 语义常量显式入条目：重试预算（B3/B14）、token 限额两级（B4）、token 记账口径（B28/B31）、
  attempt/anchor id 与 `reason` 串（B16）、事件字段序（B16/B21）、usage 观测字段（B28–B30）、
  model-status sink 语义（B6）、sessionType/querySource 元数据（B3/B28）、错误码与超时
  （B15/B17）。

## 未覆盖项（如实登记）

- `methods/index.ts` 桶（不入包）与同目录其余 113 文件（后续分包）。
- 模型适配器网络层、事件存储实现本体（经注入端口测试，端口内实现不在合同面）。
- 计时相关常量（250ms drain 上限、退避延迟值）只断言取值与语义，不做计时行为断言。
