// ============================================================
// CreateWorkflow display graph bounding - 工具输出边界的有界投影
// ============================================================
// 从 create-workflow.ts 拆出：阶段词汇表让
// handler 文件越过 max-lines 上限，而裁剪本身是一段自洽的纯逻辑——分析器全图进，契约
// 形状出，无 I/O、无 memo、无端口。与 protocol-v4/create-workflow-display.ts 从
// rows.ts 拆出同一先例。
//
// 这里装的是一张**显示图**而不再是因果图的镜像。第二层是子代理导向：step 层只剩站点表
// （运行状态与检视器的键，不再画、不再带边），参与者层（每阶段的子代理卡 + 交接边）由
// 分析器的交接图投影供给、这里只做上限与转发，阶段层仍是控制流图的阶段商、仍由本层归约
// （折叠与缩点归约在 create-workflow-graph-fold.ts）。边只有 `{from, to, back?}` 一种形状；
// region / certainty / 边种类留在分析器里，GUI 从不读它们。函数名与载荷字段名沿用历史。

import {
  CREATE_WORKFLOW_GRAPH_MAX_HANDOFF_TYPES,
  CREATE_WORKFLOW_GRAPH_MAX_HANDOFFS,
  CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS,
  CREATE_WORKFLOW_GRAPH_MAX_LANES,
  CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS,
  CREATE_WORKFLOW_GRAPH_MAX_PARTICIPANTS,
  CREATE_WORKFLOW_GRAPH_MAX_PHASE_EDGES,
  CREATE_WORKFLOW_GRAPH_MAX_PHASES,
  CREATE_WORKFLOW_GRAPH_MAX_STEPS,
  type CreateWorkflowCausalityGraph,
  type CreateWorkflowEdge,
  type CreateWorkflowHandoff,
  type CreateWorkflowLane,
  type CreateWorkflowNamePattern,
  type CreateWorkflowParticipant,
  type CreateWorkflowPhase,
  type CreateWorkflowStep,
} from "@knorvia/contracts";
import {
  FLOW_ABORT,
  FLOW_ENTRY,
  FLOW_SINK,
  type CausalityGraph,
  type ControlFlowGraph,
  type HandoffGraph,
  UNPHASED,
  // 浏览器端回放视图直接复用本函数：走 /projections
  // 子路径而非根桶，根桶会把 typescript 编译器一起拖进浏览器包。语义与根桶导出完全相同。
} from "@knorvia/dynamic-workflow/projections";
// 阶段边的折叠与归约（含有环输入上的缩点规则）单独成模块，见该文件的文件头。
import { foldPhaseEdges, type RawEdge } from "./create-workflow-graph-fold.js";

// display 不经过 tool result budget：图必须在进入工具输出（进而进入实时事件和持久化
// metadata）前独立限长。集合互相引用，所以裁剪顺序是固定的——先 step（源序，截尾保留
// 脚本开头），再收敛到它们引用的 lane，最后按存活的 step 过滤边与 sink。引用完整性优先
// 于保留数量：宁可少画，也不能让 UI 拿到指向不存在节点的 id。
export function boundCausalityGraph(
  graph: CausalityGraph,
  flow?: ControlFlowGraph,
  handoff?: HandoffGraph,
): CreateWorkflowCausalityGraph {
  const projected: {
    steps: CreateWorkflowStep[];
    lanes: CreateWorkflowLane[];
    participants: CreateWorkflowParticipant[];
    handoffs: CreateWorkflowHandoff[];
  } = { steps: [], lanes: [], participants: [], handoffs: [] };
  let truncated = graph.steps.length > CREATE_WORKFLOW_GRAPH_MAX_STEPS;
  const stepPrefix = graph.steps.slice(0, CREATE_WORKFLOW_GRAPH_MAX_STEPS);

  // Establish raw reference membership before projecting or clipping identifiers.
  const referencedLanes = new Set<string>();
  for (const step of stepPrefix) {
    referencedLanes.add(step.lane);
    for (const lane of step.lanes ?? []) referencedLanes.add(lane);
  }
  const admittedLanes = graph.lanes.filter((lane) => referencedLanes.has(lane.id));
  truncated = truncated || admittedLanes.length > CREATE_WORKFLOW_GRAPH_MAX_LANES;
  const retainedLanes = admittedLanes.slice(0, CREATE_WORKFLOW_GRAPH_MAX_LANES);
  const laneIds = new Set(retainedLanes.map((lane) => lane.id));
  const retainedSteps = stepPrefix.filter((step) => laneIds.has(step.lane));
  truncated = truncated || retainedSteps.length < stepPrefix.length;
  const stepIds = new Set(retainedSteps.map((step) => step.id));

  // Count all admitted cards; retain a prefix only after each complete projection.
  let admittedCards = 0;
  for (const card of handoff?.participants ?? []) {
    if (!laneIds.has(card.lane)) continue;
    const members = card.steps.filter((id) => stepIds.has(id));
    if (members.length === 0) continue;
    const row: CreateWorkflowParticipant = {
      id: boundGraphText(card.id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      phase: boundGraphText(card.phase, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      lane: boundGraphText(card.lane, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      steps: members
        .slice(0, CREATE_WORKFLOW_GRAPH_MAX_STEPS)
        .map((id) => boundGraphText(id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS)),
      ...(card.member === undefined ? {} : { member: { ...card.member } }),
      ...(card.many === true ? { many: true as const } : {}),
    };
    admittedCards++;
    if (admittedCards <= CREATE_WORKFLOW_GRAPH_MAX_PARTICIPANTS) projected.participants.push(row);
  }
  truncated = truncated || admittedCards < (handoff?.participants.length ?? 0);
  truncated = truncated || admittedCards > CREATE_WORKFLOW_GRAPH_MAX_PARTICIPANTS;
  const cardIds = new Set(projected.participants.map((card) => card.id));

  // Finish endpoint admission for the entire list before reading any edge payload.
  const admittedHandoffs = (handoff?.handoffs ?? []).filter(
    (edge) => cardIds.has(edge.from) && cardIds.has(edge.to),
  );
  for (const edge of admittedHandoffs) {
    const types = (edge.types ?? [])
      .slice(0, CREATE_WORKFLOW_GRAPH_MAX_HANDOFF_TYPES)
      .map((type) => boundGraphText(type, CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS))
      .filter((type) => type.length > 0);
    const row: CreateWorkflowHandoff = {
      from: boundGraphText(edge.from, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      to: boundGraphText(edge.to, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      ...(edge.back === true ? { back: true as const } : {}),
      ...(types.length > 0 ? { types } : {}),
    };
    if (projected.handoffs.length < CREATE_WORKFLOW_GRAPH_MAX_HANDOFFS)
      projected.handoffs.push(row);
  }
  truncated = truncated || admittedHandoffs.length < (handoff?.handoffs.length ?? 0);
  truncated = truncated || admittedHandoffs.length > CREATE_WORKFLOW_GRAPH_MAX_HANDOFFS;
  const sink = (graph.sink?.fedBy ?? [])
    .filter((id) => stepIds.has(id))
    .slice(0, CREATE_WORKFLOW_GRAPH_MAX_STEPS)
    .map((id) => boundGraphText(id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS));

  // Phase admission is decided after edge reduction, but every declared row is read.
  const phaseTable = flow?.phases;
  const phaseIds = new Set((phaseTable ?? []).map((phase) => phase.id));
  const ordering: RawEdge[] = [];
  const exitIds = new Set<string>();
  for (const edge of flow?.phaseEdges ?? []) {
    if (edge.from === FLOW_ENTRY || edge.from === FLOW_ABORT || edge.to === FLOW_ABORT) continue;
    if (!phaseIds.has(edge.from)) continue;
    if (edge.to === FLOW_SINK) {
      exitIds.add(edge.from);
      continue;
    }
    if (!phaseIds.has(edge.to)) continue;
    ordering.push({ back: edge.kind === "loop", from: edge.from, to: edge.to });
  }
  const phaseEdges: CreateWorkflowEdge[] = foldPhaseEdges(ordering).map((edge) => ({
    from: boundGraphText(edge.from, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
    to: boundGraphText(edge.to, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
    ...(edge.back ? { back: true as const } : {}),
  }));
  const omitPhases =
    phaseTable !== undefined &&
    (phaseTable.length > CREATE_WORKFLOW_GRAPH_MAX_PHASES ||
      phaseEdges.length > CREATE_WORKFLOW_GRAPH_MAX_PHASE_EDGES);
  truncated = truncated || omitPhases;
  const emitPhases = phaseTable !== undefined && !omitPhases;
  const phases: CreateWorkflowPhase[] = (phaseTable ?? []).map((phase) => {
    const name = phase.name
      ? boundGraphText(phase.name, CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS)
      : undefined;
    const alongside: string[] = [];
    const seen = new Set<string>();
    for (const id of phase.alongside ?? []) {
      if (id === phase.id || !phaseIds.has(id) || seen.has(id)) continue;
      if (alongside.length >= CREATE_WORKFLOW_GRAPH_MAX_PHASES) break;
      seen.add(id);
      alongside.push(boundGraphText(id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS));
    }
    return {
      id: boundGraphText(phase.id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      ...(name === undefined ? {} : { name }),
      ...(phase.loc === undefined ? {} : { line: phase.loc.line, column: phase.loc.column }),
      ...(alongside.length === 0 ? {} : { alongside }),
    };
  });
  const exits = (phaseTable ?? [])
    .filter((phase) => exitIds.has(phase.id))
    .map((phase) => boundGraphText(phase.id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS));

  // Project source rows late, then normalize card phases against the final vocabulary.
  projected.lanes = retainedLanes.map((lane) => {
    const name = lane.name
      ? boundGraphText(lane.name, CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS)
      : undefined;
    const namePattern = boundNamePattern(lane.namePattern);
    return {
      id: boundGraphText(lane.id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      ...(name === undefined ? {} : { name }),
      ...(namePattern === undefined ? {} : { namePattern }),
      ...(lane.loc === undefined ? {} : { line: lane.loc.line, column: lane.loc.column }),
    };
  });
  projected.steps = retainedSteps.map((step) => {
    const lanes = (step.lanes ?? []).filter((lane) => laneIds.has(lane));
    const label = step.label
      ? boundGraphText(step.label, CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS)
      : step.id;
    const labelPattern = boundNamePattern(step.labelPattern);
    return {
      id: boundGraphText(step.id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      kind: step.kind,
      label,
      ...(labelPattern === undefined ? {} : { labelPattern }),
      line: step.loc.line,
      column: step.loc.column,
      lane: boundGraphText(step.lane, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      ...(lanes.length > 1 ? { lanes } : {}),
      ...(step.source === undefined
        ? {}
        : { source: boundGraphText(step.source, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS) }),
      ...(emitPhases && step.phase !== undefined && phaseIds.has(step.phase)
        ? { phase: boundGraphText(step.phase, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS) }
        : {}),
      ...(step.repeat === undefined ? {} : { repeat: step.repeat }),
    };
  });
  projected.participants = projected.participants.map((card) =>
    emitPhases && phaseIds.has(card.phase) ? card : { ...card, phase: UNPHASED },
  );
  return {
    ...projected,
    ...(emitPhases ? { phases, phaseEdges, exits } : {}),
    ...(sink.length > 0 ? { sink } : {}),
    ...(truncated ? { truncated: true } : {}),
  };
}

// Bug 预防：actor 名 / ask label 来自脚本字符串字面量（外部输入），直接 slice 可能截断
// UTF-16 surrogate pair；与 result-display 的 MCP 文本限长同一处理——边界落在高位
// surrogate 后则丢弃半字符，保证载荷可安全序列化。id 是分析生成的 ASCII，slice 恒等通过。
function boundGraphText(value: string, maxChars: number): string {
  const bounded = value.slice(0, maxChars);
  const lastCodeUnit = bounded.charCodeAt(bounded.length - 1);
  return lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff ? bounded.slice(0, -1) : bounded;
}

/**
 * name pattern 的限长：两个 affix 同样来自脚本字面量，走同一条 surrogate-safe 截断。
 *
 * 截断后可能一个 affix 都不剩（理论上分析器已保证非空，但契约的 min(1) 不该依赖上游的
 * 保证）——那时整个字段缺席，而不是发一个 `{}` 让 `.strict()` 通过却渲染出一个孤零零的
 * 省略号。
 */
function boundNamePattern(
  pattern: { head?: string; tail?: string } | undefined,
): CreateWorkflowNamePattern | undefined {
  if (pattern === undefined) return undefined;
  const head = pattern.head
    ? boundGraphText(pattern.head, CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS)
    : "";
  const tail = pattern.tail
    ? boundGraphText(pattern.tail, CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS)
    : "";
  if (head === "" && tail === "") return undefined;
  return {
    ...(head === "" ? {} : { head }),
    ...(tail === "" ? {} : { tail }),
  };
}
