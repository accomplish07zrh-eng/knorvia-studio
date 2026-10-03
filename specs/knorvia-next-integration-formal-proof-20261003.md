# Formal-proof 状态枚举与页面运行时替换候选

2026-10-03，整合 checkpoint `24934687428aa5ed7f80ae5fe530670e33cb24f0`。本包已由父任务独占分配整合者。读取原 model.ts/main.ts、README、package/Vite/TS 配置与 DESIGN.md 后实现；作者有源码暴露，不能宣称隔离作者、clean room、表达独立性/贡献权利已接受或全量 MIT。

## 产品与持久数据合同

这是独立的对话产品状态枚举器和 D3 页面，保留 compact/fork/goal/queue/query edit 的全部场景及尚未定义的分支。公开 `./model`、types、profiles/userCandidates、contextLabel/contextKey、enumerateCandidates、evaluate、resetIds、buildTraceTree、flatten、collectStats、decisionLabel 不变。CLI/bootstrap 对规则的公开引用不修改。既有产品词、规则 id/标题/原因/断言、profiles、候选顺序、HTML 文案与 DOM/CSS 标识作为必须保留的原来源，不计为原创表达。

- running 的 text/goal/compact 入队，fork/edit 拒绝；compacting 继续 compact 拒绝、未来输入入队、fork 拒绝，edit 未定义；goalVerifying 接受未来输入/维护意图入队、fork 拒绝，edit 未定义。
- completed 的 fork 更新 selectedTurn/forked；held compact 入队先于 justCompacted-noop；held text/goal 进入 choice，保持 next===context；其余发送/goal/compact 和 idle 规则、未知 user fallback/未知 system 的既有 goalVerifyFail fallback 保持。
- queue 的同类/empty/mixed 合并、assistantComplete 的 text/goal/compact/mixed drain 和 never→compactable、所有 system applicability/transition 保持。外部直接 evaluate 不额外加 applicability guard。
- tree 用显式 work stack 和不可变 visit trail替换递归展开。必须保持深度优先 allocate 顺序、全局 resetIds 行为、n-id/CASE-五位序号、round 上限前创建的 state 占号、branch-local seen、candidate→guard→effect→next/case 与 choice 不展开。E2E 文本使用原 effect context，choice 仍采用原未定义描述，不能借替换修订产品规则。
- flatten/stats 是同一 semantic tree 的派生结果，stats 按所有携 decision 的节点计数。budget 只克隆渲染投影，完整节点仍参与规则、统计和导出；按 DFS 消耗预算、hidden subtree 聚合与 summary 文案/id 保持。
- 图按原 context/round/action/rule/next-context 身份合并，同一 datum 的 members 按首次 DFS 顺序；边按 first source→target 去重，保留 node.decision ?? parent.decision。column/宽高/间距、排序 zh-CN、缩放范围/动画/默认与 fit transform、Bezier/字数截断与 CSS classes 都保持。case 深度对应的原 column 计算不修订。
- `knorvia.conversation-state-space.review.v1`、所有五种 review 值和 CASE 编号不迁移、不清空。读失败仍 fallback {}、写失败仍原样传播；先更新内存再写存储。导出文件名、字段、顺序、pretty JSON、unreviewed fallback 与代表路径不变。
- 参数 change 清除 selection 并重建 semantic tree；rule/decision change 只改变高亮并重新呈现，不能剪掉统计/导出内容。详情关闭、选择、review、拖动/缩放、fit/reset、导出全部继续通过原控件和布局工作。

## 单一所有者与实现结构

model declarations/catalog保留原内容；新 decision policy 用 action family × phase recipes 和 system event registry，只有 evaluate 创建当前 Decision。trace enumerator 的 allocator 持有唯一编号状态；工作栈/visit trail 属单次构建，不引入持久镜像。

页面只有一个 explorer state owner 持有 semantic tree、selection、filters 和原 review record；rows、budget tree、DAG、path index 都是一次 render 的派生投影。graph projector 做预算与 DAG 实际构造，canvas 只持有 D3 zoom/geometry，不持有业务树或 review。原 HTML shell/stylesheet保留视觉数值与来源，不通过移动或重排称为完成独立样式。

```text
context + candidate → phase/event recipe → Decision → work-stack trace tree
controls → explorer state → semantic tree → budget projection/DAG → D3 canvas
                                ├→ stats / rules / representative paths / JSON
case selection → same review record → same localStorage key
```

## 后续统一验收

本阶段不执行测试、lint、类型检查、格式/架构检查、构建、完整审计或真实浏览器/数据操作。最终需验收所有 phase × candidate/queue/compact/goal 组合、未知输入、public API、exact case ids/paths/统计、预算与 DAG 合并、全部控件/几何/文字、旧 localStorage review 恢复和 JSON 导出，以及 CLI/bootstrap 规则消费者。原固定视觉/声明/规则表达来源仍保留，候选提交不能代替行为或权利接受；根 LICENSE/NOTICE、reviews/current-files 不机械刷新。
