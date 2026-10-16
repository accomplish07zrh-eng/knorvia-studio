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

export function applicationsAt(
  trace: Pick<TraceState, "oracle" | "scriptFile">,
  node: ts.Node,
  via: ApplicationVia,
): ScriptFunction[] {
  const recorded = trace.oracle.applications.get(node);
  if (recorded === undefined) return [];
  const matched: ScriptFunction[] = [];
  for (const [fn, how] of recorded) {
    if (how !== via) continue;
    const decl = asScriptFunction(fn, trace.scriptFile);
    if (decl !== undefined) matched.push(decl);
  }
  return matched;
}

export function openRegion(
  trace: Pick<TraceState, "counters" | "regions">,
  kind: TraceRegionKind,
  parent: string | undefined,
  extra: {
    entered: boolean;
    loc?: ScriptLoc;
    bound?: number;
    label?: string;
    exhaustive?: boolean;
    fallthrough?: boolean;
    detached?: boolean;
    recursive?: boolean;
    strand?: true;
  },
): string {
  const serial = (trace.counters.get(kind) ?? 0) + 1;
  trace.counters.set(kind, serial);
  const id = kind + "#" + String(serial);
  const region = parent === undefined ? { id, kind, ...extra } : { id, kind, parent, ...extra };
  trace.regions.push(region);
  return id;
}

function indexCalls<T extends { call: ts.Node; id: string }>(
  rows: readonly T[],
): Map<ts.Node, string> {
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
  oracle: OrderOracle,
  scriptFile: ts.SourceFile,
): Set<ts.Node> {
  const fns = new Set<ts.Node>();
  for (const call of calls.keys()) {
    for (const fn of applicationsAt({ oracle, scriptFile }, call, "argument")) fns.add(fn);
  }
  return fns;
}

function stepCallIndex(table: SiteTable): Map<string, ts.Node> {
  const index = new Map<string, ts.Node>();
  const absorb = (rows: readonly { id: string; call: ts.Node }[]): void => {
    for (const row of rows) index.set(row.id, row.call);
  };
  absorb(table.asks);
  absorb(table.worldReads);
  return index;
}

function realStepSet(table: SiteTable): Set<string> {
  const ids = new Set<string>();
  for (const site of table.asks) ids.add(site.id);
  for (const site of table.worldReads) ids.add(site.id);
  return ids;
}

function markersByStatement(table: SiteTable): Map<ts.Node, PhaseMarkerSite> {
  const markers = new Map<ts.Node, PhaseMarkerSite>();
  for (const marker of table.phases) {
    const parent = marker.call.parent;
    if (ts.isExpressionStatement(parent)) markers.set(parent, marker);
  }
  return markers;
}

/** Build indexes and the root `seq` region. `walk` is bound so visitors can recurse. */
export function createTraceState(
  workflow: WorkflowProgram,
  table: SiteTable,
  oracle: OrderOracle,
  walk: (trace: TraceState, node: ts.Node, chain: readonly string[]) => void,
): TraceState {
  const { program, scriptFile, toScriptLoc } = workflow;
  const checker = program.getTypeChecker();
  const body = findWorkflowBody(scriptFile);
  const iterations = indexIterations(table.iterations);
  const regions: OrderRegion[] = [];
  const counters = new Map<TraceRegionKind, number>();
  const root = openRegion({ counters, regions }, "seq", undefined, { entered: true });
  const trace: TraceState = {
    actorByCall: indexCalls(table.actors),
    askByCall: indexCalls(table.asks),
    body,
    callByStep: stepCallIndex(table),
    candByCall: iterations.byCall,
    candByCallback: iterations.byCallback,
    checker,
    controls: [],
    counters,
    currentPhase: UNPHASED_ID,
    eachCallbackFns: eachCallbackFunctions(iterations.byCall, oracle, scriptFile),
    events: [],
    fnStack: [],
    frames: [{ region: root, settled: new Set<string>() }],
    issued: new Set<string>(),
    iterationAncestorCache: new Map<ts.Node, Set<ts.Node>>(),
    joined: new Set<string>(),
    markerByStatement: markersByStatement(table),
    oracle,
    phaseIdByName: new Map<string, string>(),
    phases: [],
    program,
    readByCall: indexCalls(table.worldReads),
    realSteps: realStepSet(table),
    recursive: collectRecursiveFunctions(scriptFile, checker, oracle.applications),
    regionByStatement: new Map<ts.Node, string>(),
    regions,
    returnTargets: [],
    root,
    sccLoopByDecl: new Map<ts.Node, string>(),
    scriptFile,
    stepsBySymbol: new Map<ts.Symbol, Set<string>>(),
    strands: [],
    strandsBySymbol: new Map<ts.Symbol, Set<string>>(),
    throwTargets: [],
    toScriptLoc,
    walk: (node, chain) => {
      walk(trace, node, chain);
    },
    walkedFns: new Set<ts.Node>(),
  };
  return trace;
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
  const event: JumpEvent = {
    at: "jump",
    kind,
    phase: trace.currentPhase,
    regions: chain,
    target,
  };
  trace.events.push(event);
}

/** Issue ids at or after `mark`, first occurrence order. */
export function issuesSince(trace: TraceState, mark: number): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  let cursor = mark;
  while (cursor < trace.events.length) {
    const event = trace.events[cursor];
    cursor += 1;
    if (event === undefined || event.at !== "issue" || seen.has(event.step)) continue;
    seen.add(event.step);
    found.push(event.step);
  }
  return found;
}

/**
 * Mint `phase#N` on the first reachable marker of a trimmed name. A repeated name
 * reuses that id. A missing or blank name mints nothing and does not change phase.
 */
export function phaseIdOf(trace: TraceState, marker: PhaseMarkerSite): string | undefined {
  const raw = marker.name;
  const trimmed = raw === undefined ? undefined : raw.trim();
  if (trimmed === undefined || trimmed.length === 0) return undefined;
  const known = trace.phaseIdByName.get(trimmed);
  if (known !== undefined) return known;
  const id = "phase#" + String(trace.phases.length + 1);
  trace.phaseIdByName.set(trimmed, id);
  trace.phases.push({ id, loc: marker.loc, name: trimmed });
  return id;
}
