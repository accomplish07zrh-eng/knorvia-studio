import {
  buildTraceTree,
  collectStats,
  contextLabel,
  decisionLabel,
  flatten,
  profiles,
  type DecisionKind,
  type TraceNode,
} from "./model.js";
import { explorerShell } from "./explorer-shell.js";
import { GraphCanvas } from "./graph-canvas.js";
import {
  buildStateSpaceGraph,
  renderProjection,
  tracePath,
  type GraphNodeDatum,
  type GraphSelection,
} from "./trace-graph.js";
import "./styles.css";

type ReviewStatus = "accepted" | "undefined" | "invalid" | "ignored" | "bug";
const reviewKey = "knorvia.conversation-state-space.review.v1";
const statusOptions: ReviewStatus[] = ["accepted", "undefined", "invalid", "ignored", "bug"];
const numberFormat = new Intl.NumberFormat("zh-CN");

function required<T extends Element>(id: string): T {
  const element = document.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`Missing element: #${id}`);
  return element;
}
function button(text: string, className: string, click: () => void): HTMLButtonElement {
  const result = document.createElement("button");
  result.type = "button";
  result.className = className;
  result.textContent = text;
  result.addEventListener("click", click);
  return result;
}
function storedReview(): Record<string, ReviewStatus> {
  try {
    return JSON.parse(localStorage.getItem(reviewKey) || "{}") as Record<string, ReviewStatus>;
  } catch {
    return {};
  }
}

class TraceExplorer implements GraphSelection {
  selectedId = "";
  activeRule = "all";
  activeDecision: DecisionKind | "all" = "all";
  private root: TraceNode;
  private rows: TraceNode[] = [];
  private graphNodes = new Map<string, GraphNodeDatum>();
  private readonly review: Record<string, ReviewStatus>;
  private readonly canvas: GraphCanvas;
  private readonly controls = {
    profile: required<HTMLSelectElement>("profileSelect"),
    rounds: required<HTMLSelectElement>("roundSelect"),
    budget: required<HTMLSelectElement>("budgetSelect"),
    decision: required<HTMLSelectElement>("decisionSelect"),
  };
  private readonly metrics = {
    nodes: required<HTMLElement>("metricNodes"),
    cases: required<HTMLElement>("metricCases"),
    rejects: required<HTMLElement>("metricRejects"),
    undefined: required<HTMLElement>("metricUndefined"),
    enqueued: required<HTMLElement>("metricQueue"),
    rendered: required<HTMLElement>("metricRendered"),
  };
  private readonly details = {
    popover: required<HTMLElement>("nodePopover"),
    title: required<HTMLElement>("detailTitle"),
    kind: required<HTMLElement>("detailKind"),
    context: required<HTMLElement>("detailContext"),
    text: required<HTMLElement>("detailText"),
    e2e: required<HTMLElement>("detailE2e"),
    path: required<HTMLElement>("detailPath"),
    review: required<HTMLElement>("reviewButtons"),
  };
  private readonly rules = required<HTMLElement>("ruleList");

  constructor() {
    this.root = this.rebuild();
    this.review = storedReview();
    this.canvas = new GraphCanvas(required<SVGSVGElement>("tree"));
    for (const control of [this.controls.profile, this.controls.rounds, this.controls.budget]) {
      control.addEventListener("change", () => {
        this.selectedId = "";
        this.root = this.rebuild();
        this.render();
      });
    }
    this.controls.decision.addEventListener("change", () => {
      this.activeDecision = this.controls.decision.value as DecisionKind | "all";
      this.render();
    });
    const actions: Record<string, () => void> = {
      zoomIn: () => this.canvas.zoomBy(1.25),
      zoomOut: () => this.canvas.zoomBy(0.8),
      fitTree: () => this.canvas.fitGraph(),
      resetTree: () => this.canvas.reset(),
      exportCases: () => this.exportCases(),
      closeDetail: () => {
        this.selectedId = "";
        this.canvas.refreshSelection(this);
        this.showDetail();
      },
    };
    for (const [id, action] of Object.entries(actions))
      required<HTMLButtonElement>(id).addEventListener("click", action);
    this.render();
  }

  private rebuild(): TraceNode {
    const profile =
      profiles.find((profile) => profile.id === this.controls.profile.value) ?? profiles[0];
    if (!profile) throw new Error("No model profiles defined");
    return buildTraceTree(profile.context, Number(this.controls.rounds.value));
  }

  private render(): void {
    this.rows = flatten(this.root);
    const graph = buildStateSpaceGraph(
      renderProjection(this.root, Number(this.controls.budget.value)),
    );
    this.graphNodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const stats = collectStats(this.root);
    for (const metric of ["nodes", "cases", "rejects", "undefined", "enqueued"] as const) {
      this.metrics[metric].textContent = numberFormat.format(stats[metric]);
    }
    this.metrics.rendered.textContent = numberFormat.format(graph.nodes.length);
    this.renderRules();
    this.canvas.render(graph, this, (node) => {
      this.selectedId = node.id;
      this.canvas.refreshSelection(this);
      this.showDetail(node);
    });
    this.showDetail(this.graphNodes.get(this.selectedId));
  }

  private renderRules(): void {
    const counts = new Map<string, number>();
    for (const row of this.rows) {
      const rule = row.decision?.ruleId;
      if (rule) counts.set(rule, (counts.get(rule) ?? 0) + 1);
    }
    const select = (rule: string): void => {
      this.activeRule = rule;
      this.render();
    };
    const all = button("", `rule-button${this.activeRule === "all" ? " active" : ""}`, () =>
      select("all"),
    );
    all.innerHTML = "<b>全部规则</b><span>取消规则高亮</span>";
    const buttons = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([rule, count]) => {
        const result = button("", `rule-button${this.activeRule === rule ? " active" : ""}`, () =>
          select(rule),
        );
        const sample =
          this.rows.find((row) => row.decision?.ruleId === rule)?.decision?.reason ??
          "规则命中路径";
        result.innerHTML = `<b>${rule} · ${numberFormat.format(count)}</b><span>${sample}</span>`;
        return result;
      });
    this.rules.replaceChildren(all, ...buttons);
  }

  private showDetail(graphNode?: GraphNodeDatum): void {
    this.details.popover.hidden = !graphNode;
    if (!graphNode) {
      this.details.review.replaceChildren();
      this.details.path.replaceChildren();
      return;
    }
    const row = graphNode.representative;
    this.details.title.textContent = graphNode.title;
    this.details.kind.textContent = [
      graphNode.kind,
      graphNode.members.length > 1
        ? `命中 ${numberFormat.format(graphNode.members.length)} 条 trace`
        : "",
      row.decision ? decisionLabel(row.decision) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    this.details.context.textContent = contextLabel(graphNode.context);
    this.details.text.textContent = graphNode.detail;
    this.details.e2e.textContent = row.e2e ?? row.decision?.assertion ?? "-";
    this.renderReviews(graphNode);
    this.details.path.replaceChildren(
      ...tracePath(this.root, row.id).map((node) => {
        const item = document.createElement("li");
        item.textContent = `${node.kind}: ${node.title}`;
        return item;
      }),
    );
  }

  private renderReviews(graphNode: GraphNodeDatum): void {
    const row = graphNode.representative;
    this.details.review.replaceChildren(
      ...statusOptions.map((status) => {
        const active = row.caseId && this.review[row.caseId] === status;
        const result = button(status, `review-button${active ? " active" : ""}`, () => {
          if (!row.caseId) return;
          this.review[row.caseId] = status;
          localStorage.setItem(reviewKey, JSON.stringify(this.review));
          this.renderReviews(graphNode);
        });
        result.disabled = !row.caseId;
        return result;
      }),
    );
  }

  private exportCases(): void {
    const cases = this.rows
      .filter((row) => row.kind === "case")
      .map((row) => ({
        id: row.caseId,
        status: row.caseId ? (this.review[row.caseId] ?? "unreviewed") : "unreviewed",
        title: row.subtitle,
        context: contextLabel(row.context),
        decision: row.decision?.kind,
        ruleId: row.decision?.ruleId,
        action: row.candidate?.label,
        e2e: row.e2e,
        path: tracePath(this.root, row.id).map((node) => node.title),
      }));
    const blob = new Blob([JSON.stringify(cases, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "conversation-state-space-cases.json";
    link.click();
    URL.revokeObjectURL(url);
  }
}

required<HTMLDivElement>("app").innerHTML = explorerShell();
new TraceExplorer();
