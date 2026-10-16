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

/**
 * Fixpoint storage for one taint run: site indexes, the environment, summaries,
 * and sink accumulators. Updates are monotone. `changed` is raised only when a
 * stored value actually grows, except where a fresh binding adopts its value.
 */
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
  readonly applications = mapOf<ts.Node, Map<ts.Node, ApplicationVia>>();
  // One object per AST node for the whole fixpoint. may-alias dedups by identity, so a
  // fresh join/conditional/literal value each pass would grow forever.
  readonly joinResults = mapOf<ts.CallExpression, AbstractValue>();
  readonly condPlaces = mapOf<ts.ConditionalExpression, AbstractValue>();
  readonly literalPlaces = mapOf<LiteralNode, AbstractValue>();
  readonly fnId = mapOf<ts.Node, number>();
  readonly fnParamSymbols = mapOf<number, (ts.Symbol | undefined)[]>();
  readonly functions: ts.Node[] = [];
  readonly callbackNodes = setOf<ts.Node>();
  readonly settersByProp = mapOf<string, number[]>();
  readonly classInstances = mapOf<ts.Node, AbstractValue>();
  readonly classes: ts.Node[] = [];
  readonly env = mapOf<ts.Symbol, AbstractValue>();
  readonly summaries = mapOf<number, AbstractValue>();
  readonly paramActuals = mapOf<string, AbstractValue>();
  readonly phCallActuals = mapOf<string, AbstractValue>();
  readonly reachSet = setOf<string>();
  readonly calledFns = mapOf<string, Set<number>>();
  readonly promotedOrders = setOf<number>();
  readonly reduceAcc = mapOf<number, AbstractValue>();
  readonly askInstr = mapOf<string, AbstractValue>();
  readonly askRecv = mapOf<string, AbstractValue>();
  readonly worldRead = mapOf<string, AbstractValue>();
  readonly joinInByPort = mapOf<string, Map<number, AbstractValue>>();
  readonly fanoutInVal = mapOf<string, AbstractValue>();
  readonly awaitVal = mapOf<number, AbstractValue>();
  readonly guardVal = mapOf<number, AbstractValue>();
  readonly returnVal = emptyValue();
  // One script-wide thrown set. Every throw joins it; every catch reads all of it.
  readonly thrownVal = emptyValue();

  changed = false;

  constructor(workflow: WorkflowProgram, table: SiteTable) {
    this.table = table;
    this.checker = workflow.program.getTypeChecker();
    this.program = workflow.program;
    this.scriptFile = workflow.scriptFile;
    this.body = findWorkflowBody(workflow.scriptFile);
    this.indexSites();
    this.collectFunctions();
  }

  private indexSites(): void {
    this.indexCalls(this.table.asks, (site) => {
      this.askByCall.set(site.call, site.id);
      this.askSites.set(site.id, { instructions: site.instructions, receiver: site.receiver });
    });
    this.indexCalls(this.table.worldReads, (site) => {
      this.worldByCall.set(site.call, { args: site.args, id: site.id });
    });
    this.indexCalls(this.table.joins, (site) => {
      this.joinByCall.set(site.call, { arg: site.arg, id: site.id });
    });
    this.indexCalls(this.table.actors, (site) => {
      this.actorByCall.set(site.call, site.id);
    });
    let index = 0;
    const iterations = this.table.iterations;
    while (index < iterations.length) {
      const cand = iterations[index];
      index += 1;
      if (cand !== undefined) this.indexIteration(cand);
    }
  }

  private indexCalls<T>(rows: readonly T[], visit: (row: T, index: number) => void): void {
    let index = 0;
    while (index < rows.length) {
      const row = rows[index];
      const at = index;
      index += 1;
      if (row !== undefined) visit(row, at);
    }
  }

  private indexIteration(cand: IterationCandidate): void {
    switch (cand.form) {
      case "array-method": {
        const call = cand.call;
        if (call === undefined) return;
        this.candByCall.set(call, cand);
        const callback = cand.callback;
        if (callback !== undefined) this.callbackNodes.add(callback);
        return;
      }
      case "for-of":
        this.candByForOf.set(cand.body.parent, cand);
        return;
      default:
        return;
    }
  }

  private collectFunctions(): void {
    const stack: ts.Node[] = [];
    this.pushReverse(stack, this.body.statements);
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) continue;
      this.noteClass(node);
      this.noteFunction(node);
      const kids: ts.Node[] = [];
      ts.forEachChild(node, (child) => {
        kids.push(child);
      });
      this.pushReverse(stack, kids);
    }
  }

  private pushReverse(stack: ts.Node[], nodes: readonly ts.Node[]): void {
    let index = nodes.length;
    while (index > 0) {
      index -= 1;
      const node = nodes[index];
      if (node !== undefined) stack.push(node);
    }
  }

  private noteClass(node: ts.Node): void {
    if (!ts.isClassDeclaration(node) && !ts.isClassExpression(node)) return;
    this.classInstances.set(node, emptyValue());
    this.classes.push(node);
  }

  private noteFunction(node: ts.Node): void {
    if (!isFunctionLike(node) || this.callbackNodes.has(node)) return;
    const id = this.functions.length;
    this.fnId.set(node, id);
    this.functions.push(node);
    const decl = node as ts.SignatureDeclaration;
    const symbols: (ts.Symbol | undefined)[] = [];
    let index = 0;
    while (index < decl.parameters.length) {
      const param = decl.parameters[index];
      const name = param?.name;
      symbols.push(
        name !== undefined && ts.isIdentifier(name)
          ? this.checker.getSymbolAtLocation(name)
          : undefined,
      );
      index += 1;
    }
    this.fnParamSymbols.set(id, symbols);
    this.noteSetter(node, id);
  }

  private noteSetter(node: ts.Node, id: number): void {
    if (!ts.isSetAccessorDeclaration(node) || ts.isComputedPropertyName(node.name)) return;
    const name = node.name.getText(this.scriptFile);
    const list = this.settersByProp.get(name);
    if (list === undefined) {
      this.settersByProp.set(name, [id]);
      return;
    }
    list.push(id);
  }

  // A fresh symbol adopts `value` by reference. A later bind weak-merges into that slot.
  bindSymbol(sym: ts.Symbol, value: AbstractValue): void {
    const existing = this.env.get(sym);
    if (existing === undefined) {
      this.env.set(sym, value);
      this.changed = true;
      return;
    }
    if (existing === value) return;
    this.touch(mergeInto(existing, value));
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

  /**
   * Keep the first evaluation's object. Fields that already point at live places stay
   * shared across passes; later evaluations weak-merge into that same object.
   * Minting an empty slot instead would drop those aliases. Creating the place does
   * not by itself raise `changed` — only a later merge that grows it does.
   */
  literalPlaceOf(
    node: ts.ObjectLiteralExpression | ts.ArrayLiteralExpression,
    fresh: AbstractValue,
  ): AbstractValue {
    const place = this.literalPlaces.get(node);
    if (place === undefined) {
      this.literalPlaces.set(node, fresh);
      return fresh;
    }
    this.touch(mergeInto(place, fresh));
    return place;
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
    const ports = this.ensureSlot(this.joinInByPort, id, () => new Map());
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

  // Every enclosing region, not only the innermost. An inner candidate must not hide
  // the caller function from reachability, or a sibling fan-out can fail to promote.
  markCalled(regionStack: string[], id: number): void {
    this.indexCalls(regionStack, (region) => {
      const called = this.ensureSlot(this.calledFns, region, () => new Set());
      if (called.has(id)) return;
      called.add(id);
      this.changed = true;
    });
  }

  // Not a fixpoint signal. `callee` wins over `argument` for the same function at one site.
  recordApplication(site: ts.Node, fn: ts.Node, via: ApplicationVia): void {
    const applied = this.ensureSlot(this.applications, site, () => new Map());
    if (applied.get(fn) === "callee") return;
    applied.set(fn, via);
  }

  markFacade(regionStack: string[]): void {
    this.indexCalls(regionStack, (region) => {
      if (this.reachSet.has(region)) return;
      this.reachSet.add(region);
      this.changed = true;
    });
  }

  propagateReachability(): void {
    let grew = true;
    while (grew) grew = this.pullReachOnce();
  }

  recomputePromotion(): void {
    this.indexCalls(this.table.iterations, (cand) => {
      if (this.promotedOrders.has(cand.order)) return;
      if (!this.reachSet.has("cand@" + String(cand.order))) return;
      this.promotedOrders.add(cand.order);
      this.changed = true;
    });
  }

  emitFacts(): TaintFacts {
    const askData = this.project(this.askInstr, false);
    const askActor = this.project(this.askRecv, true);
    const worldReadData = this.project(this.worldRead, false);
    const joinIn = this.joinOccurrences();
    const fanoutIn = this.project(this.fanoutInVal, false);
    const promoted = this.promotedFanouts();
    const returnData = this.keepOccs(this.returnVal, false);
    return { askActor, askData, fanoutIn, joinIn, promoted, returnData, worldReadData };
  }

  emitOracle(): {
    awaitSettles: Map<number, TaintOcc[]>;
    guardReads: Map<number, TaintOcc[]>;
    applications: ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>;
  } {
    const awaitSettles = this.project(this.awaitVal, false);
    const guardReads = this.project(this.guardVal, false);
    return { applications: this.applications, awaitSettles, guardReads };
  }

  bindPlaceholderParams(fn: ts.Node, id: number): void {
    const decl = fn as ts.SignatureDeclaration;
    this.indexCalls(this.fnParamSymbols.get(id) ?? [], (sym, index) => {
      if (sym !== undefined) this.bindFormal(sym, id, index, decl.parameters[index]);
    });
  }

  private bindFormal(
    sym: ts.Symbol,
    id: number,
    param: number,
    formal: ts.ParameterDeclaration | undefined,
  ): void {
    const val = emptyValue();
    const ph: Placeholder = { fnId: id, param };
    if (formal?.dotDotDotToken !== undefined) ph.rest = true;
    addPlaceholder(val, ph);
    this.bindSymbol(sym, val);
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
    let grew = false;
    for (const [region, fns] of this.calledFns) {
      if (this.reachSet.has(region) || !this.callsReached(fns)) continue;
      this.reachSet.add(region);
      this.changed = true;
      grew = true;
    }
    return grew;
  }

  private callsReached(fns: Set<number>): boolean {
    for (const id of fns) {
      if (this.reachSet.has("fn@" + String(id))) return true;
    }
    return false;
  }

  private keepOccs(value: AbstractValue, actors: boolean): TaintOcc[] {
    const occs = resolveOccurrences(this.paramActuals, value);
    return occs.filter((occ) => isActorSite(occ.site) === actors);
  }

  private project<K>(source: Map<K, AbstractValue>, actors: boolean): Map<K, TaintOcc[]> {
    const out = new Map<K, TaintOcc[]>();
    for (const [id, value] of source) out.set(id, this.keepOccs(value, actors));
    return out;
  }

  private joinOccurrences(): Map<string, TaintOcc[]> {
    const joinIn = new Map<string, TaintOcc[]>();
    for (const [id, ports] of this.joinInByPort) joinIn.set(id, this.flattenPorts(ports));
    return joinIn;
  }

  private flattenPorts(ports: Map<number, AbstractValue>): TaintOcc[] {
    const occs: TaintOcc[] = [];
    for (const [port, value] of ports) {
      const resolved = this.keepOccs(value, false);
      let index = 0;
      while (index < resolved.length) {
        const occ = resolved[index];
        index += 1;
        if (occ === undefined) continue;
        const row: TaintOcc = { exact: occ.exact, site: occ.site };
        if (port >= 0) row.port = port;
        occs.push(row);
      }
    }
    return occs;
  }

  private promotedFanouts(): PromotedFanout[] {
    const chosen = this.table.iterations.filter((cand) => this.promotedOrders.has(cand.order));
    chosen.sort((left, right) =>
      left.order < right.order ? -1 : left.order > right.order ? 1 : 0,
    );
    return chosen.map((cand) => this.fanoutRow(cand));
  }

  private fanoutRow(cand: IterationCandidate): PromotedFanout {
    const id = provisionalFanoutId(cand.order);
    const label = "fan-out";
    const loc = cand.loc;
    const order = cand.order;
    return { id, label, loc, order };
  }
}
