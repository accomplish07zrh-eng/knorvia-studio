// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import type { WorkflowProgram } from "../compiler/compile.js";
import type { ActorSite, AskSite, IterationCandidate, SiteTable } from "./sites.js";
import {
  provisionalFanoutId,
  type PromotedFanout,
  type TaintFacts,
  type TaintOcc,
} from "./domain.js";
import { computeArtifactTypes, type ArtifactTypes } from "./artifact-types.js";
import { Evaluator } from "./taint.js";
import { traceOrder, type OrderTrace } from "./causality-order.js";
import { literalCardinality } from "./fanout-cardinality.js";
import type { ApplicationVia } from "./state.js";
import type {
  AnalysisCore,
  CoreActorSite,
  CoreAskSite,
  CoreFacts,
  CoreFanoutSite,
  CoreSimpleSite,
  CoreSites,
  CoreTypes,
} from "./core.js";

// One script interpretation. Taint runs to a fixpoint first: settle judgements
// need converged facts, so the temporal walk is a single post-pass over the
// same state. A gen-only monotone fixpoint does not depend on visitation order,
// which is why that walk is not a second semantics. Minting is the last use of
// raw offsets and the checker: `within`, final fan-out ids, and artifact types.

type Applications = ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>;

interface HalfOpen {
  start: number;
  end: number;
}

interface TaggedSpan extends HalfOpen {
  id: string;
}

function finalFanoutName(index: number): string {
  return `fan-out#${index + 1}`;
}

function assignFanoutIds(promoted: readonly { id: string }[]): Map<string, string> {
  const ids = new Map<string, string>();
  let index = 0;
  while (index < promoted.length) {
    const row = promoted[index];
    if (row !== undefined) ids.set(row.id, finalFanoutName(index));
    index += 1;
  }
  return ids;
}

function boundsOf(scriptFile: ts.SourceFile, node: ts.Node): HalfOpen {
  return { start: node.getStart(scriptFile), end: node.getEnd() };
}

function covers(span: HalfOpen, pos: number): boolean {
  return pos >= span.start && pos < span.end;
}

function seedSpans(
  cand: IterationCandidate,
  scriptFile: ts.SourceFile,
  applications: Applications,
): HalfOpen[] {
  const seeds = [boundsOf(scriptFile, cand.body)];
  const call = cand.call;
  if (call === undefined) return seeds;
  const applied = applications.get(call);
  if (applied === undefined) return seeds;
  // A non-literal callback has no steps in the argument expression. The
  // functions applied at the call are the bodies that actually run.
  for (const [fn, via] of applied) {
    if (via !== "argument") continue;
    seeds.push(boundsOf(scriptFile, fn));
  }
  return seeds;
}

function pullApplied(
  span: HalfOpen,
  acc: HalfOpen[],
  seen: Set<ts.Node>,
  scriptFile: ts.SourceFile,
  applications: Applications,
): void {
  for (const [site, fns] of applications) {
    if (!covers(span, site.getStart(scriptFile))) continue;
    for (const fn of fns.keys()) {
      if (seen.has(fn)) continue;
      seen.add(fn);
      acc.push(boundsOf(scriptFile, fn));
    }
  }
}

// Worklist: every function applied at a call inside an already-included span
// joins the set, transitively. Seeds are not pre-marked, matching the original
// discovery order (a seed can also be re-discovered from a call).
function closeApplications(
  seeds: readonly HalfOpen[],
  scriptFile: ts.SourceFile,
  applications: Applications,
): HalfOpen[] {
  const acc = seeds.map((span) => ({ start: span.start, end: span.end }));
  const seen = new Set<ts.Node>();
  let cursor = 0;
  while (cursor < acc.length) {
    const span = acc[cursor];
    cursor += 1;
    if (span === undefined) continue;
    pullApplied(span, acc, seen, scriptFile, applications);
  }
  return acc;
}

function promotedRegions(
  table: SiteTable,
  scriptFile: ts.SourceFile,
  fanoutId: Map<string, string>,
  applications: Applications,
): TaggedSpan[] {
  const collected: TaggedSpan[] = [];
  for (const cand of table.iterations) {
    const id = fanoutId.get(provisionalFanoutId(cand.order));
    if (id === undefined) continue;
    const spans = closeApplications(
      seedSpans(cand, scriptFile, applications),
      scriptFile,
      applications,
    );
    let index = 0;
    while (index < spans.length) {
      const span = spans[index];
      index += 1;
      if (span === undefined) continue;
      collected.push({ end: span.end, id, start: span.start });
    }
  }
  return collected;
}

// Innermost containing span: the greatest start offset. Equal starts keep the
// earlier span so tie-breaking stays stable.
function tightestId(spans: readonly TaggedSpan[], pos: number): string | undefined {
  let best: TaggedSpan | undefined;
  for (const span of spans) {
    if (!covers(span, pos)) continue;
    if (best !== undefined && span.start <= best.start) continue;
    best = span;
  }
  return best === undefined ? undefined : best.id;
}

function enclosingAt(
  spans: readonly TaggedSpan[],
  scriptFile: ts.SourceFile,
  node: ts.Node,
): string | undefined {
  return tightestId(spans, node.getStart(scriptFile));
}

function askSite(site: AskSite, within: string | undefined): CoreAskSite {
  const entry = { id: site.id, label: site.label } as CoreAskSite;
  if (site.labelPattern !== undefined) entry.labelPattern = site.labelPattern;
  entry.loc = site.loc;
  entry.order = site.order;
  if (within !== undefined) entry.within = within;
  return entry;
}

function simpleSite(
  site: { id: string; label: string; loc: CoreSimpleSite["loc"]; order: number; call: ts.Node },
  spans: readonly TaggedSpan[],
  scriptFile: ts.SourceFile,
): CoreSimpleSite {
  const entry = { id: site.id, label: site.label, loc: site.loc } as CoreSimpleSite;
  entry.order = site.order;
  const within = enclosingAt(spans, scriptFile, site.call);
  if (within !== undefined) entry.within = within;
  return entry;
}

function actorSite(
  site: ActorSite,
  spans: readonly TaggedSpan[],
  scriptFile: ts.SourceFile,
): CoreActorSite {
  const entry = { id: site.id, loc: site.loc } as CoreActorSite;
  if (site.name !== undefined) entry.name = site.name;
  if (site.namePattern !== undefined) entry.namePattern = site.namePattern;
  entry.order = site.order;
  const within = enclosingAt(spans, scriptFile, site.call);
  if (within !== undefined) entry.within = within;
  return entry;
}

function fanoutSite(
  fanout: PromotedFanout,
  cand: IterationCandidate | undefined,
  fanoutId: Map<string, string>,
  spans: readonly TaggedSpan[],
  scriptFile: ts.SourceFile,
  checker: ts.TypeChecker,
): CoreFanoutSite {
  // Containment is anchored at the iterated expression, which sits outside the
  // candidate body, so a fan-out does not report itself.
  const cardinality = cand === undefined ? undefined : literalCardinality(cand.iterated, checker);
  const within = cand === undefined ? undefined : enclosingAt(spans, scriptFile, cand.iterated);
  const entry: CoreFanoutSite = {
    id: fanoutId.get(fanout.id) as string,
    label: fanout.label,
    loc: fanout.loc,
    order: fanout.order,
  };
  if (within !== undefined) entry.within = within;
  if (cardinality !== undefined) entry.cardinality = cardinality;
  return entry;
}

function renameOcc(occ: TaintOcc, rename: (site: string) => string): TaintOcc {
  const next: TaintOcc = { exact: occ.exact, site: rename(occ.site) };
  if (occ.port !== undefined) next.port = occ.port;
  return next;
}

function renameOccs(occs: readonly TaintOcc[], rename: (site: string) => string): TaintOcc[] {
  const out: TaintOcc[] = [];
  let index = 0;
  while (index < occs.length) {
    const occ = occs[index];
    index += 1;
    if (occ !== undefined) out.push(renameOcc(occ, rename));
  }
  return out;
}

function renameKeyed(
  map: Map<string, TaintOcc[]>,
  rename: (site: string) => string,
): Map<string, TaintOcc[]> {
  const out = new Map<string, TaintOcc[]>();
  for (const [sink, occs] of map) out.set(sink, renameOccs(occs, rename));
  return out;
}

// A fan-out sink whose provisional id never promoted is not a graph node.
function renameFanoutEdges(
  facts: TaintFacts,
  fanoutId: Map<string, string>,
  rename: (site: string) => string,
): Map<string, TaintOcc[]> {
  const fanoutIn = new Map<string, TaintOcc[]>();
  for (const [provId, occs] of facts.fanoutIn) {
    const finalId = fanoutId.get(provId);
    if (finalId === undefined) continue;
    fanoutIn.set(finalId, renameOccs(occs, rename));
  }
  return fanoutIn;
}

function mintFacts(
  facts: TaintFacts,
  fanoutId: Map<string, string>,
  rename: (site: string) => string,
): CoreFacts {
  return {
    askActor: renameKeyed(facts.askActor, rename),
    askData: renameKeyed(facts.askData, rename),
    fanoutIn: renameFanoutEdges(facts, fanoutId, rename),
    joinIn: renameKeyed(facts.joinIn, rename),
    returnData: renameOccs(facts.returnData, rename),
    worldReadData: renameKeyed(facts.worldReadData, rename),
  };
}

function mintTypes(types: ArtifactTypes, rename: (site: string) => string): CoreTypes {
  const siteType = new Map<string, string>();
  for (const [id, typeName] of types.siteType) siteType.set(rename(id), typeName);
  return { joinPortTypes: types.joinPortTypes, siteType };
}

function mintCore(
  workflow: WorkflowProgram,
  table: SiteTable,
  facts: TaintFacts,
  trace: OrderTrace,
  applications: Applications,
): AnalysisCore {
  const { scriptFile } = workflow;
  const fanoutId = assignFanoutIds(facts.promoted);
  const rename = (site: string): string => fanoutId.get(site) ?? site;
  const spans = promotedRegions(table, scriptFile, fanoutId, applications);
  const checker = workflow.program.getTypeChecker();
  const candByOrder = new Map(table.iterations.map((cand) => [cand.order, cand]));
  const asks = table.asks.map((site) => askSite(site, enclosingAt(spans, scriptFile, site.call)));
  const actors = table.actors.map((site) => actorSite(site, spans, scriptFile));
  const fanouts = facts.promoted.map((fanout) =>
    fanoutSite(fanout, candByOrder.get(fanout.order), fanoutId, spans, scriptFile, checker),
  );
  const sites: CoreSites = {
    actors,
    asks,
    fanouts,
    joins: table.joins.map((site) => simpleSite(site, spans, scriptFile)),
    worldReads: table.worldReads.map((site) => simpleSite(site, spans, scriptFile)),
  };
  return {
    facts: mintFacts(facts, fanoutId, rename),
    sites,
    trace,
    types: mintTypes(computeArtifactTypes(workflow, table), rename),
  };
}

export function interpret(workflow: WorkflowProgram, table: SiteTable): AnalysisCore {
  const evaluator = new Evaluator(workflow, table);
  evaluator.converge();
  const facts = evaluator.s.emitFacts();
  const oracle = evaluator.s.emitOracle();
  const trace = traceOrder(workflow, table, oracle);
  return mintCore(workflow, table, facts, trace, oracle.applications);
}
