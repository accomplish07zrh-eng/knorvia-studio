// SPDX-License-Identifier: Apache-2.0

import type ts from "typescript";
import type { ScriptLoc } from "../compiler/compile.js";
import type { JumpKind, TraceRegionKind } from "./constants.js";
import type { TaintOcc } from "./domain.js";
import type { ApplicationVia } from "./state.js";

// Read-only view of the converged taint fixpoint. Keys are source positions
// (`node.getStart`). The walk never mutates these maps.
export interface OrderOracle {
  readonly applications: ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>;
  readonly awaitSettles: Map<number, TaintOcc[]>;
  readonly guardReads: Map<number, TaintOcc[]>;
}

// One node in the region tree. `entered` is true when the parent cannot skip the body
// (do/while, a for with a positive literal bound, or an inlined call).
export interface OrderRegion {
  readonly bound?: number;
  readonly detached?: boolean;
  readonly entered: boolean;
  readonly exhaustive?: boolean;
  readonly fallthrough?: boolean;
  readonly id: string;
  readonly kind: TraceRegionKind;
  readonly label?: string;
  readonly loc?: ScriptLoc;
  readonly parent?: string;
  readonly recursive?: boolean;
  readonly strand?: true;
}

// First time the walk observes a phase name. Later markers with the same name reuse `id`.
export interface PhaseInfo {
  readonly id: string;
  readonly loc: ScriptLoc;
  readonly name: string;
}

export interface IssueEvent {
  readonly at: "issue";
  readonly phase: string;
  readonly regions: ReadonlyArray<string>;
  readonly step: string;
}

// `steps` is empty when the barrier only joins strands. `joins` lists those strand
// region ids in join order and is omitted when there are none.
export interface SettleEvent {
  readonly at: "settle";
  readonly joins?: ReadonlyArray<string>;
  readonly maybe: boolean;
  readonly regions: ReadonlyArray<string>;
  readonly steps: ReadonlyArray<string>;
}

export interface ActorEvent {
  readonly actor: string;
  readonly at: "actor";
  readonly regions: ReadonlyArray<string>;
}

export interface MarkEvent {
  readonly at: "mark";
  readonly phase: string;
  readonly regions: ReadonlyArray<string>;
}

export interface JumpEvent {
  readonly at: "jump";
  readonly kind: JumpKind;
  readonly phase: string;
  readonly regions: ReadonlyArray<string>;
  readonly target: string;
}

export type OrderEvent = IssueEvent | SettleEvent | ActorEvent | MarkEvent | JumpEvent;

export interface ControlFact {
  readonly controllers: ReadonlyArray<string>;
  readonly maybeControllers: ReadonlyArray<string>;
  readonly region: string;
}

export interface OrderTrace {
  readonly controls: ReadonlyArray<ControlFact>;
  readonly events: ReadonlyArray<OrderEvent>;
  readonly phases: ReadonlyArray<PhaseInfo>;
  readonly regions: ReadonlyArray<OrderRegion>;
  readonly root: string;
}
