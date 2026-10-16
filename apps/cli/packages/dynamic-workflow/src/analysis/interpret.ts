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

// Taint reaches a fixpoint before the ordering walk. Fan-out ids and `within`
// are projected from that fixpoint; the walk itself does not feed the gen-only facts.

type Applications = ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>;

class Range {
  constructor(
    readonly start: number,
    readonly end: number,
  ) {}

  covers(pos: number): boolean {
    return pos >= this.start && pos < this.end;
  }

  static around(scriptFile: ts.SourceFile, node: ts.Node): Range {
    return new Range(node.getStart(scriptFile), node.getEnd());
  }
}

class MarkedRange extends Range {
  constructor(
    readonly fanoutId: string,
    start: number,
    end: number,
  ) {
    super(start, end);
  }
}

/** FIFO closure. Seeds are stored but not marked, so a seed function can be rediscovered. */
class SpanClosure {
  private readonly acc: Range[] = [];
  private readonly seen = new Set<ts.Node>();

  constructor(
    seeds: readonly Range[],
    private readonly scriptFile: ts.SourceFile,
    private readonly applications: Applications,
  ) {
    for (const span of seeds) this.acc.push(new Range(span.start, span.end));
  }

  close(): Range[] {
    let cursor = 0;
    while (cursor < this.acc.length) {
      const span = this.acc[cursor];
      cursor += 1;
      if (span !== undefined) this.absorb(span);
    }
    return this.acc;
  }

  private absorb(span: Range): void {
    this.applications.forEach((fns, site) => {
      if (!span.covers(site.getStart(this.scriptFile))) return;
      fns.forEach((_via, fn) => {
        if (this.seen.has(fn)) return;
        this.seen.add(fn);
        this.acc.push(Range.around(this.scriptFile, fn));
      });
    });
  }
}

class FanoutLayout {
  readonly ids: Map<string, string>;
  readonly spans: MarkedRange[];
  private readonly candByOrder: Map<number, IterationCandidate>;

  constructor(
    private readonly scriptFile: ts.SourceFile,
    private readonly table: SiteTable,
    promoted: readonly { id: string }[],
    private readonly applications: Applications,
  ) {
    this.ids = new Map();
    promoted.forEach((row, index) => {
      this.ids.set(row.id, FanoutLayout.finalName(index));
    });
    this.candByOrder = new Map(table.iterations.map((cand) => [cand.order, cand]));
    this.spans = this.tagRegions();
  }

  private static finalName(index: number): string {
    return `fan-out#${index + 1}`;
  }

  rename(site: string): string {
    return this.ids.get(site) ?? site;
  }

  within(node: ts.Node): string | undefined {
    const pos = node.getStart(this.scriptFile);
    let best: MarkedRange | undefined;
    for (const span of this.spans) {
      if (!span.covers(pos)) continue;
      if (best !== undefined && span.start <= best.start) continue;
      best = span;
    }
    if (best === undefined) return undefined;
    return best.fanoutId;
  }

  candidate(order: number): IterationCandidate | undefined {
    return this.candByOrder.get(order);
  }

  private seedsFor(cand: IterationCandidate): Range[] {
    const seeds = [Range.around(this.scriptFile, cand.body)];
    const call = cand.call;
    if (call === undefined) return seeds;
    const applied = this.applications.get(call);
    if (applied === undefined) return seeds;
    applied.forEach((via, fn) => {
      if (via === "argument") seeds.push(Range.around(this.scriptFile, fn));
    });
    return seeds;
  }

  private tagRegions(): MarkedRange[] {
    const collected: MarkedRange[] = [];
    for (const cand of this.table.iterations) {
      const fanoutId = this.ids.get(provisionalFanoutId(cand.order));
      if (fanoutId === undefined) continue;
      const spans = new SpanClosure(
        this.seedsFor(cand),
        this.scriptFile,
        this.applications,
      ).close();
      for (const span of spans) collected.push(new MarkedRange(fanoutId, span.start, span.end));
    }
    return collected;
  }
}

function assignWithin<T extends { within?: string }>(entry: T, within: string | undefined): T {
  if (within !== undefined) entry.within = within;
  return entry;
}

function askSite(site: AskSite, within: string | undefined): CoreAskSite {
  const entry = { id: site.id, label: site.label } as CoreAskSite;
  if (site.labelPattern !== undefined) entry.labelPattern = site.labelPattern;
  entry.loc = site.loc;
  entry.order = site.order;
  return assignWithin(entry, within);
}

function simpleSite(
  site: { id: string; label: string; loc: CoreSimpleSite["loc"]; order: number; call: ts.Node },
  layout: FanoutLayout,
): CoreSimpleSite {
  const entry = { id: site.id, label: site.label, loc: site.loc } as CoreSimpleSite;
  entry.order = site.order;
  return assignWithin(entry, layout.within(site.call));
}

function actorSite(site: ActorSite, layout: FanoutLayout): CoreActorSite {
  const entry = { id: site.id, loc: site.loc } as CoreActorSite;
  if (site.name !== undefined) entry.name = site.name;
  if (site.namePattern !== undefined) entry.namePattern = site.namePattern;
  entry.order = site.order;
  return assignWithin(entry, layout.within(site.call));
}

function fanoutSite(
  fanout: PromotedFanout,
  layout: FanoutLayout,
  checker: ts.TypeChecker,
): CoreFanoutSite {
  const cand = layout.candidate(fanout.order);
  const entry = { id: layout.ids.get(fanout.id) as string } as CoreFanoutSite;
  entry.label = fanout.label;
  entry.loc = fanout.loc;
  entry.order = fanout.order;
  if (cand !== undefined) {
    const cardinality = literalCardinality(cand.iterated, checker);
    const within = layout.within(cand.iterated);
    if (within !== undefined) entry.within = within;
    if (cardinality !== undefined) entry.cardinality = cardinality;
  }
  return entry;
}

function renameOcc(occ: TaintOcc, rename: (site: string) => string): TaintOcc {
  const next: TaintOcc = { exact: occ.exact, site: rename(occ.site) };
  if (occ.port !== undefined) next.port = occ.port;
  return next;
}

function renameOccs(occs: readonly TaintOcc[], rename: (site: string) => string): TaintOcc[] {
  return occs.map((occ) => renameOcc(occ, rename));
}

function renameKeyed(
  map: Map<string, TaintOcc[]>,
  rename: (site: string) => string,
): Map<string, TaintOcc[]> {
  const out = new Map<string, TaintOcc[]>();
  map.forEach((occs, sink) => {
    out.set(sink, renameOccs(occs, rename));
  });
  return out;
}

class CoreAssembly {
  private readonly layout: FanoutLayout;
  private readonly checker: ts.TypeChecker;
  private readonly rename: (site: string) => string;

  constructor(
    private readonly workflow: WorkflowProgram,
    private readonly table: SiteTable,
    private readonly facts: TaintFacts,
    private readonly trace: OrderTrace,
    applications: Applications,
  ) {
    this.layout = new FanoutLayout(workflow.scriptFile, table, facts.promoted, applications);
    this.checker = workflow.program.getTypeChecker();
    this.rename = (site) => this.layout.rename(site);
  }

  project(): AnalysisCore {
    const sites: CoreSites = {
      actors: this.table.actors.map((site) => actorSite(site, this.layout)),
      asks: this.table.asks.map((site) => askSite(site, this.layout.within(site.call))),
      fanouts: this.facts.promoted.map((fanout) => fanoutSite(fanout, this.layout, this.checker)),
      joins: this.table.joins.map((site) => simpleSite(site, this.layout)),
      worldReads: this.table.worldReads.map((site) => simpleSite(site, this.layout)),
    };
    return {
      facts: this.projectFacts(),
      sites,
      trace: this.trace,
      types: this.projectTypes(computeArtifactTypes(this.workflow, this.table)),
    };
  }

  private projectFacts(): CoreFacts {
    const rename = this.rename;
    const fanoutIn = new Map<string, TaintOcc[]>();
    this.facts.fanoutIn.forEach((occs, provId) => {
      const finalId = this.layout.ids.get(provId);
      if (finalId === undefined) return;
      fanoutIn.set(finalId, renameOccs(occs, rename));
    });
    return {
      askActor: renameKeyed(this.facts.askActor, rename),
      askData: renameKeyed(this.facts.askData, rename),
      fanoutIn,
      joinIn: renameKeyed(this.facts.joinIn, rename),
      returnData: renameOccs(this.facts.returnData, rename),
      worldReadData: renameKeyed(this.facts.worldReadData, rename),
    };
  }

  private projectTypes(types: ArtifactTypes): CoreTypes {
    const siteType = new Map(
      Array.from(types.siteType, ([id, typeName]) => [this.rename(id), typeName]),
    );
    return { joinPortTypes: types.joinPortTypes, siteType };
  }
}

class AnalysisPass {
  private facts: TaintFacts | undefined;
  private oracle: ReturnType<Evaluator["s"]["emitOracle"]> | undefined;

  constructor(
    private readonly workflow: WorkflowProgram,
    private readonly table: SiteTable,
  ) {}

  fixTaint(): void {
    const evaluator = new Evaluator(this.workflow, this.table);
    evaluator.converge();
    this.facts = evaluator.s.emitFacts();
    this.oracle = evaluator.s.emitOracle();
  }

  project(): AnalysisCore {
    const facts = this.facts;
    const oracle = this.oracle;
    if (facts === undefined || oracle === undefined) {
      throw new Error("taint fixpoint has not been reached");
    }
    const trace = traceOrder(this.workflow, this.table, oracle);
    return new CoreAssembly(this.workflow, this.table, facts, trace, oracle.applications).project();
  }
}

export function interpret(workflow: WorkflowProgram, table: SiteTable): AnalysisCore {
  const pass = new AnalysisPass(workflow, table);
  pass.fixTaint();
  return pass.project();
}
