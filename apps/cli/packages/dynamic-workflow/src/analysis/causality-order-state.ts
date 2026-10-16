// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import type { ScriptLoc, WorkflowProgram } from "../compiler/compile.js";
import {
  findWorkflowBody,
  type IterationCandidate,
  type PhaseMarkerSite,
  type SiteTable,
} from "./sites.js";
import type { ApplicationVia } from "./state.js";
import { UNPHASED_ID, type JumpKind, type TraceRegionKind } from "./constants.js";
import type {
  ControlFact,
  IssueEvent,
  JumpEvent,
  OrderEvent,
  OrderOracle,
  OrderRegion,
  PhaseInfo,
} from "./causality-order-types.js";
import {
  asScriptFunction,
  collectRecursiveFunctions,
  type ScriptFunction,
} from "./causality-order-functions.js";
import { innermostOpenStrand, type Frame, type StrandRecord } from "./causality-order-strands.js";

// Explicit walk trace. Visitors in the sibling modules take this as their first argument.
// `issued` is global so a later widen can still see steps settled only inside a popped frame.
// `walkedFns` / `regionByStatement` are per occurrence: a helper inlined twice resolves
// `return` and `break` against the region opened for that occurrence.

export interface TraceState {
  readonly scriptFile: ts.SourceFile;
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly toScriptLoc: WorkflowProgram["toScriptLoc"];
  readonly oracle: OrderOracle;
  readonly body: ts.Block;
  readonly askByCall: ReadonlyMap<ts.Node, string>;
  readonly readByCall: ReadonlyMap<ts.Node, string>;
  readonly actorByCall: ReadonlyMap<ts.Node, string>;
  /** Fan-out candidate keyed by the call that applies the per-element callback. */
  readonly candByCall: ReadonlyMap<ts.Node, IterationCandidate>;
  /** Same candidates keyed by an inline callback literal. */
  readonly candByCallback: ReadonlyMap<ts.Node, IterationCandidate>;
  /** Named callbacks the oracle applies per element (`xs.map(review)`). */
  readonly eachCallbackFns: ReadonlySet<ts.Node>;
  readonly recursive: ReadonlySet<ts.Node>;
  /** Ask and world-read ids. Join and fan-out labels are relays, not steps. */
  readonly realSteps: ReadonlySet<string>;
  readonly callByStep: ReadonlyMap<string, ts.Node>;
  readonly iterationAncestorCache: Map<ts.Node, Set<ts.Node>>;
  readonly events: Array<OrderEvent>;
  readonly regions: Array<OrderRegion>;
  readonly controls: Array<ControlFact>;
  readonly counters: Map<TraceRegionKind, number>;
  readonly issued: Set<string>;
  readonly frames: Array<Frame>;
  readonly strands: Array<StrandRecord>;
  readonly joined: Set<string>;
  readonly strandsBySymbol: Map<ts.Symbol, Set<string>>;
  readonly returnTargets: Array<string>;
  readonly throwTargets: Array<string>;
  readonly regionByStatement: Map<ts.Node, string>;
  /** Loop region opened for a recursive function's current inline. */
  readonly sccLoopByDecl: Map<ts.Node, string>;
  readonly stepsBySymbol: Map<ts.Symbol, Set<string>>;
  readonly walkedFns: Set<ts.Node>;
  readonly fnStack: Array<ts.Node>;
  readonly markerByStatement: ReadonlyMap<ts.Node, PhaseMarkerSite>;
  readonly phases: Array<PhaseInfo>;
  readonly phaseIdByName: Map<string, string>;
  currentPhase: string;
  readonly root: string;
  readonly walk: (node: ts.Node, chain: readonly string[]) => void;
}

type RegionSeed = Omit<OrderRegion, "id" | "kind" | "parent">;

export function applicationsAt(
  trace: Pick<TraceState, "oracle" | "scriptFile">,
  node: ts.Node,
  via: ApplicationVia,
): ScriptFunction[] {
  const recorded = trace.oracle.applications.get(node);
  if (recorded === undefined) return [];
  const matched: ScriptFunction[] = [];
  recorded.forEach((how, fn) => {
    if (how !== via) return;
    const decl = asScriptFunction(fn, trace.scriptFile);
    if (decl !== undefined) matched.push(decl);
  });
  return matched;
}

export function openRegion(
  trace: Pick<TraceState, "counters" | "regions">,
  kind: TraceRegionKind,
  parent: string | undefined,
  extra: RegionSeed,
): string {
  const serial = (trace.counters.get(kind) ?? 0) + 1;
  trace.counters.set(kind, serial);
  const id = `${kind}#${String(serial)}`;
  const region: OrderRegion =
    parent === undefined ? { id, kind, ...extra } : { id, kind, parent, ...extra };
  trace.regions.push(region);
  return region.id;
}

function indexCalls<T extends { call: ts.Node; id: string }>(rows: readonly T[]): Map<ts.Node, string> {
  const index = new Map<ts.Node, string>();
  for (const row of rows) index.set(row.call, row.id);
  return index;
}

function indexIterations(rows: readonly IterationCandidate[]): {
  byCall: Map<ts.Node, IterationCandidate>;
  byCallback: Map<ts.Node, IterationCandidate>;
} {
  const byCall = new Map<ts.Node, IterationCandidate>();
  const byCallback = new Map<ts.Node, IterationCandidate>();
  for (const cand of rows) {
    if (cand.call !== undefined) byCall.set(cand.call, cand);
    if (cand.callback !== undefined) byCallback.set(cand.callback, cand);
  }
  return { byCall, byCallback };
}

function eachCallbackFunctions(
  calls: ReadonlyMap<ts.Node, IterationCandidate>,
  scope: Pick<TraceState, "oracle" | "scriptFile">,
): Set<ts.Node> {
  const fns = new Set<ts.Node>();
  calls.forEach((_cand, call) => {
    for (const fn of applicationsAt(scope, call, "argument")) fns.add(fn);
  });
  return fns;
}

function stepCallIndex(table: SiteTable): Map<string, ts.Node> {
  const index = new Map<string, ts.Node>();
  for (const row of table.asks) index.set(row.id, row.call);
  for (const row of table.worldReads) index.set(row.id, row.call);
  return index;
}

function realStepSet(table: SiteTable): Set<string> {
  return new Set([...table.asks, ...table.worldReads].map((site) => site.id));
}

function markersByStatement(table: SiteTable): Map<ts.Node, PhaseMarkerSite> {
  const markers = new Map<ts.Node, PhaseMarkerSite>();
  table.phases.forEach((marker) => {
    const parent = marker.call.parent;
    if (parent.kind === ts.SyntaxKind.ExpressionStatement) markers.set(parent, marker);
  });
  return markers;
}

function rootSequence(): { regions: OrderRegion[]; counters: Map<TraceRegionKind, number>; root: string } {
  const regions: Array<OrderRegion> = [];
  const counters: Map<TraceRegionKind, number> = new Map();
  const opened = openRegion({ counters, regions }, "seq", undefined, { entered: true });
  return { counters, regions, root: opened };
}

class WalkTrace implements TraceState {
  actorByCall!: TraceState["actorByCall"];
  askByCall!: TraceState["askByCall"];
  body!: TraceState["body"];
  callByStep!: TraceState["callByStep"];
  candByCall!: TraceState["candByCall"];
  candByCallback!: TraceState["candByCallback"];
  checker!: TraceState["checker"];
  controls!: TraceState["controls"];
  counters!: TraceState["counters"];
  currentPhase!: TraceState["currentPhase"];
  eachCallbackFns!: TraceState["eachCallbackFns"];
  events!: TraceState["events"];
  fnStack!: TraceState["fnStack"];
  frames!: TraceState["frames"];
  issued!: TraceState["issued"];
  iterationAncestorCache!: TraceState["iterationAncestorCache"];
  joined!: TraceState["joined"];
  markerByStatement!: TraceState["markerByStatement"];
  oracle!: TraceState["oracle"];
  phaseIdByName!: TraceState["phaseIdByName"];
  phases!: TraceState["phases"];
  program!: TraceState["program"];
  readByCall!: TraceState["readByCall"];
  realSteps!: TraceState["realSteps"];
  recursive!: TraceState["recursive"];
  regionByStatement!: TraceState["regionByStatement"];
  regions!: TraceState["regions"];
  returnTargets!: TraceState["returnTargets"];
  root!: TraceState["root"];
  sccLoopByDecl!: TraceState["sccLoopByDecl"];
  scriptFile!: TraceState["scriptFile"];
  stepsBySymbol!: TraceState["stepsBySymbol"];
  strands!: TraceState["strands"];
  strandsBySymbol!: TraceState["strandsBySymbol"];
  throwTargets!: TraceState["throwTargets"];
  toScriptLoc!: TraceState["toScriptLoc"];
  walk!: TraceState["walk"];
  walkedFns!: TraceState["walkedFns"];

  constructor(source: {
    workflow: WorkflowProgram;
    table: SiteTable;
    oracle: OrderOracle;
    walk: (trace: TraceState, node: ts.Node, chain: readonly string[]) => void;
  }) {
    const { workflow, table, oracle, walk } = source;
    const iterations = indexIterations(table.iterations);
    const rootSeq = rootSequence();
    const regions = rootSeq.regions;
    const counters = rootSeq.counters;
    const root = rootSeq.root;
    const checker = workflow.program.getTypeChecker();
    const scriptFile = workflow.scriptFile;
    this.actorByCall = indexCalls(table.actors);
    this.askByCall = indexCalls(table.asks);
    this.body = findWorkflowBody(scriptFile);
    this.callByStep = stepCallIndex(table);
    this.candByCall = iterations.byCall;
    this.candByCallback = iterations.byCallback;
    this.checker = checker;
    this.controls = [];
    this.counters = counters;
    this.currentPhase = UNPHASED_ID;
    this.eachCallbackFns = eachCallbackFunctions(iterations.byCall, { oracle, scriptFile });
    this.events = [];
    this.fnStack = [];
    this.frames = [{ region: root, settled: new Set<string>() }];
    this.issued = new Set<string>();
    this.iterationAncestorCache = new Map<ts.Node, Set<ts.Node>>();
    this.joined = new Set<string>();
    this.markerByStatement = markersByStatement(table);
    this.oracle = oracle;
    this.phaseIdByName = new Map<string, string>();
    this.phases = [];
    this.program = workflow.program;
    this.readByCall = indexCalls(table.worldReads);
    this.realSteps = realStepSet(table);
    this.recursive = collectRecursiveFunctions(scriptFile, checker, oracle.applications);
    this.regionByStatement = new Map<ts.Node, string>();
    this.regions = regions;
    this.returnTargets = [];
    this.throwTargets = [];
    this.root = root;
    this.sccLoopByDecl = new Map<ts.Node, string>();
    this.scriptFile = scriptFile;
    this.stepsBySymbol = new Map<ts.Symbol, Set<string>>();
    this.strands = [];
    this.strandsBySymbol = new Map<ts.Symbol, Set<string>>();
    this.toScriptLoc = workflow.toScriptLoc;
    this.walk = (node, chain) => {
      walk(this, node, chain);
    };
    this.walkedFns = new Set<ts.Node>();
  }
}

/** Build indexes and the root `seq` region. `walk` is bound so visitors can recurse. */
export function createTraceState(
  workflow: WorkflowProgram,
  table: SiteTable,
  oracle: OrderOracle,
  walk: (trace: TraceState, node: ts.Node, chain: readonly string[]) => void,
): TraceState {
  return new WalkTrace({ workflow, table, oracle, walk });
}

export function locOf(trace: TraceState, node: ts.Node): ScriptLoc {
  return trace.toScriptLoc(node.getStart(trace.scriptFile));
}

export function innermost(trace: TraceState, chain: readonly string[]): string {
  const last = chain.at(-1);
  return last === undefined ? trace.root : last;
}

export function issue(trace: TraceState, step: string, chain: readonly string[]): void {
  trace.issued.add(step);
  const owner = innermostOpenStrand(trace);
  if (owner !== undefined) owner.issued.add(step);
  const event: IssueEvent = { at: "issue", phase: trace.currentPhase, regions: chain, step };
  trace.events.push(event);
}

export function jump(
  trace: TraceState,
  kind: JumpKind,
  target: string,
  chain: readonly string[],
): void {
  const event: JumpEvent = { at: "jump", kind, phase: trace.currentPhase, regions: chain, target };
  trace.events.push(event);
}

/** Issue ids at or after `mark`, first occurrence order. */
export function issuesSince(trace: TraceState, mark: number): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const event of trace.events.slice(mark)) {
    if (event.at !== "issue" || seen.has(event.step)) continue;
    seen.add(event.step);
    found.push(event.step);
  }
  return found;
}

// First reachable trimmed name mints phase#N. A repeated name reuses it.
// A missing or blank name mints nothing.
export function phaseIdOf(trace: TraceState, marker: PhaseMarkerSite): string | undefined {
  const trimmed = marker.name === undefined ? "" : marker.name.trim();
  if (trimmed.length === 0) return undefined;
  const known = trace.phaseIdByName.get(trimmed);
  if (known !== undefined) return known;
  const minted = `phase#${String(trace.phases.length + 1)}`;
  trace.phaseIdByName.set(trimmed, minted);
  trace.phases.push({ id: minted, loc: marker.loc, name: trimmed });
  return minted;
}
