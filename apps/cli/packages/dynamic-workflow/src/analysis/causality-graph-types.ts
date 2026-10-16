// SPDX-License-Identifier: Apache-2.0

import type { RegionKind } from "./constants.js";
import type { OrderKind } from "./causality-reduce.js";
import type { SiteLoc, NamePattern } from "./types.js";

// Step operation kinds within causality projections.
export type StepKind = "ask" | "world-read";

// Certainty of edge or step execution.
export type Certainty = "always" | "maybe";

export const WORKSPACE_LANE = "workspace";
export const UNKNOWN_LANE = "unknown";
export const SINK_ID = "sink";

// Represents an individual executed task step.
export interface Step {
  readonly id: string;
  readonly kind: StepKind;
  readonly label: string;
  readonly labelPattern?: NamePattern;
  readonly loc: SiteLoc;
  readonly lane: string;
  readonly lanes?: string[];
  readonly source?: string;
  readonly region: string;
  readonly certainty: Certainty;
  readonly phase?: string;
  readonly repeat?: "stack" | "serial";
}

// Hierarchical region scoping execution blocks.
export interface Region {
  readonly id: string;
  readonly kind: RegionKind;
  readonly parent?: string;
  readonly loc?: SiteLoc;
  readonly bound?: number;
  readonly label?: string;
}

// Causal order edge connecting two steps.
export interface OrderEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: OrderKind;
  readonly certainty: Certainty;
  readonly exact?: boolean;
}

// Lane representation for actor or environment concurrency lanes.
export interface Lane {
  readonly id: string;
  readonly name?: string;
  readonly namePattern?: NamePattern;
  readonly loc?: SiteLoc;
  readonly families?: string[];
}

// Workflow execution phase representation.
export interface Phase {
  readonly id: string;
  readonly name?: string;
  readonly loc?: SiteLoc;
}

// Complete causality graph structure.
export interface CausalityGraph {
  readonly steps: Step[];
  readonly regions: Region[];
  readonly lanes: Lane[];
  readonly edges: OrderEdge[];
  readonly sink?: { fedBy: string[] };
  readonly phases?: Phase[];
  readonly phaseEdges?: OrderEdge[];
}

// Discovered temporal or causal fact during analysis.
export interface Fact {
  readonly from: string;
  readonly to: string;
  readonly kind: OrderKind;
  readonly certainty: Certainty;
  readonly exact?: boolean;
  readonly carryOf?: Exclude<OrderKind, "carry">;
  readonly toPhases?: Set<string>;
  readonly viaJump?: true;
}
