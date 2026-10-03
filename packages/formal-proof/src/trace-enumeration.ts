import { systemCandidates, userCandidates } from "./model-catalog.js";
import { evaluate, isSystemCandidateApplicable } from "./decision-policy.js";
import type {
  Candidate,
  Decision,
  DecisionKind,
  ProductContext,
  TraceNode,
  TraceStats,
} from "./model-types.js";

const allocation = { node: 0, case: 0 };
export function resetIds(): void {
  allocation.node = 0;
  allocation.case = 0;
}

export function contextLabel(context: ProductContext): string {
  const fields = [
    `phase=${context.runPhase}`,
    `queue=${context.queue}`,
    `compact=${context.compactMemory}`,
    context.canCompactAgain ? "canCompactAgain" : "cannotCompactAgain",
    `goal=${context.goal}`,
    `turn=${context.selectedTurn}`,
    context.forked ? "forked" : "notForked",
  ];
  return fields.join(" / ");
}
export function contextKey(context: ProductContext): string {
  return [
    context.runPhase,
    context.queue,
    context.compactMemory,
    String(context.canCompactAgain),
    context.goal,
    context.selectedTurn,
    String(context.forked),
  ].join("|");
}
export function enumerateCandidates(context: ProductContext): Candidate[] {
  return [
    ...userCandidates,
    ...systemCandidates.filter((candidate) => isSystemCandidateApplicable(context, candidate)),
  ];
}
export function decisionLabel(decision: Decision): string {
  const kind = ["reject", "enqueue", "allow", "choice", "system"].includes(decision.kind)
    ? decision.kind
    : "undefined";
  return `${kind} · ${decision.title}`;
}

function node(input: Omit<TraceNode, "id">): TraceNode {
  return { ...input, id: `n-${++allocation.node}` };
}
function assertion(context: ProductContext, candidate?: Candidate, decision?: Decision): string {
  if (!candidate || !decision) return "记录当前 trace，并判断是否需要继续展开。";
  const prefix = `Given ${contextLabel(context)}, when `;
  const target = decision.next ? contextLabel(decision.next) : "next context";
  switch (decision.kind) {
    case "reject":
      return `${prefix}${candidate.label}, then show "${decision.title}" and no forbidden side effect occurs.`;
    case "enqueue":
      return `${prefix}${candidate.label}, then queue state becomes ${decision.next?.queue ?? "unknown"}.`;
    case "allow":
      return `${prefix}${candidate.label}, then transition to ${target}.`;
    case "system":
      return `${prefix}system emits ${candidate.label}, then reconcile to ${target}.`;
    default:
      return `${prefix}${candidate.label}, product expectation is undefined and must be reviewed.`;
  }
}
function reviewCase(
  base: TraceNode,
  title: string,
  detail: string,
  candidate?: Candidate,
  decision?: Decision,
): TraceNode {
  const caseId = `CASE-${String(++allocation.case).padStart(5, "0")}`;
  return node({
    kind: "case",
    title: caseId,
    subtitle: title,
    detail,
    context: base.context,
    candidate,
    decision,
    caseId,
    e2e: assertion(base.context, candidate, decision),
    children: [],
  });
}
const effects = new Map<DecisionKind, string>([
  ["reject", "剪枝：显示明确拒绝"],
  ["enqueue", "副作用：进入消息队列"],
  ["allow", "副作用：动作生效"],
  ["system", "系统事件：推进阶段"],
  ["choice", "阻塞：等待用户裁决 queue disposition"],
]);
interface Trail {
  readonly key: string;
  readonly visits: number;
  readonly parent?: Trail;
}
function visits(trail: Trail | undefined, key: string): number {
  for (let cursor = trail; cursor; cursor = cursor.parent)
    if (cursor.key === key) return cursor.visits;
  return 0;
}

export function buildTraceTree(context: ProductContext, maxRounds: number): TraceNode {
  resetIds();
  const work: (() => void)[] = [];
  let root!: TraceNode;
  function state(
    context: ProductContext,
    round: number,
    trail: Trail | undefined,
    receive: (value: TraceNode) => void,
  ): void {
    const current = node({
      kind: "state",
      title: `S${round}: ${context.runPhase}`,
      subtitle: contextLabel(context),
      detail: "可见产品上下文。下一层会对所有候选动作做笛卡尔积枚举，再用产品 guard 剪枝。",
      context,
      children: [],
    });
    if (round > maxRounds) {
      receive(
        reviewCase(
          current,
          "到达轮次上限",
          "这条 trace 已到达当前枚举深度，需要人工 review 是否继续展开。",
        ),
      );
      return;
    }
    const key = `${round}:${contextKey(context)}`;
    const count = visits(trail, key);
    if (count > 1) {
      receive(
        reviewCase(current, "重复上下文", "模型再次到达相同上下文；这里应判断是否合并为等价类。"),
      );
      return;
    }
    receive(current);
    const nextTrail: Trail = { key, visits: count + 1, parent: trail };
    const candidates = enumerateCandidates(context);
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index]!;
      work.push(() => {
        const decision = evaluate(context, candidate);
        const action = node({
          kind: "candidate",
          title: candidate.label,
          subtitle: `${candidate.kind} / ${candidate.surface}`,
          detail: `候选组合：${contextLabel(context)} × ${candidate.label}`,
          context,
          candidate,
          children: [],
        });
        const guard = node({
          kind: "guard",
          title: decisionLabel(decision),
          subtitle: decision.ruleId,
          detail: decision.reason,
          context,
          candidate,
          decision,
          children: [],
        });
        const effect = node({
          kind: "effect",
          title: effects.get(decision.kind) ?? "未定义：需要产品 review",
          subtitle: decision.assertion,
          detail: decision.next
            ? contextLabel(decision.next)
            : "无下一状态：路径在这里被剪枝或等待产品定义。",
          context: decision.next ?? context,
          candidate,
          decision,
          children: [],
        });
        current.children.push(action);
        action.children.push(guard);
        guard.children.push(effect);
        if (decision.next && !["reject", "undefined", "choice"].includes(decision.kind)) {
          work.push(() =>
            state(decision.next!, round + 1, nextTrail, (child) => {
              effect.children.push(child);
            }),
          );
        } else
          effect.children.push(
            reviewCase(effect, decision.title, decision.assertion, candidate, decision),
          );
      });
    }
  }
  work.push(() =>
    state(context, 1, undefined, (value) => {
      root = value;
    }),
  );
  while (work.length) work.pop()!();
  return root;
}

export function flatten(root: TraceNode): TraceNode[] {
  const result: TraceNode[] = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop()!;
    result.push(current);
    for (let index = current.children.length - 1; index >= 0; index -= 1)
      pending.push(current.children[index]!);
  }
  return result;
}
export function collectStats(root: TraceNode): TraceStats {
  const result = {
    nodes: 0,
    cases: 0,
    rejects: 0,
    undefined: 0,
    enqueued: 0,
    allowed: 0,
    choices: 0,
    system: 0,
  };
  const counter = {
    reject: "rejects",
    undefined: "undefined",
    enqueue: "enqueued",
    allow: "allowed",
    choice: "choices",
    system: "system",
  } as const;
  for (const current of flatten(root)) {
    result.nodes += 1;
    if (current.kind === "case") result.cases += 1;
    if (current.decision && Object.hasOwn(counter, current.decision.kind))
      result[counter[current.decision.kind]] += 1;
  }
  return result;
}
