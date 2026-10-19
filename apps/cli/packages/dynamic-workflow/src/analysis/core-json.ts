// SPDX-License-Identifier: Apache-2.0

import type { OrderTrace } from "./causality-order.js";
import type { AnalysisCore, CoreSites } from "./core.js";
import type { TaintOcc } from "./domain.js";

// JSON shape of an analysis core. Maps become ordered pairs so insertion order
// survives `JSON.stringify`. A missing join-port type is `null` in JSON and
// `undefined` again after decode; other absent fields stay absent.

const FORMAT_VERSION = 1 as const;

export type MapEntries<V> = Array<[string, V]>;

type OccRows = MapEntries<TaintOcc[]>;
type PortCells = (string | null)[];
type PortRows = MapEntries<PortCells>;
type TypeRows = MapEntries<string>;

interface FactTablesJson {
  askData: OccRows;
  askActor: OccRows;
  worldReadData: OccRows;
  joinIn: OccRows;
  fanoutIn: OccRows;
  returnData: TaintOcc[];
}

interface TypeTablesJson {
  siteType: TypeRows;
  joinPortTypes: PortRows;
}

export interface AnalysisCoreJson {
  version: typeof FORMAT_VERSION;
  sites: CoreSites;
  facts: FactTablesJson;
  trace: OrderTrace;
  types: TypeTablesJson;
}

function pairsFrom<V>(table: Map<string, V>): MapEntries<V> {
  const pairs: MapEntries<V> = [];
  for (const [key, value] of table) {
    const row: [string, V] = [key, value];
    pairs.push(row);
  }
  return pairs;
}

function tableFrom<V>(pairs: MapEntries<V>): Map<string, V> {
  const table = new Map<string, V>();
  for (const [key, value] of pairs) table.set(key, value);
  return table;
}

function encodePorts(table: Map<string, (string | undefined)[]>): PortRows {
  const pairs: PortRows = [];
  for (const [id, ports] of table) {
    const encoded: PortCells = [];
    for (const port of ports) {
      const cell: string | null = port === undefined ? null : port;
      encoded.push(cell);
    }
    pairs.push([id, encoded]);
  }
  return pairs;
}

function decodePorts(pairs: PortRows): Map<string, (string | undefined)[]> {
  const table = new Map<string, (string | undefined)[]>();
  for (const [id, ports] of pairs) {
    const decoded: (string | undefined)[] = [];
    for (const port of ports) {
      decoded.push(port === null ? undefined : port);
    }
    table.set(id, decoded);
  }
  return table;
}

function rejectVersion(version: number): never {
  const seen = String(version);
  const expected = String(FORMAT_VERSION);
  throw new Error("unsupported AnalysisCoreJson version " + seen + " (expected " + expected + ")");
}

export function encodeAnalysisCore(core: AnalysisCore): AnalysisCoreJson {
  const facts: FactTablesJson = {
    askActor: pairsFrom(core.facts.askActor),
    askData: pairsFrom(core.facts.askData),
    fanoutIn: pairsFrom(core.facts.fanoutIn),
    joinIn: pairsFrom(core.facts.joinIn),
    returnData: core.facts.returnData,
    worldReadData: pairsFrom(core.facts.worldReadData),
  };
  const types: TypeTablesJson = {
    joinPortTypes: encodePorts(core.types.joinPortTypes),
    siteType: pairsFrom(core.types.siteType),
  };
  const encoded: AnalysisCoreJson = {
    facts,
    sites: core.sites,
    trace: core.trace,
    types,
    version: FORMAT_VERSION,
  };
  return encoded;
}

export function decodeAnalysisCore(json: AnalysisCoreJson): AnalysisCore {
  if (json.version !== FORMAT_VERSION) rejectVersion(json.version);
  const facts = json.facts;
  const types = json.types;
  return {
    facts: {
      askActor: tableFrom(facts.askActor),
      askData: tableFrom(facts.askData),
      fanoutIn: tableFrom(facts.fanoutIn),
      joinIn: tableFrom(facts.joinIn),
      returnData: facts.returnData,
      worldReadData: tableFrom(facts.worldReadData),
    },
    sites: json.sites,
    trace: json.trace,
    types: {
      joinPortTypes: decodePorts(types.joinPortTypes),
      siteType: tableFrom(types.siteType),
    },
  };
}
