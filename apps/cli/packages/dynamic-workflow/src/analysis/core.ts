// SPDX-License-Identifier: Apache-2.0

import type { ScriptLoc } from "../compiler/compile.js";
import type {
  ActorEvent,
  ControlFact,
  IssueEvent,
  JumpEvent,
  MarkEvent,
  OrderEvent,
  OrderRegion,
  OrderTrace,
  PhaseInfo,
  SettleEvent,
} from "./causality-order.js";
import type { TaintOcc } from "./domain.js";
import type { NamePattern } from "./types.js";

// Text form of an analysis core. Fact sinks are ordered by UTF-16 code unit
// (ASCII order for site ids). Trace events stay in the order they were recorded.

type SiteId = string;
type OrderNo = number;
type LabelText = string;
type PatternSlot = NamePattern;
type Cardinality = number;
type OccList = TaintOcc[];
type OccMap = Map<SiteId, OccList>;
type TypeMap = Map<SiteId, string>;
type PortTypes = (string | undefined)[];
type PortMap = Map<SiteId, PortTypes>;
type AskSites = CoreAskSite[];
type SimpleSites = CoreSimpleSite[];
type ActorSites = CoreActorSite[];
type FanoutSites = CoreFanoutSite[];
type CoreSiteTable = CoreSites;
type CoreFactTable = CoreFacts;
type CoreTrace = OrderTrace;
type CoreTypeTable = CoreTypes;

interface OrderedId {
  id: SiteId;
  order: OrderNo;
}

interface Placed {
  loc: ScriptLoc;
  within?: SiteId;
}

/** An `ask` site with no AST pointer. `within` is the enclosing promoted fan-out. */
export interface CoreAskSite extends OrderedId, Placed {
  label: LabelText;
  labelPattern?: PatternSlot;
}

/** A world-read or join site with no AST pointer. */
export interface CoreSimpleSite extends OrderedId, Placed {
  label: LabelText;
}

/** An `agent()` site with no AST pointer. */
export interface CoreActorSite extends OrderedId, Placed {
  name?: LabelText;
  namePattern?: PatternSlot;
}

/**
 * A promoted fan-out under its final id. `cardinality` is set only when the
 * iterated collection is a static literal (or an unread const binding of one).
 */
export interface CoreFanoutSite extends OrderedId, Placed {
  label: LabelText;
  cardinality?: Cardinality;
}

export interface CoreSites {
  asks: AskSites;
  worldReads: SimpleSites;
  joins: SimpleSites;
  actors: ActorSites;
  fanouts: FanoutSites;
}

/** Taint edges with every site id already renamed to its final form. */
export interface CoreFacts {
  askData: OccMap;
  askActor: OccMap;
  worldReadData: OccMap;
  joinIn: OccMap;
  fanoutIn: OccMap;
  returnData: OccList;
}

/** Checker answers materialized as strings, keyed by final site id. */
export interface CoreTypes {
  siteType: TypeMap;
  joinPortTypes: PortMap;
}

export interface AnalysisCore {
  sites: CoreSiteTable;
  facts: CoreFactTable;
  trace: CoreTrace;
  types: CoreTypeTable;
}

interface OrderedLine {
  order: number;
  text: string;
}

export function isActorSite(site: string): boolean {
  const marker = "actor" + "#";
  return site.indexOf(marker) === 0;
}

function assemble(parts: readonly string[]): string {
  let text = "";
  let cursor = 0;
  while (cursor < parts.length) {
    const part = parts[cursor];
    if (part !== undefined) text += part;
    cursor += 1;
  }
  return text;
}

function quoteField(text: string): string {
  let escaped = "";
  for (const ch of text) {
    if (ch === '"') escaped += "\\" + '"';
    else escaped += ch;
  }
  return '"' + escaped + '"';
}

function codeUnitOrder(left: string, right: string): number {
  const span = left.length < right.length ? left.length : right.length;
  let index = 0;
  while (index < span) {
    const gap = left.charCodeAt(index) - right.charCodeAt(index);
    if (gap !== 0) return gap;
    index += 1;
  }
  return left.length - right.length;
}

function atLoc(line: number, column: number): string {
  return "@" + String(line) + ":" + String(column);
}

function withinSuffix(within: string | undefined): string {
  if (within === undefined) return "";
  return " within=" + within;
}

function typeSuffix(types: TypeMap, id: string): string {
  const found = types.get(id);
  if (found === undefined) return "";
  return " type=" + quoteField(found);
}

function patternSuffix(pattern: PatternSlot | undefined): string {
  if (pattern === undefined) return "";
  const parts: string[] = [];
  if (pattern.head !== undefined) parts.push(" head=", quoteField(pattern.head));
  if (pattern.tail !== undefined) parts.push(" tail=", quoteField(pattern.tail));
  return assemble(parts);
}

function exactWord(exact: boolean): string {
  if (exact) return "exact";
  return "inexact";
}

function occurrenceText(occ: TaintOcc): string {
  const parts: string[] = [occ.site, " ", exactWord(occ.exact)];
  if (occ.port !== undefined) parts.push(" port=", String(occ.port));
  return assemble(parts);
}

function portsSuffix(ports: PortTypes | undefined): string {
  if (ports === undefined) return "";
  const cells: string[] = [];
  for (const port of ports) {
    if (port === undefined) cells.push("-");
    else cells.push(quoteField(port));
  }
  return " ports=" + cells.join(",");
}

function collectAsks(core: AnalysisCore, ordered: OrderedLine[]): void {
  for (const site of core.sites.asks) {
    ordered.push({
      order: site.order,
      text: assemble([
        "ask ",
        site.id,
        " ",
        quoteField(site.label),
        patternSuffix(site.labelPattern),
        " ",
        atLoc(site.loc.line, site.loc.column),
        " order=",
        String(site.order),
        withinSuffix(site.within),
        typeSuffix(core.types.siteType, site.id),
      ]),
    });
  }
}

function collectWorldReads(core: AnalysisCore, ordered: OrderedLine[]): void {
  for (const site of core.sites.worldReads) {
    ordered.push({
      order: site.order,
      text: assemble([
        "world-read ",
        site.id,
        " ",
        quoteField(site.label),
        " ",
        atLoc(site.loc.line, site.loc.column),
        " order=",
        String(site.order),
        withinSuffix(site.within),
        typeSuffix(core.types.siteType, site.id),
      ]),
    });
  }
}

function collectJoins(core: AnalysisCore, ordered: OrderedLine[]): void {
  for (const site of core.sites.joins) {
    ordered.push({
      order: site.order,
      text: assemble([
        "join ",
        site.id,
        " ",
        quoteField(site.label),
        " ",
        atLoc(site.loc.line, site.loc.column),
        " order=",
        String(site.order),
        withinSuffix(site.within),
        typeSuffix(core.types.siteType, site.id),
        portsSuffix(core.types.joinPortTypes.get(site.id)),
      ]),
    });
  }
}

function collectActors(core: AnalysisCore, ordered: OrderedLine[]): void {
  for (const site of core.sites.actors) {
    const parts: string[] = ["actor ", site.id];
    if (site.name !== undefined) parts.push(" ", quoteField(site.name));
    parts.push(
      patternSuffix(site.namePattern),
      " ",
      atLoc(site.loc.line, site.loc.column),
      " order=",
      String(site.order),
      withinSuffix(site.within),
    );
    ordered.push({ order: site.order, text: assemble(parts) });
  }
}

function collectFanouts(core: AnalysisCore, ordered: OrderedLine[]): void {
  for (const site of core.sites.fanouts) {
    const parts: string[] = [
      "fan-out ",
      site.id,
      " ",
      quoteField(site.label),
      " ",
      atLoc(site.loc.line, site.loc.column),
      " order=",
      String(site.order),
      withinSuffix(site.within),
    ];
    if (site.cardinality !== undefined) parts.push(" count=", String(site.cardinality));
    parts.push(typeSuffix(core.types.siteType, site.id));
    ordered.push({ order: site.order, text: assemble(parts) });
  }
}

function renderSites(core: AnalysisCore): string[] {
  const ordered: OrderedLine[] = [];
  collectAsks(core, ordered);
  collectWorldReads(core, ordered);
  collectJoins(core, ordered);
  collectActors(core, ordered);
  collectFanouts(core, ordered);
  ordered.sort(function bySourceOrder(left, right) {
    return left.order - right.order;
  });
  const lines: string[] = [];
  for (const entry of ordered) lines.push(entry.text);
  return lines;
}

function appendFactGroup(lines: string[], kind: string, table: OccMap): void {
  const rows: Array<[string, OccList]> = [];
  for (const [sink, occs] of table) rows.push([sink, occs]);
  rows.sort(function bySinkName(left, right) {
    return codeUnitOrder(left[0], right[0]);
  });
  for (const [sink, occs] of rows) {
    for (const occ of occs) {
      lines.push(assemble(["fact ", kind, " ", sink, " <- ", occurrenceText(occ)]));
    }
  }
}

function renderFacts(facts: CoreFacts): string[] {
  const lines: string[] = [];
  appendFactGroup(lines, "ask-data", facts.askData);
  appendFactGroup(lines, "ask-actor", facts.askActor);
  appendFactGroup(lines, "world-read-data", facts.worldReadData);
  appendFactGroup(lines, "join-in", facts.joinIn);
  appendFactGroup(lines, "fan-out-in", facts.fanoutIn);
  for (const occ of facts.returnData) {
    lines.push(assemble(["fact return <- ", occurrenceText(occ)]));
  }
  return lines;
}

function chainOf(regions: readonly string[]): string {
  if (regions.length === 0) return "";
  return " in=" + regions.join(">");
}

function issueLine(event: IssueEvent, where: string): string {
  return assemble(["issue ", event.step, where, " phase=", event.phase]);
}

function settleLine(event: SettleEvent, where: string): string {
  // A barrier that only joins strands names no steps, so the step token is omitted.
  const parts: string[] = ["settle"];
  if (event.maybe) parts.push(" maybe");
  if (event.steps.length > 0) parts.push(" ", event.steps.join(","));
  parts.push(where);
  const joined = event.joins;
  if (joined !== undefined && joined.length > 0) parts.push(" joins=", joined.join(","));
  return assemble(parts);
}

function markLine(event: MarkEvent, where: string): string {
  return assemble(["mark ", event.phase, where]);
}

function jumpLine(event: JumpEvent, where: string): string {
  return assemble(["jump ", event.kind, " ", event.target, where, " phase=", event.phase]);
}

function spawnLine(event: ActorEvent, where: string): string {
  return assemble(["spawn ", event.actor, where]);
}

function renderEvent(event: OrderEvent): string {
  const where = chainOf(event.regions);
  switch (event.at) {
    case "issue":
      return issueLine(event, where);
    case "settle":
      return settleLine(event, where);
    case "mark":
      return markLine(event, where);
    case "jump":
      return jumpLine(event, where);
    case "actor":
      return spawnLine(event, where);
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

function renderTraceRegion(region: OrderRegion): string {
  const parts: string[] = ["region ", region.id, " ", region.kind];
  if (region.parent !== undefined) parts.push(" parent=", region.parent);
  if (region.loc !== undefined) parts.push(" ", atLoc(region.loc.line, region.loc.column));
  if (region.entered) parts.push(" entered");
  if (region.exhaustive === true) parts.push(" exhaustive");
  if (region.fallthrough === true) parts.push(" fallthrough");
  if (region.recursive === true) parts.push(" recursive");
  if (region.detached === true) parts.push(" detached");
  if (region.bound !== undefined) parts.push(" bound=", String(region.bound));
  if (region.label !== undefined) parts.push(" label=", quoteField(region.label));
  if (region.strand === true) parts.push(" strand");
  return assemble(parts);
}

function renderControl(control: ControlFact): string {
  const parts: string[] = ["control ", control.region];
  if (control.controllers.length > 0) parts.push(" by=", control.controllers.join(","));
  if (control.maybeControllers.length > 0) {
    parts.push(" maybe=", control.maybeControllers.join(","));
  }
  return assemble(parts);
}

function renderPhaseLine(phase: PhaseInfo): string {
  return assemble([
    "phase ",
    phase.id,
    " ",
    quoteField(phase.name),
    " ",
    atLoc(phase.loc.line, phase.loc.column),
  ]);
}

export function serializeCore(core: AnalysisCore): string {
  const lines: string[] = [];
  for (const line of renderSites(core)) lines.push(line);
  for (const line of renderFacts(core.facts)) lines.push(line);
  for (const region of core.trace.regions) lines.push(renderTraceRegion(region));
  for (const event of core.trace.events) lines.push(renderEvent(event));
  for (const control of core.trace.controls) lines.push(renderControl(control));
  for (const phase of core.trace.phases) lines.push(renderPhaseLine(phase));
  return lines.join("\n") + "\n";
}
