// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 合同桩：apps/cli/packages/dynamic-workflow/src/projections.ts
// 分类 `upstream-modified`。只列 interface.md 的**运行时**导出名（纯类型不进运行时，省略）；
// 末行的 throw 让任何经由这些模块的 import 立刻失败——桩用于「桩替换后契约测试必须全部失败」
// 的验证与替换阶段的起始状态，进入实现后随 stubs/ 一起退役。
// 机器生成：node --import tsx specs/contracts/dynamic-workflow-02/stubs/build-stubs.mjs（勿手改）

export { isActorSite } from "./analysis/core.js";
export { serializeCore } from "./analysis/core.js";
export { AnalysisCore } from "./analysis/core.js";
export { CoreActorSite } from "./analysis/core.js";
export { CoreAskSite } from "./analysis/core.js";
export { CoreFacts } from "./analysis/core.js";
export { CoreFanoutSite } from "./analysis/core.js";
export { CoreSimpleSite } from "./analysis/core.js";
export { CoreSites } from "./analysis/core.js";
export { CoreTypes } from "./analysis/core.js";
export { decodeAnalysisCore } from "./analysis/core-json.js";
export { encodeAnalysisCore } from "./analysis/core-json.js";
export { AnalysisCoreJson } from "./analysis/core-json.js";
export { MapEntries } from "./analysis/core-json.js";
export { isStructuralRegionKind } from "./analysis/constants.js";
export { UNPHASED_ID } from "./analysis/constants.js";
export { JumpKind } from "./analysis/constants.js";
export { RegionKind } from "./analysis/constants.js";
export { StructuralRegionKind } from "./analysis/constants.js";
export { TraceRegionKind } from "./analysis/constants.js";
export { projectSiteGraph } from "./analysis/graph.js";
export { toActorGraph } from "./analysis/actor-graph.js";
export { ActorEdge } from "./analysis/actor-graph.js";
export { ActorGraph } from "./analysis/actor-graph.js";
export { ActorNode } from "./analysis/actor-graph.js";
export { projectCausalityGraph } from "./analysis/causality-graph.js";
export { SINK_ID } from "./analysis/causality-graph.js";
export { UNKNOWN_LANE } from "./analysis/causality-graph.js";
export { WORKSPACE_LANE } from "./analysis/causality-graph.js";
export { CausalityGraph } from "./analysis/causality-graph.js";
export { Certainty } from "./analysis/causality-graph.js";
export { Lane } from "./analysis/causality-graph.js";
export { NamePattern } from "./analysis/causality-graph.js";
export { OrderEdge } from "./analysis/causality-graph.js";
export { OrderKind } from "./analysis/causality-graph.js";
export { Phase } from "./analysis/causality-graph.js";
export { Region } from "./analysis/causality-graph.js";
export { Step } from "./analysis/causality-graph.js";
export { StepKind } from "./analysis/causality-graph.js";
export { reduceOrdering } from "./analysis/causality-reduce.js";
export { ReducibleEdge } from "./analysis/causality-reduce.js";
export { FLOW_ABORT } from "./analysis/flow-graph.js";
export { FLOW_ENTRY } from "./analysis/flow-graph.js";
export { FLOW_SINK } from "./analysis/flow-graph.js";
export { projectControlFlow } from "./analysis/flow-graph.js";
export { ControlFlowGraph } from "./analysis/flow-graph.js";
export { FlowEdge } from "./analysis/flow-graph.js";
export { FlowEdgeKind } from "./analysis/flow-graph.js";
export { FlowNode } from "./analysis/flow-graph.js";
export { FlowNodeKind } from "./analysis/flow-graph.js";
export { FlowPhase } from "./analysis/flow-graph.js";
export { FlowVia } from "./analysis/flow-graph.js";
export { FANOUT_EXPAND_CAP } from "./analysis/handoff-graph.js";
export { projectHandoffGraph } from "./analysis/handoff-graph.js";
export { UNPHASED } from "./analysis/handoff-graph.js";
export { Handoff } from "./analysis/handoff-graph.js";
export { HandoffGraph } from "./analysis/handoff-graph.js";
export { HandoffParticipant } from "./analysis/handoff-graph.js";
export { actorGraphToMermaid } from "./analysis/mermaid.js";
export { causalityGraphToMermaid } from "./analysis/mermaid.js";
export { controlFlowToMermaid } from "./analysis/mermaid.js";
export { handoffGraphToMermaid } from "./analysis/mermaid.js";
export { phaseFlowToMermaid } from "./analysis/mermaid.js";
export { phaseGraphToMermaid } from "./analysis/mermaid.js";
export { siteGraphToMermaid } from "./analysis/mermaid.js";
export { serializeActorGraph } from "./analysis/serialize.js";
export { serializeCausalityGraph } from "./analysis/serialize.js";
export { serializeControlFlow } from "./analysis/serialize.js";
export { serializeGraph } from "./analysis/serialize.js";
export { serializeHandoffGraph } from "./analysis/serialize.js";

throw new Error("not implemented: dynamic-workflow-02");
