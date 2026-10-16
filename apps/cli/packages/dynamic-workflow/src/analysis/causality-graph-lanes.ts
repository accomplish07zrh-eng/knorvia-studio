// SPDX-License-Identifier: Apache-2.0

import { KIND_RANK } from "./causality-reduce.js";
import {
  UNKNOWN_LANE,
  WORKSPACE_LANE,
  type CausalityGraph,
  type Certainty,
  type Fact,
  type OrderEdge,
  type Step,
} from "./causality-graph-types.js";

// Finished-graph lane copies and ordered-pair fact joins. No compiler or I/O.

const MAY_SET_LANE_CAP = 4;
const COPY_SEPARATOR = "~";

interface LaneCopyPlan {
  copies?: Step[];
  original?: Step;
}

interface LaneEndpoint {
  certainty?: Certainty;
  id: string;
  lane?: string;
}

function admitsLaneCopies(unit: Step): boolean {
  const choices = unit.lanes ?? [];
  if (choices.length < 2 || choices.length > MAY_SET_LANE_CAP) return false;
  for (const choice of choices) {
    if (choice === WORKSPACE_LANE || choice === UNKNOWN_LANE) return false;
  }
  return true;
}

function copyForLane(unit: Step, laneName: string): Step {
  const id = unit.id + COPY_SEPARATOR + laneName;
  return {
    ...unit,
    certainty: "maybe",
    id,
    lane: laneName,
    source: unit.id,
  };
}

function indexOriginals(copiesByStep: Map<string, LaneCopyPlan>, units: readonly Step[]): void {
  for (const unit of units) {
    const entry = copiesByStep.get(unit.id);
    if (entry === undefined) {
      copiesByStep.set(unit.id, { original: unit });
      continue;
    }
    entry.original = unit;
  }
}

function resolveLane(copiesByStep: Map<string, LaneCopyPlan>, id: string): readonly LaneEndpoint[] {
  const entry = copiesByStep.get(id);
  if (entry?.copies !== undefined) return entry.copies;
  const original = entry?.original;
  return [{ certainty: original?.certainty, id, lane: original?.lane }];
}

function wireEdge(copiesByStep: Map<string, LaneCopyPlan>, link: OrderEdge): OrderEdge[] {
  const fromCopies = copiesByStep.get(link.from)?.copies;
  const toCopies = copiesByStep.get(link.to)?.copies;
  if (fromCopies === undefined && toCopies === undefined) return [link];
  const routed: OrderEdge[] = [];
  for (const sourceEnd of resolveLane(copiesByStep, link.from)) {
    for (const destEnd of resolveLane(copiesByStep, link.to)) {
      if (link.kind === "fifo" && sourceEnd.lane !== destEnd.lane) continue;
      routed.push({
        ...link,
        certainty: weakest([
          link.certainty,
          sourceEnd.certainty ?? link.certainty,
          destEnd.certainty ?? link.certainty,
        ]),
        from: sourceEnd.id,
        to: destEnd.id,
      });
    }
  }
  return routed;
}

export function expandMaySetLanes(input: CausalityGraph): CausalityGraph {
  const copiesByStep = new Map<string, LaneCopyPlan>();
  for (const unit of input.steps) {
    if (!admitsLaneCopies(unit)) continue;
    const laneNames = unit.lanes ?? [];
    copiesByStep.set(unit.id, { copies: laneNames.map((laneName) => copyForLane(unit, laneName)) });
  }
  if (copiesByStep.size === 0) return input;

  indexOriginals(copiesByStep, input.steps);
  const routed: OrderEdge[] = [];
  for (const link of input.edges) routed.push(...wireEdge(copiesByStep, link));
  const expanded = input.steps.flatMap((unit) => copiesByStep.get(unit.id)?.copies ?? [unit]);
  const sink = input.sink;
  return {
    edges: routed,
    lanes: input.lanes,
    regions: input.regions,
    steps: expanded,
    ...(sink === undefined
      ? {}
      : {
          sink: {
            fedBy: sink.fedBy.flatMap((id) => resolveLane(copiesByStep, id).map((node) => node.id)),
          },
        }),
  };
}

function storedFact(row: Fact): Fact {
  if (row.toPhases === undefined) return { ...row };
  return { ...row, toPhases: new Set(row.toPhases) };
}

function chosenKind(kept: Fact, row: Fact): Fact["kind"] {
  if (KIND_RANK[row.kind] > KIND_RANK[kept.kind]) return row.kind;
  return kept.kind;
}

function chosenExact(kept: Fact, row: Fact): boolean | undefined {
  if (row.exact !== undefined && kept.exact === undefined) return row.exact;
  if (row.exact === true) return true;
  return kept.exact;
}

function joinFact(kept: Fact, row: Fact): Fact {
  const kind = chosenKind(kept, row);
  const exact = chosenExact(kept, row);
  const certainty = row.certainty === "maybe" ? "maybe" : kept.certainty;
  const merged = { ...kept };
  if (kind !== kept.kind) merged.kind = kind;
  if (exact !== kept.exact) merged.exact = exact;
  if (certainty !== kept.certainty) merged.certainty = certainty;
  if (row.viaJump !== true) delete merged.viaJump;
  if (row.toPhases === undefined) delete merged.toPhases;
  else if (merged.toPhases !== undefined) {
    for (const phase of row.toPhases) merged.toPhases.add(phase);
  }
  return merged;
}

export function dedupeFacts(rows: readonly Fact[]): Fact[] {
  const byPair = new Map<string, Fact>();
  for (const row of rows) {
    const key = row.from + "|" + row.to;
    const kept = byPair.get(key);
    byPair.set(key, kept === undefined ? storedFact(row) : joinFact(kept, row));
  }
  return [...byPair.values()];
}

export function weakest(samples: readonly Certainty[]): Certainty {
  if (samples.includes("maybe")) return "maybe";
  return "always";
}
