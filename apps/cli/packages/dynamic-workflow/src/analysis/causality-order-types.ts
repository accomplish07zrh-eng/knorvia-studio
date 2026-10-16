// SPDX-License-Identifier: Apache-2.0

import type ts from "typescript";
import type { ScriptLoc } from "../compiler/compile.js";
import type { TaintOcc, ApplicationVia } from "./domain.js";
import type { TraceRegionKind, JumpKind } from "./constants.js";

export interface OrderOracle {
  awaitSettles: Map<number, TaintOcc[]>;
  guardReads: Map<number, TaintOcc[]>;
  applications: ReadonlyMap<ts.Node, ReadonlyMap<ts.Node, ApplicationVia>>;
}

export interface OrderRegion {
  id: string;
  kind: TraceRegionKind;
  parent?: string;
  loc?: ScriptLoc;
  bound?: number;
  label?: string;
  entered: boolean;
  exhaustive?: boolean;
  recursive?: boolean;
  fallthrough?: boolean;
  detached?: boolean;
  strand?: true;
}

export interface PhaseInfo {
  id: string;
  name: string;
  loc: ScriptLoc;
}

export interface IssueEvent {
  at: "issue";
  step: string;
  regions: readonly string[];
  phase: string;
}

export interface SettleEvent {
  at: "settle";
  steps: readonly string[];
  maybe: boolean;
  regions: readonly string[];
  joins?: string[];
}

export interface ActorEvent {
  at: "actor";
  actor: string;
  regions: readonly string[];
}

export interface MarkEvent {
  at: "mark";
  phase: string;
  regions: readonly string[];
}

export interface JumpEvent {
  at: "jump";
  kind: JumpKind;
  target: string;
  regions: readonly string[];
  phase: string;
}

export type OrderEvent = IssueEvent | SettleEvent | ActorEvent | MarkEvent | JumpEvent;

export interface ControlFact {
  controllers: readonly string[];
  maybeControllers: readonly string[];
  region: string;
}

export interface OrderTrace {
  events: OrderEvent[];
  regions: OrderRegion[];
  controls: ControlFact[];
  root: string;
  phases: PhaseInfo[];
}
