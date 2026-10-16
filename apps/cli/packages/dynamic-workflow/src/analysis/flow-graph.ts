// SPDX-License-Identifier: Apache-2.0

import type { ScriptLoc } from "../compiler/compile.js";
import type { JumpKind, OrderRegion } from "./causality-order.js";
import type { AnalysisCore } from "./core.js";
import { collectFlowPhases, quotientFlow } from "./flow-phase.js";
import { createStrandPark } from "./flow-strands.js";
import { buildTree, type LeafNode, type RegionNode, type TreeNode } from "./flow-tree.js";

export type FlowNodeKind = "mark" | "issue";

export interface FlowNode {
  readonly alongside?: string[];
  readonly detached?: true;
  readonly id: string;
  readonly kind: FlowNodeKind;
  readonly phase: string;
  /** Issue only: the step's site id. */
  readonly site?: string;
}

export type FlowEdgeKind =
  "next" | "branch" | "loop" | "exit" | "fork" | "join" | "jump" | "throw" | "may-throw";

export type FlowVia = "recur" | "return" | "break" | "continue";

export interface FlowEdge {
  readonly from: string;
  readonly kind: FlowEdgeKind;
  readonly to: string;
  readonly via?: FlowVia;
}

export interface FlowPhase {
  readonly alongside?: string[];
  readonly id: string;
  readonly loc?: ScriptLoc;
  readonly name?: string;
}

export const FLOW_ENTRY: "entry" = "entry";
export const FLOW_SINK: "sink" = "sink";
export const FLOW_ABORT: "abort" = "abort";

export interface ControlFlowGraph {
  readonly edges: FlowEdge[];
  readonly nodes: FlowNode[];
  readonly phaseEdges?: FlowEdge[];
  readonly phases?: FlowPhase[];
}

export interface Src {
  readonly from: string;
  readonly kind: FlowEdgeKind;
  readonly via?: FlowVia;
}

interface Pending {
  readonly kind: JumpKind;
  srcs: Array<Src>;
  readonly target: string;
}

function weight(kind: FlowEdgeKind): number {
  if (kind === "next") return 0;
  if (kind === "branch" || kind === "fork") return 1;
  if (kind === "loop") return 3;
  return kind === "throw" || kind === "may-throw" ? 4 : 2;
}

function stamp(from: string, kind: FlowEdgeKind, via?: FlowVia): Src {
  return via === undefined ? { from, kind } : { from, kind, via };
}

function promoteKind(rows: readonly Src[], edgeKind: FlowEdgeKind, route?: FlowVia): Src[] {
  const heavier = weight(edgeKind);
  return rows.map((row) => (heavier > weight(row.kind) ? stamp(row.from, edgeKind, route) : row));
}

function forceKind(rows: readonly Src[], edgeKind: FlowEdgeKind, route?: FlowVia): Src[] {
  return rows.map((row) => stamp(row.from, edgeKind, route));
}

function uniqueSrcs(rows: readonly Src[]): Src[] {
  const prior = new Set<string>();
  return rows.filter((row) => {
    const signature = row.from + "|" + row.kind + "|" + (row.via ?? "");
    const fresh = prior.has(signature) === false;
    if (fresh) prior.add(signature);
    return fresh;
  });
}

function jumpShape(kind: JumpKind): { kind: FlowEdgeKind; via?: FlowVia } {
  if (kind === "throw") return { kind: "throw" };
  const edgeKind = kind === "break" ? "exit" : kind === "return" ? "jump" : "loop";
  return { kind: edgeKind, via: kind };
}

function pushSrcs(into: Src[], srcs: readonly Src[]): void {
  for (const src of srcs) into.push(src);
}

function byEndpoint(at: (id: string) => number, left: FlowEdge, right: FlowEdge): number {
  const fromDelta = at(left.from) - at(right.from);
  const toDelta = at(left.to) - at(right.to);
  if (fromDelta !== 0) return fromDelta;
  if (toDelta !== 0) return toDelta;
  return left.kind.localeCompare(right.kind) || (left.via ?? "").localeCompare(right.via ?? "");
}

export function projectControlFlow(input: AnalysisCore): ControlFlowGraph {
  return new Projector(input).project();
}

class Projector {
  private readonly nodes: FlowNode[] = [];
  private edges: FlowEdge[] = [];
  private readonly edgeKeys = new Set<string>();
  private pending: Pending[] = [];
  private readonly occurrences = new Map<string, number>();
  private placeholders = 0;
  private readonly byId: Map<string, RegionNode>;
  private readonly root: RegionNode;
  private readonly park: ReturnType<typeof createStrandPark>;
  private readonly trace: AnalysisCore["trace"];

  constructor(core: AnalysisCore) {
    const tree = buildTree(core.trace);
    this.byId = tree.byId;
    this.root = tree.root;
    this.park = createStrandPark(core.trace.phases);
    this.trace = core.trace;
  }

  project(): ControlFlowGraph {
    const isolated: RegionNode[] = [];
    const main: TreeNode[] = [];
    for (const child of this.root.children) {
      if (child.type === "region" && child.region.detached === true) isolated.push(child);
      else main.push(child);
    }
    this.connect(this.sequence(main, [stamp(FLOW_ENTRY, "next")]), FLOW_SINK);
    this.connect(this.take(this.trace.root, ["return"]), FLOW_SINK);
    this.connect(this.take(this.trace.root, ["throw"]), FLOW_ABORT);
    this.connect(this.park.drain(), FLOW_SINK);
    for (const body of isolated) {
      const pendingMark = this.pending.length;
      const nodeMark = this.nodes.length;
      this.sequence(body.children, []);
      const tail = this.nodes.splice(nodeMark);
      for (const born of tail) this.nodes.push({ ...born, detached: true });
      this.pending.length = pendingMark;
      this.park.discard();
    }
    orderEdges(this.nodes, this.edges);
    const phases = collectFlowPhases(this.trace, this.nodes);
    if (this.trace.phases.length === 0) return { edges: this.edges, nodes: this.nodes };
    const phaseEdges = quotientFlow(this.nodes, this.edges, phases);
    return { edges: this.edges, nodes: this.nodes, phaseEdges, phases };
  }

  private connect(srcs: readonly Src[], to: string): void {
    for (const src of srcs) this.emit(src.from, to, src.kind, src.via);
  }

  private emit(from: string, to: string, kind: FlowEdgeKind, via?: FlowVia): void {
    const key = [from, to, kind, via ?? ""].join("|");
    if (this.edgeKeys.has(key)) return;
    this.edgeKeys.add(key);
    this.edges.push(via === undefined ? { from, kind, to } : { from, kind, to, via });
  }

  private take(target: string, kinds: readonly JumpKind[]): Src[] {
    const kept: Pending[] = [];
    const grabbed: Src[] = [];
    for (const entry of this.pending) {
      if (entry.target === target && kinds.includes(entry.kind)) pushSrcs(grabbed, entry.srcs);
      else kept.push(entry);
    }
    this.pending = kept;
    return grabbed;
  }

  private enclosingAttempt(region: OrderRegion): string | undefined {
    let parentId = region.parent;
    while (parentId !== undefined) {
      const parent = this.byId.get(parentId);
      if (parent === undefined) return;
      if (parent.region.kind === "attempt") return parent.region.id;
      parentId = parent.region.parent;
    }
    return;
  }

  private raiseOutward(from: OrderRegion, thrown: readonly Src[]): void {
    if (thrown.length === 0) return;
    const attempt = this.enclosingAttempt(from);
    if (attempt === undefined) {
      this.connect(thrown, FLOW_ABORT);
      return;
    }
    this.pending.push({ kind: "throw", srcs: thrown.slice(), target: attempt });
  }

  private subtreeIds(node: RegionNode): Set<string> {
    const ids = new Set<string>([node.region.id]);
    for (const limb of node.children) {
      if (limb.type !== "region") continue;
      for (const id of this.subtreeIds(limb)) ids.add(id);
    }
    return ids;
  }

  private leaf(node: LeafNode, incoming: readonly Src[]): Src[] {
    const cue = node.event;
    if (cue.at === "actor") return incoming.slice();
    if (cue.at === "settle") return incoming.concat(this.park.join(cue.joins ?? []));
    if (cue.at === "jump") {
      const shaped = jumpShape(cue.kind);
      this.pending.push({
        kind: cue.kind,
        srcs: promoteKind(incoming, shaped.kind, shaped.via),
        target: cue.target,
      });
      return new Array<Src>();
    }
    const occurrenceKey = cue.at === "issue" ? cue.step : cue.phase;
    const seen = (this.occurrences.get(occurrenceKey) ?? 0) + 1;
    this.occurrences.set(occurrenceKey, seen);
    const id = occurrenceKey + "@" + String(seen);
    const alongside = cue.at === "mark" ? this.park.alongside(cue.phase, cue.regions) : [];
    const created: FlowNode = {
      id,
      kind: cue.at,
      phase: cue.phase,
      ...(cue.at === "issue" ? { site: cue.step } : {}),
      ...(alongside.length > 0 ? { alongside } : {}),
    };
    this.nodes.push(created);
    this.connect(incoming, id);
    return [stamp(id, "next")];
  }

  private sequence(children: readonly TreeNode[], incoming: readonly Src[]): Src[] {
    let current = incoming.slice();
    for (const child of children) current = this.flow(child, current);
    return current;
  }

  private withEntries(children: readonly TreeNode[], incoming: readonly Src[]) {
    this.placeholders += 1;
    const placeholder = "$entry" + String(this.placeholders);
    const pendingMark = this.pending.length;
    const exits = this.sequence(children, [stamp(placeholder, "next")]);
    const kept: FlowEdge[] = [];
    const lifted: FlowEdge[] = [];
    for (const edge of this.edges) {
      if (edge.from !== placeholder) kept.push(edge);
      else {
        this.edgeKeys.delete([edge.from, edge.to, edge.kind, edge.via ?? ""].join("|"));
        lifted.push(edge);
      }
    }
    this.edges = kept;
    const openings: string[] = [];
    for (const edge of lifted) {
      if (openings.includes(edge.to) === false) openings.push(edge.to);
      this.connect(promoteKind(incoming, edge.kind, edge.via), edge.to);
    }
    for (const entry of this.pending.slice(pendingMark)) {
      const rewritten: Src[] = [];
      for (const src of entry.srcs) {
        if (src.from !== placeholder) rewritten.push(src);
        else for (const source of incoming) rewritten.push(stamp(source.from, src.kind, src.via));
      }
      entry.srcs = rewritten;
    }
    const passed = exits.some((src) => src.from === placeholder) ? incoming.slice() : [];
    return { entries: openings, exits: exits.filter((src) => src.from !== placeholder), passed };
  }

  private choice(node: RegionNode, incoming: readonly Src[]): Src[] {
    const region = node.region;
    let cursor = incoming.slice();
    const outgoing: Src[] = [];
    let carried: Src[] = [];
    let tookArm = false;
    for (const limb of node.children) {
      const arm = limb.type === "region" && limb.region.kind === "branch";
      if (arm === false) cursor = this.flow(limb, cursor);
      else {
        tookArm = true;
        const armExits = this.sequence(limb.children, promoteKind(cursor, "branch").concat(carried));
        if (region.fallthrough === true) carried = armExits;
        else pushSrcs(outgoing, armExits);
      }
    }
    if (region.fallthrough === true) pushSrcs(outgoing, carried);
    if (region.exhaustive !== true || tookArm === false) pushSrcs(outgoing, promoteKind(cursor, "branch"));
    pushSrcs(outgoing, forceKind(this.take(region.id, ["break"]), "branch"));
    return outgoing;
  }

  private loop(node: RegionNode, incoming: readonly Src[]): Src[] {
    const region = node.region;
    const opened = this.withEntries(node.children, incoming);
    const breaks = this.take(region.id, ["break"]);
    const jumpsBack = this.take(region.id, ["continue", "recur"]);
    if (region.recursive === true) {
      this.tie(jumpsBack, opened.entries);
      return opened.exits.concat(opened.passed, breaks);
    }
    this.tie(promoteKind(opened.exits, "loop").concat(jumpsBack), opened.entries);
    if (opened.entries.length === 0) {
      const skipped = region.entered ? [] : incoming.slice();
      return uniqueSrcs(opened.exits.concat(opened.passed, breaks, skipped));
    }
    const leaving = promoteKind(opened.exits, "exit").concat(promoteKind(opened.passed, "exit"), breaks);
    if (region.entered === false) pushSrcs(leaving, promoteKind(incoming, "exit"));
    return uniqueSrcs(leaving);
  }

  private tie(sources: readonly Src[], entries: readonly string[]): void {
    for (const src of sources)
      for (const entry of entries) this.emit(src.from, entry, src.kind, src.via);
  }

  private fanout(node: RegionNode, incoming: readonly Src[]): Src[] {
    const opened = this.withEntries(node.children, promoteKind(incoming, "fork"));
    const returns = forceKind(this.take(node.region.id, ["return"]), "join", "return");
    if (opened.entries.length === 0) return uniqueSrcs(opened.exits.concat(opened.passed, returns));
    return uniqueSrcs(promoteKind(opened.exits, "join").concat(promoteKind(opened.passed, "join"), returns));
  }

  // Park on exits, not entry nodes: a joined strand can exit without its own node,
  // and a touchless return still stands on the spawner's source.
  private strandRegion(node: RegionNode, incoming: readonly Src[]): Src[] {
    const nodeMark = this.nodes.length;
    const parents = new Set(incoming.map((src) => src.from));
    const opened = this.withEntries(node.children, promoteKind(incoming, "fork"));
    const returns = forceKind(this.take(node.region.id, ["return"]), "join", "return");
    const exits = uniqueSrcs(promoteKind(opened.exits, "join").concat(returns)).filter(
      (src) => parents.has(src.from) === false,
    );
    const phases = [...new Set(this.nodes.slice(nodeMark).map((created) => created.phase))];
    if (exits.length > 0 || phases.length > 0) this.park.park(node.region.id, exits, phases);
    return incoming.slice();
  }

  private call(node: RegionNode, incoming: readonly Src[]): Src[] {
    return this.sequence(node.children, incoming).concat(
      forceKind(this.take(node.region.id, ["return"]), "next"),
    );
  }

  private tryGroup(node: RegionNode, incoming: readonly Src[]): Src[] {
    const attempt = this.part(node, "attempt");
    if (attempt === undefined) return this.sequence(node.children, incoming);
    const catcher = this.part(node, "catch");
    const cleanup = this.part(node, "finally");
    const inside = this.subtreeIds(node);
    const pendingMark = this.pending.length;
    const nodeMark = this.nodes.length;
    let straight = this.sequence(attempt.children, incoming);
    const raised = this.nodes.slice(nodeMark)
      .filter((created) => created.kind === "issue")
      .map((created) => stamp(created.id, "may-throw"));
    pushSrcs(raised, this.take(attempt.region.id, ["throw"]));
    if (catcher !== undefined) {
      straight = straight.concat(this.sequence(catcher.children, raised));
      raised.length = 0;
    }
    if (cleanup === undefined) {
      this.raiseOutward(node.region, raised);
      return straight;
    }
    const kept: Pending[] = [];
    const leaving: Pending[] = [];
    for (let index = 0; index < this.pending.length; index += 1) {
      const entry = this.pending[index];
      if (entry === undefined) continue;
      if (index < pendingMark || inside.has(entry.target)) kept.push(entry);
      else leaving.push(entry);
    }
    this.pending = kept;
    const fed: Src[] = [];
    pushSrcs(fed, straight);
    pushSrcs(fed, raised);
    for (const jump of leaving) pushSrcs(fed, jump.srcs);
    const cleanupExits = this.sequence(cleanup.children, fed);
    for (const jump of leaving) {
      const shaped = jumpShape(jump.kind);
      this.pending.push({
        kind: jump.kind,
        srcs: promoteKind(cleanupExits, shaped.kind, shaped.via),
        target: jump.target,
      });
    }
    if (raised.length > 0) this.raiseOutward(node.region, promoteKind(cleanupExits, "throw"));
    return straight.length > 0 ? cleanupExits : [];
  }

  private part(node: RegionNode, role: OrderRegion["kind"]): RegionNode | undefined {
    return node.children.find(
      (limb): limb is RegionNode => limb.type === "region" && limb.region.kind === role,
    );
  }

  private flow(node: TreeNode, incoming: readonly Src[]): Src[] {
    if (node.type === "leaf") return uniqueSrcs(this.leaf(node, incoming));
    if (node.region.strand === true) return uniqueSrcs(this.strandRegion(node, incoming));
    const kind = node.region.kind;
    if (kind === "choice") return uniqueSrcs(this.choice(node, incoming));
    if (kind === "loop") return uniqueSrcs(this.loop(node, incoming));
    if (kind === "fanout") return uniqueSrcs(this.fanout(node, incoming));
    if (kind === "call") return uniqueSrcs(this.call(node, incoming));
    if (kind === "try") return uniqueSrcs(this.tryGroup(node, incoming));
    return uniqueSrcs(this.sequence(node.children, incoming));
  }
}

function orderEdges(nodes: readonly FlowNode[], edges: FlowEdge[]): void {
  const slot = new Map<string, number>();
  nodes.forEach((node, index) => slot.set(node.id, index));
  slot.set(FLOW_ENTRY, -1);
  slot.set(FLOW_SINK, nodes.length);
  slot.set(FLOW_ABORT, nodes.length + 1);
  const past = nodes.length + 2;
  const locate = (id: string): number => slot.get(id) ?? past;
  edges.sort((left, right) => byEndpoint(locate, left, right));
}
