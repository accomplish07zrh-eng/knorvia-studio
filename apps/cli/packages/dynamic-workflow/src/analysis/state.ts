// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import type { WorkflowProgram } from "../compiler/compile.js";
import type { IterationCandidate, SiteTable } from "./sites.js";
import {
  addPlaceholder,
  emptyValue,
  findWorkflowBody,
  isActorSite,
  isFunctionLike,
  mergeInto,
  phKey,
  provisionalFanoutId,
  type AbstractValue,
  type Placeholder,
  type PromotedFanout,
  type TaintFacts,
  type TaintOcc,
} from "./domain.js";
import { resolveOccurrences } from "./placeholder-resolution.js";

// Fixpoint storage for one taint run: site indexes, the environment, summaries,
// and sink accumulators. Updates are monotone. `changed` rises when a stored
// value grows. Adopting a fresh binding or a first literal place does not, by
// itself, count as growth of an existing slot — the adoption replaces nothing.
export type ApplicationVia = "callee" | "argument";

type AskSiteInfo = { instructions: ts.Expression | undefined; receiver: ts.Expression };
type WorldSiteInfo = { args: readonly ts.Expression[]; id: string };
type JoinSiteInfo = { arg: ts.Expression | undefined; id: string };
type LiteralNode = ts.ObjectLiteralExpression | ts.ArrayLiteralExpression;

function mapOf<K, V>(): Map<K, V> {
  return new Map();
}

function setOf<T>(): Set<T> {
  return new Set();
}

export class TaintState {
  readonly checker: ts.TypeChecker;
  readonly program: ts.Program;
  readonly scriptFile: ts.SourceFile;
  readonly body: ts.Block;
  readonly table: SiteTable;

  readonly askByCall = mapOf<ts.CallExpression, string>();
  readonly askSites = mapOf<string, AskSiteInfo>();
  readonly worldByCall = mapOf<ts.CallExpression, WorldSiteInfo>();
  readonly joinByCall = mapOf<ts.CallExpression, JoinSiteInfo>();
  readonly actorByCall = mapOf<ts.CallExpression, string>();
  readonly candByCall = mapOf<ts.CallExpression, IterationCandidate>();
  readonly candByForOf = mapOf<ts.Node, IterationCandidate>();
  // Call oracle. `callee` means the callee value held the function. `argument`
  // means a library may invoke a function passed to it. Not a fixpoint input.
  readonly applications = mapOf<ts.Node, Map<ts.Node, ApplicationVia>>();
  // Canonical heap. Join results, conditional places, and container literals are
  // keyed by the AST node and kept for the whole fixpoint. may-alias dedups by
  // object identity, so a fresh value each pass would never saturate.
  readonly joinResults = mapOf<ts.CallExpression, AbstractValue>();
  readonly condPlaces = mapOf<ts.ConditionalExpression, AbstractValue>();
  readonly literalPlaces = mapOf<LiteralNode, AbstractValue>();
  readonly fnId = mapOf<ts.Node, number>();
  readonly fnParamSymbols = mapOf<number, (ts.Symbol | undefined)[]>();
  readonly functions: ts.Node[] = [];
  readonly callbackNodes = setOf<ts.Node>();
  // Set accessors indexed by property name. Any write of that name feeds param 0.
  readonly settersByProp = mapOf<string, number[]>();
  // One instance per class. Static and instance members share it.
  readonly classInstances = mapOf<ts.Node, AbstractValue>();
  readonly classes: ts.Node[] = [];
  readonly env = mapOf<ts.Symbol, AbstractValue>();
  readonly summaries = mapOf<number, AbstractValue>();
  readonly paramActuals = mapOf<string, AbstractValue>();
  // Values that may be passed when a placeholder parameter is itself invoked.
  // Distinct from paramActuals, which records what a function receives when called.
  readonly phCallActuals = mapOf<string, AbstractValue>();
  readonly reachSet = setOf<string>();
  readonly calledFns = mapOf<string, Set<number>>();
  readonly promotedOrders = setOf<number>();
  // Reduce's callback return is a fresh local each pass. This slot carries it.
  readonly reduceAcc = mapOf<number, AbstractValue>();
  readonly askInstr = mapOf<string, AbstractValue>();
  readonly askRecv = mapOf<string, AbstractValue>();
  readonly worldRead = mapOf<string, AbstractValue>();
  readonly joinInByPort = mapOf<string, Map<number, AbstractValue>>();
  readonly fanoutInVal = mapOf<string, AbstractValue>();
  // Oracle sinks keyed by source start offset, not by a site id.
  readonly awaitVal = mapOf<number, AbstractValue>();
  readonly guardVal = mapOf<number, AbstractValue>();
  readonly returnVal = emptyValue();
  // One script-wide thrown set. Every throw joins it; every catch reads all of it.
  readonly thrownVal = emptyValue();

  changed = false;

  constructor(workflow: WorkflowProgram, table: SiteTable) {
    this.table = table;
    const compiled = workflow.program;
    const source = workflow.scriptFile;
    this.checker = compiled.getTypeChecker();
    this.program = compiled;
    this.scriptFile = source;
    this.body = findWorkflowBody(source);
    new SiteCatalog(this).load();
    new FunctionCensus(this).collect(this.body);
  }

  // A fresh symbol adopts `value` by reference. A later bind weak-merges.
  bindSymbol(sym: ts.Symbol, value: AbstractValue): void {
    const prior = this.env.get(sym);
    if (prior === undefined) {
      this.env.set(sym, value);
      this.touch(true);
    } else if (prior !== value) {
      this.touch(mergeInto(prior, value));
    }
  }

  envSlot(sym: ts.Symbol): AbstractValue {
    return this.ensureValue(this.env, sym);
  }

  summaryOf(id: number): AbstractValue {
    return this.ensureValue(this.summaries, id);
  }

  instanceOf(cls: ts.Node): AbstractValue {
    return this.ensureValue(this.classInstances, cls);
  }

  joinResultOf(call: ts.CallExpression): AbstractValue {
    return this.ensureValue(this.joinResults, call);
  }

  condPlaceOf(node: ts.ConditionalExpression): AbstractValue {
    return this.ensureValue(this.condPlaces, node);
  }

  // Keep the first evaluation's object so fields that already point at live
  // places stay shared. Later evaluations weak-merge into that same object.
  // Creating the place does not raise `changed`; only a later growing merge does.
  literalPlaceOf(
    node: ts.ObjectLiteralExpression | ts.ArrayLiteralExpression,
    fresh: AbstractValue,
  ): AbstractValue {
    const kept = this.literalPlaces.get(node);
    if (kept !== undefined) {
      this.touch(mergeInto(kept, fresh));
      return kept;
    }
    this.literalPlaces.set(node, fresh);
    return this.literalPlaces.get(node) ?? fresh;
  }

  mergeReturn(value: AbstractValue): void {
    this.touch(mergeInto(this.returnVal, value));
  }

  mergeThrown(value: AbstractValue): void {
    this.touch(mergeInto(this.thrownVal, value));
  }

  mergeSink<K>(map: Map<K, AbstractValue>, id: K, value: AbstractValue): void {
    this.absorb(map, id, value);
  }

  mergeJoinIn(id: string, port: number, value: AbstractValue): void {
    const ports = this.ensureSlot(this.joinInByPort, id, () => mapOf<number, AbstractValue>());
    this.absorb(ports, port, value);
  }

  addParamActual(id: number, param: number, value: AbstractValue): void {
    this.absorb(this.paramActuals, phKey({ fnId: id, param }), value);
  }

  recordPhCall(key: string, value: AbstractValue): void {
    this.absorb(this.phCallActuals, key, value);
  }

  phCallActualsOf(id: number, param: number): AbstractValue | undefined {
    return this.phCallActuals.get(phKey({ fnId: id, param }));
  }

  reduceAccOf(order: number): AbstractValue {
    return this.ensureValue(this.reduceAcc, order);
  }

  mergeReduceAcc(order: number, value: AbstractValue): void {
    this.touch(mergeInto(this.reduceAccOf(order), value));
  }

  // Every enclosing region, not only the innermost. An inner candidate must not
  // hide the caller function from reachability, or a sibling fan-out fails to promote.
  markCalled(regionStack: string[], id: number): void {
    regionStack.forEach((region) => this.noteCalled(region, id));
  }

  // `callee` wins over `argument` when one function is both. Not a fixpoint signal.
  recordApplication(site: ts.Node, fn: ts.Node, via: ApplicationVia): void {
    const applied = this.ensureSlot(this.applications, site, () => mapOf<ts.Node, ApplicationVia>());
    if (applied.get(fn) === "callee") return;
    applied.set(fn, via);
  }

  markFacade(regionStack: string[]): void {
    regionStack.forEach((region) => this.noteFacade(region));
  }

  propagateReachability(): void {
    let moving = this.pullReachOnce();
    while (moving) moving = this.pullReachOnce();
  }

  recomputePromotion(): void {
    this.table.iterations.forEach((cand) => this.notePromoted(cand));
  }

  emitFacts(): TaintFacts {
    return new FactSheet(this).facts();
  }

  emitOracle(): {
    awaitSettles: Map<number, TaintOcc[]>;
    guardReads: Map<number, TaintOcc[]>;
    applications: ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>;
  } {
    return new FactSheet(this).oracle();
  }

  // A rest formal keeps the rest bit so later substitution gathers every actual
  // from that index up. A non-rest formal stores only fnId and param.
  bindPlaceholderParams(fn: ts.Node, id: number): void {
    const decl = fn as ts.SignatureDeclaration;
    (this.fnParamSymbols.get(id) ?? []).forEach((sym, index) => {
      if (sym !== undefined) this.bindFormal(sym, id, index, decl.parameters[index]);
    });
  }

  private noteCalled(region: string, id: number): void {
    const bucket = this.ensureSlot(this.calledFns, region, () => setOf<number>());
    if (bucket.has(id)) return;
    bucket.add(id);
    this.touch(true);
  }

  private noteFacade(region: string): void {
    if (this.reachSet.has(region)) return;
    this.reachSet.add(region);
    this.touch(true);
  }

  private notePromoted(cand: IterationCandidate): void {
    if (this.promotedOrders.has(cand.order)) return;
    if (this.reachSet.has("cand@" + String(cand.order)) === false) return;
    this.promotedOrders.add(cand.order);
    this.touch(true);
  }

  private bindFormal(sym: ts.Symbol, id: number, param: number, formal: ts.ParameterDeclaration | undefined): void {
    const seeded = emptyValue();
    const ph: Placeholder = { fnId: id, param };
    if (formal?.dotDotDotToken !== undefined) ph.rest = true;
    addPlaceholder(seeded, ph);
    this.bindSymbol(sym, seeded);
  }

  private ensureSlot<K, V>(map: Map<K, V>, key: K, make: () => V): V {
    const found = map.get(key);
    if (found !== undefined) return found;
    const created = make();
    map.set(key, created);
    return created;
  }

  private ensureValue<K>(map: Map<K, AbstractValue>, key: K): AbstractValue {
    return this.ensureSlot(map, key, emptyValue);
  }

  private absorb<K>(map: Map<K, AbstractValue>, key: K, value: AbstractValue): void {
    this.touch(mergeInto(this.ensureValue(map, key), value));
  }

  private touch(grew: boolean): void {
    if (grew) this.changed = true;
  }

  private pullReachOnce(): boolean {
    const fresh: string[] = [];
    this.calledFns.forEach((fns, region) => {
      if (this.reachSet.has(region) === false && this.callsReached(fns)) fresh.push(region);
    });
    fresh.forEach((region) => {
      this.reachSet.add(region);
      this.touch(true);
    });
    return fresh.length > 0;
  }

  private callsReached(fns: Set<number>): boolean {
    for (const id of fns) {
      if (this.reachSet.has("fn@" + String(id))) return true;
    }
    return false;
  }
}

class SiteCatalog {
  constructor(private readonly host: TaintState) {}

  load(): void {
    this.host.table.asks.forEach((site) => {
      this.host.askByCall.set(site.call, site.id);
      this.host.askSites.set(site.id, { instructions: site.instructions, receiver: site.receiver });
    });
    this.host.table.worldReads.forEach((site) => {
      this.host.worldByCall.set(site.call, { args: site.args, id: site.id });
    });
    this.host.table.joins.forEach((site) => {
      this.host.joinByCall.set(site.call, { arg: site.arg, id: site.id });
    });
    this.host.table.actors.forEach((site) => {
      this.host.actorByCall.set(site.call, site.id);
    });
    this.host.table.iterations.forEach((cand) => this.iteration(cand));
  }

  // An inline callback is evaluated in place, so it is not a tracked function.
  // A for-of candidate is keyed by the statement's parent, the loop itself.
  private iteration(cand: IterationCandidate): void {
    if (cand.form === "array-method") this.arrayMethod(cand);
    else if (cand.form === "for-of") this.host.candByForOf.set(cand.body.parent, cand);
  }

  private arrayMethod(cand: IterationCandidate): void {
    const call = cand.call;
    if (call === undefined) return;
    this.host.candByCall.set(call, cand);
    if (cand.callback !== undefined) this.host.callbackNodes.add(cand.callback);
  }
}

class FunctionCensus {
  constructor(private readonly host: TaintState) {}

  collect(root: ts.Block): void {
    const pending: ts.Node[] = [...root.statements].reverse();
    while (pending.length > 0) {
      const node = pending.pop();
      if (node === undefined) continue;
      this.note(node);
      this.enqueue(pending, node);
    }
  }

  // forEachChild stops when the callback returns a value, so the push stays
  // in a block that returns nothing. Otherwise only the first child is walked.
  private enqueue(pending: ts.Node[], node: ts.Node): void {
    const kids: ts.Node[] = [];
    ts.forEachChild(node, (child) => {
      kids.push(child);
    });
    for (let index = kids.length - 1; index >= 0; index -= 1) {
      const child = kids[index];
      if (child !== undefined) pending.push(child);
    }
  }

  private note(node: ts.Node): void {
    this.noteClass(node);
    this.noteFunction(node);
  }

  private noteClass(node: ts.Node): void {
    if (ts.isClassDeclaration(node) === false && ts.isClassExpression(node) === false) return;
    this.host.classInstances.set(node, emptyValue());
    this.host.classes.push(node);
  }

  private noteFunction(node: ts.Node): void {
    if (isFunctionLike(node) === false || this.host.callbackNodes.has(node)) return;
    const id = this.host.functions.length;
    this.host.fnId.set(node, id);
    this.host.functions.push(node);
    this.host.fnParamSymbols.set(id, this.symbols(node as ts.SignatureDeclaration));
    this.noteSetter(node, id);
  }

  private symbols(decl: ts.SignatureDeclaration): (ts.Symbol | undefined)[] {
    return decl.parameters.map((param) => {
      const name = param.name;
      return ts.isIdentifier(name) ? this.host.checker.getSymbolAtLocation(name) : undefined;
    });
  }

  private noteSetter(node: ts.Node, id: number): void {
    if (ts.isSetAccessorDeclaration(node) === false || ts.isComputedPropertyName(node.name)) return;
    const label = node.name.getText(this.host.scriptFile);
    const list = this.host.settersByProp.get(label);
    if (list === undefined) this.host.settersByProp.set(label, [id]);
    else list.push(id);
  }
}

class FactSheet {
  constructor(private readonly host: TaintState) {}

  facts(): TaintFacts {
    const askData = this.project(this.host.askInstr, false);
    const askActor = this.project(this.host.askRecv, true);
    const worldReadData = this.project(this.host.worldRead, false);
    const joinIn = this.joinOccurrences();
    const fanoutIn = this.project(this.host.fanoutInVal, false);
    const promoted = this.promotedFanouts();
    const returnData = this.keepOccs(this.host.returnVal, false);
    return { askActor, askData, fanoutIn, joinIn, promoted, returnData, worldReadData };
  }

  oracle(): {
    awaitSettles: Map<number, TaintOcc[]>;
    guardReads: Map<number, TaintOcc[]>;
    applications: ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>;
  } {
    const awaitSettles = this.project(this.host.awaitVal, false);
    const guardReads = this.project(this.host.guardVal, false);
    const applications = this.host.applications;
    return { applications, awaitSettles, guardReads };
  }

  private keepOccs(value: AbstractValue, actors: boolean): TaintOcc[] {
    return resolveOccurrences(this.host.paramActuals, value).filter((occ) => isActorSite(occ.site) === actors);
  }

  private project<K>(source: Map<K, AbstractValue>, actors: boolean): Map<K, TaintOcc[]> {
    const out = mapOf<K, TaintOcc[]>();
    source.forEach((value, id) => out.set(id, this.keepOccs(value, actors)));
    return out;
  }

  private joinOccurrences(): Map<string, TaintOcc[]> {
    const joinIn = mapOf<string, TaintOcc[]>();
    this.host.joinInByPort.forEach((ports, id) => joinIn.set(id, this.flattenPorts(ports)));
    return joinIn;
  }

  // A negative port is the opaque whole-argument bucket and is omitted.
  private flattenPorts(ports: Map<number, AbstractValue>): TaintOcc[] {
    const rows: TaintOcc[] = [];
    ports.forEach((value, port) => {
      this.keepOccs(value, false).forEach((occ) => {
        const row: TaintOcc = { exact: occ.exact, site: occ.site };
        if (port >= 0) row.port = port;
        rows.push(row);
      });
    });
    return rows;
  }

  private promotedFanouts(): PromotedFanout[] {
    return this.host.table.iterations
      .filter((cand) => this.host.promotedOrders.has(cand.order))
      .sort((left, right) => left.order - right.order)
      .map((cand) => ({
        id: provisionalFanoutId(cand.order),
        label: "fan-out",
        loc: cand.loc,
        order: cand.order,
      }));
  }
}
