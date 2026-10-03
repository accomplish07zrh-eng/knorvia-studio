import {
  contextKey,
  flatten,
  type Candidate,
  type Decision,
  type DecisionKind,
  type NodeKind,
  type ProductContext,
  type TraceNode,
} from "./model.js";

export interface GraphNodeDatum {
  readonly id: string;
  readonly kind: NodeKind;
  readonly representative: TraceNode;
  readonly members: TraceNode[];
  readonly title: string;
  readonly subtitle: string;
  readonly detail: string;
  readonly context: ProductContext;
  readonly candidate?: Candidate;
  readonly decision?: Decision;
  readonly caseId?: string;
  readonly e2e?: string;
  readonly column: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface GraphEdgeDatum {
  readonly id: string;
  readonly source: GraphNodeDatum;
  readonly target: GraphNodeDatum;
  readonly decision?: Decision;
}
export interface StateSpaceGraph {
  readonly nodes: GraphNodeDatum[];
  readonly edges: GraphEdgeDatum[];
  readonly columns: number[];
  readonly width: number;
  readonly height: number;
}
export interface GraphSelection {
  readonly selectedId: string;
  readonly activeRule: string;
  readonly activeDecision: DecisionKind | "all";
}
const numberFormat = new Intl.NumberFormat("zh-CN");

function folded(parent: TraceNode, count: number): TraceNode {
  return {
    id: `${parent.id}-summary-${count}`,
    kind: "summary",
    title: `聚合 ${numberFormat.format(count)} 个节点`,
    subtitle: "超过当前渲染预算",
    detail: "完整语义仍然参与统计和 JSON 导出，只是画布里折叠显示。",
    context: parent.context,
    children: [],
  };
}

export function renderProjection(root: TraceNode, remaining: number): TraceNode {
  const sizes = new Map<TraceNode, number>();
  const ordered = flatten(root);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const current = ordered[index]!;
    sizes.set(current, 1 + current.children.reduce((total, child) => total + sizes.get(child)!, 0));
  }
  const work: (() => void)[] = [];
  let result!: TraceNode;
  function copy(source: TraceNode, receive: (value: TraceNode) => void): void {
    if (remaining <= 0) {
      receive(folded(source, 1));
      return;
    }
    remaining -= 1;
    const target = { ...source, children: [] as TraceNode[] };
    receive(target);
    let position = 0;
    function nextChild(): void {
      if (position >= source.children.length) return;
      if (remaining <= 0) {
        let hidden = 0;
        for (; position < source.children.length; position += 1)
          hidden += sizes.get(source.children[position]!)!;
        if (hidden > 0) target.children.push(folded(source, hidden));
        return;
      }
      const child = source.children[position++]!;
      work.push(nextChild);
      work.push(() =>
        copy(child, (value) => {
          target.children.push(value);
        }),
      );
    }
    work.push(nextChild);
  }
  work.push(() =>
    copy(root, (value) => {
      result = value;
    }),
  );
  while (work.length) work.pop()!();
  return result;
}

function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-|-$/g, "");
}
function identity(node: TraceNode, parent: GraphNodeDatum | undefined, depth: number): string {
  const prefix = parent?.id ?? "root";
  const decision = `${node.decision?.kind ?? "none"}:${node.decision?.ruleId ?? slug(node.title)}`;
  switch (node.kind) {
    case "state":
      return `state:${Math.floor(depth / 4) + 1}:${contextKey(node.context)}`;
    case "candidate":
      return `${prefix}:action:${node.candidate?.id ?? slug(node.title)}`;
    case "guard":
      return `${prefix}:guard:${decision}`;
    case "effect":
      return `${prefix}:effect:${decision}:${contextKey(node.context)}`;
    case "summary":
      return `${prefix}:summary:${slug(node.title)}`;
    default:
      return `case:${node.caseId ?? node.id}`;
  }
}
const ranks: Record<DecisionKind, number> = {
  reject: 1,
  undefined: 2,
  enqueue: 3,
  allow: 4,
  choice: 5,
  system: 5,
};
function sortKey(node: GraphNodeDatum): string {
  return [
    String(node.decision ? (ranks[node.decision.kind] ?? 5) : 0),
    node.kind,
    node.decision?.ruleId ?? "",
    node.title,
    node.subtitle,
  ].join("|");
}

export function buildStateSpaceGraph(root: TraceNode): StateSpaceGraph {
  const resident = new Map<string, GraphNodeDatum>();
  const links = new Map<string, GraphEdgeDatum>();
  const buckets = new Map<number, GraphNodeDatum[]>();
  const work: { node: TraceNode; parent?: GraphNodeDatum; depth: number }[] = [
    { node: root, depth: 0 },
  ];
  while (work.length) {
    const { node, parent, depth } = work.pop()!;
    const id = identity(node, parent, depth);
    let datum = resident.get(id);
    if (datum) datum.members.push(node);
    else {
      const column =
        Math.floor(depth / 4) * 5 + (["case", "summary"].includes(node.kind) ? 4 : depth % 4);
      datum = {
        id,
        kind: node.kind,
        representative: node,
        members: [node],
        title: node.title,
        subtitle: node.subtitle,
        detail: node.detail,
        context: node.context,
        candidate: node.candidate,
        decision: node.decision,
        caseId: node.caseId,
        e2e: node.e2e,
        column,
        x: 0,
        y: 0,
        width: node.kind === "case" ? 264 : node.kind === "state" ? 268 : 252,
        height: 76,
      };
      resident.set(id, datum);
      const bucket = buckets.get(column) ?? [];
      if (!buckets.has(column)) buckets.set(column, bucket);
      bucket.push(datum);
    }
    if (parent) {
      const edgeId = `${parent.id}->${datum.id}`;
      if (!links.has(edgeId)) {
        const decision = node.decision ?? parent.decision;
        const edge: GraphEdgeDatum = {
          id: edgeId,
          source: parent,
          target: datum,
          ...(decision ? { decision } : {}),
        };
        links.set(edgeId, edge);
      }
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      work.push({ node: node.children[index]!, parent: datum, depth: depth + 1 });
    }
  }
  const columns = [...buckets.keys()].sort((a, b) => a - b);
  let height = 600;
  for (const column of columns) {
    const rows = buckets.get(column)!;
    rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b), "zh-CN"));
    rows.forEach((node, index) => {
      node.x = 28 + column * 304;
      node.y = 114 + index * (node.height + 14);
    });
    height = Math.max(height, 114 + rows.length * 90 + 80);
  }
  const lastColumn = Math.max(columns.at(-1) ?? 0, 0);
  return {
    nodes: [...resident.values()],
    edges: [...links.values()],
    columns,
    width: 28 + (lastColumn + 1) * 304 + 280,
    height,
  };
}

export function columnLabel(column: number): string {
  const labels = ["State", "Action", "Guard", "Effect", "Case / Review"];
  return column % 5 === 0 ? `R${Math.floor(column / 5) + 1} · State` : labels[column % 5]!;
}
export function edgePath(edge: GraphEdgeDatum): string {
  const start = { x: edge.source.x + edge.source.width, y: edge.source.y + edge.source.height / 2 };
  const end = { x: edge.target.x, y: edge.target.y + edge.target.height / 2 };
  const controlX = start.x + Math.max(36, (end.x - start.x) * 0.5);
  return `M${start.x},${start.y} C${controlX},${start.y} ${controlX},${end.y} ${end.x},${end.y}`;
}
export function graphDimmed(node: GraphNodeDatum, selection: GraphSelection): boolean {
  const rule =
    selection.activeRule === "all" ||
    node.members.some((member) => member.decision?.ruleId === selection.activeRule);
  const decision =
    selection.activeDecision === "all" ||
    node.members.some((member) => member.decision?.kind === selection.activeDecision);
  return !rule || !decision;
}
function longRunning(node: GraphNodeDatum): boolean {
  return (
    node.kind === "state" &&
    ["running", "compacting", "goalVerifying"].includes(node.context.runPhase)
  );
}
export function graphNodeClass(node: GraphNodeDatum, selection: GraphSelection): string {
  const classes = ["graph-node", node.kind];
  if (node.decision) classes.push(node.decision.kind);
  if (longRunning(node)) classes.push("long-task");
  if (graphDimmed(node, selection)) classes.push("dimmed");
  if (selection.selectedId === node.id) classes.push("selected");
  return classes.join(" ");
}
export function nodeTypeLabel(node: GraphNodeDatum): string {
  if (longRunning(node)) return "State · long task";
  if (node.kind === "candidate")
    return node.candidate?.kind === "system" ? "System event" : "User action";
  return { state: "State", guard: "Guard", effect: "Effect", case: "Case", summary: "Folded" }[
    node.kind
  ];
}
export function shortText(value: string, maximum: number): string {
  return value.length > maximum ? `${value.slice(0, maximum - 1)}...` : value;
}
export function tracePath(root: TraceNode, id: string): TraceNode[] {
  const parents = new Map<TraceNode, TraceNode>();
  const pending = [root];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.id === id) {
      const path = [current];
      for (let parent = parents.get(current); parent; parent = parents.get(parent))
        path.push(parent);
      return path.reverse();
    }
    for (let index = current.children.length - 1; index >= 0; index -= 1) {
      const child = current.children[index]!;
      parents.set(child, current);
      pending.push(child);
    }
  }
  return [root];
}
