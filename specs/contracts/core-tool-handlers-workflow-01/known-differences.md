# core-tool-handlers-workflow-01 已知差异（known-differences.md）

只登记在旧实现上**实测**、且重写时必须保持或明确处理的既存事实。每条写理由与对应测试；不为通过而放宽断言。

## K-fl-1 元数据块的未知字段不是保留，而是整块判错

- 事实：`/* knorvia-workflow` 块的 YAML 元数据走 `.strict()` 元数据 schema——多写一个未知键，解析结果是 `invalid_metadata` 整个拒绝（`readWorkflowScriptFile` 回点名文件的失败），**不是**「未知字段保留/忽略」。
- 理由：保存的文件用户会手改，错字必须可见；「静默丢弃一个字段」会让用户以为它生效了。
- 影响：旧写 → 新读 往返里，未知字段没有「保留策略」一说——带未知字段的文件根本读不进。
- 处理：重写不得顺手把 strict 改成 passthrough/保留；判定语义见 B-fl-5（`invalid_metadata`）。
- 对应测试：`tests/workflow-file-io.test.ts` B-fl-5。

## K-au-1 `answers: {}` 空对象算「已答」，只有字段缺席才挡门

- 事实：`AskUserQuestionAnsweredInputSchema` 的门只拦 `answers === undefined`；`answers: {}`（零回答）与部分回答都能通过 handler 并回投影（`answers` 原样带回）。空白字符串答案才被逐条拒绝。
- 理由：用户可以完整、部分或零回答可选澄清；门要挡的是「permission 阶段还没做完」，不是「用户没选任何项」。工具文案「requires user answers」指的是答案**通道**到位。
- 影响：重写若把门改成「至少一条答案」，用户跳过问题会卡死。
- 处理：保持「字段缺席 = 未握手、空对象 = 已握手」两态语义（B-au-1/4）。
- 对应测试：`tests/ask-user-question.test.ts` B-au-1、B-au-4。

## K-an-1 交接边的自环照画

- 事实：显示图的交接边端点过滤只查「卡片是否存活」，`from === to` 的自环边不拦（实测 `card-1 → card-1` 原样进投影）；阶段边折叠那边才丢自环（B-an-10）。
- 理由：两层的删边规则分属「引用完整性」与「图归约」两件事；现状即如此。
- 影响：重写若顺手在 bounds 层拦自环，显示图会与旧版少一条边。
- 处理：保持现状；如要修属独立行为决策，须走合同变更。
- 对应测试：`tests/workflow-graph.test.ts` B-an-5。

## K-fl-2 块判定允许块前空行，按「首个非空行」认标记

- 事实：文件开头的空行不参与判定——首个非空行是 `/* knorvia-workflow`（或旧 `/* zcode-workflow`）就按块解析，`bodyLineOffset` 把空行一起计入（实测：两行空行 + 5 行块 → 偏移 5，空行行号落在正文坐标之外）。
- 理由：解析器与判定谓词必须同一判据（两处答案不同会出现「工具说没块、解析器说块坏了」死角）。
- 影响：重写若改成「第一行必须是标记」，带前导空行的保存定义会整段被当脚本喂给编译器。
- 处理：保持首个非空行判据与偏移口径（B-fl-4）。
- 对应测试：`tests/workflow-file-io.test.ts` B-fl-4。

## 状态

K-fl-1..2、K-au-1、K-an-1 各有对应样例断言；本包在旧实现源码与 dist 两入口各 94/94 通过（`gate-old.json`），22 桩替换后 0/94。无其它预登记差异。
