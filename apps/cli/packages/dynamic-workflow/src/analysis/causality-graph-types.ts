// SPDX-License-Identifier: Apache-2.0

import type { RegionKind } from "./constants.js";
import type { OrderKind } from "./causality-reduce.js";
import type { SiteLoc, NamePattern } from "./types.js";

export type StepKind = "ask" | "world-read";
export type Certainty = "always" | "maybe";

export const WORKSPACE_LANE = "workspace";
export const UNKNOWN_LANE = "unknown";
export const SINK_ID = "sink";

export interface Step {
  id: string;
  kind: StepKind;
  label: string;
  labelPattern?: NamePattern;
  loc: SiteLoc;
  lane: string;
  lanes?: string[];
  source?: string;
  region: string;
  certainty: Certainty;
  phase?: string;
  repeat?: "stack" | "serial";
}

export interface Region {
  id: string;
  kind: RegionKind;
  parent?: string;
  loc?: SiteLoc;
  bound?: number;
  label?: string;
}

export interface OrderEdge {
  from: string;
  to: string;
  kind: OrderKind;
  certainty: Certainty;
  exact?: boolean;
}

export interface Lane {
  id: string;
  name?: string;
  namePattern?: NamePattern;
  loc?: SiteLoc;
  families?: string[];
}

export interface Phase {
  id: string;
  name?: string;
  loc?: SiteLoc;
}

export interface CausalityGraph {
  steps: Step[];
  regions: Region[];
  lanes: Lane[];
  edges: OrderEdge[];
  sink?: { fedBy: string[] };
  phases?: Phase[];
  phaseEdges?: OrderEdge[];
}

export interface Fact {
  from: string;
  to: string;
  kind: OrderKind;
  certainty: Certainty;
  exact?: boolean;
  carryOf?: Exclude<OrderKind, "carry">;
  toPhases?: Set<string>;
  viaJump?: true;
}
