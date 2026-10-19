// SPDX-License-Identifier: Apache-2.0

import type ts from "typescript";
import type { WorkflowProgram } from "../compiler/compile.js";
import type { SiteTable } from "./sites.js";
import { UNPHASED_ID } from "./constants.js";
import type { OrderOracle, OrderTrace } from "./causality-order-types.js";
import {
  enclosingFunctions,
  functionName,
  type ScriptFunction,
} from "./causality-order-functions.js";
import {
  createTraceState,
  issue,
  locOf,
  openRegion,
  type TraceState,
} from "./causality-order-state.js";
import { walkNode, walkStatements } from "./causality-order-walk.js";

// Region vocabulary and trace types stay re-exported from this module so existing
// `causality-order.js` imports do not move. The walk itself lives in the sibling files.

export {
  UNPHASED_ID,
  type JumpKind,
  type StructuralRegionKind,
  type TraceRegionKind,
} from "./constants.js";

export type {
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
} from "./causality-order-types.js";

interface StepSite {
  id: string;
  call: ts.Node;
  order: number;
}

function orderedSteps(table: SiteTable): StepSite[] {
  const rows: StepSite[] = [];
  for (const site of table.asks) rows.push(site);
  for (const site of table.worldReads) rows.push(site);
  rows.sort((left, right) => left.order - right.order);
  return rows;
}

function unwalkedOwner(trace: TraceState, call: ts.Node): ScriptFunction | undefined {
  const owners = enclosingFunctions(call);
  let cursor = 0;
  while (cursor < owners.length) {
    const owner = owners[cursor];
    cursor += 1;
    if (owner !== undefined && !trace.walkedFns.has(owner)) return owner;
  }
  return undefined;
}

function labelOf(owner: ts.Node): { label: string } | undefined {
  const label = functionName(owner);
  if (label === undefined) return undefined;
  return { label };
}

// Detached bodies have no call site, so they do not inherit a phase. A `return`
// inside one ends that body, not the script. The region is a branch because the
// walk cannot show the body runs.
function walkDetached(trace: TraceState, owner: ScriptFunction): void {
  trace.walkedFns.add(owner);
  trace.fnStack.push(owner);
  const detached = openRegion(trace, "branch", trace.root, {
    detached: true,
    entered: false,
    loc: locOf(trace, owner),
    ...labelOf(owner),
  });
  trace.returnTargets.push(detached);
  trace.walk(owner.body as ts.Node, [trace.root, detached]);
  trace.returnTargets.pop();
  trace.fnStack.pop();
}

function adoptDetached(trace: TraceState, sites: readonly StepSite[]): boolean {
  let moved = false;
  let cursor = 0;
  while (cursor < sites.length) {
    const site = sites[cursor];
    cursor += 1;
    if (site === undefined || trace.issued.has(site.id)) continue;
    const owner = unwalkedOwner(trace, site.call);
    if (owner === undefined) continue;
    walkDetached(trace, owner);
    moved = true;
  }
  return moved;
}

function issueUnplaced(trace: TraceState, sites: readonly StepSite[]): void {
  let cursor = 0;
  while (cursor < sites.length) {
    const site = sites[cursor];
    cursor += 1;
    if (site !== undefined && !trace.issued.has(site.id)) issue(trace, site.id, [trace.root]);
  }
}

/** Walk the authored body in evaluation order and record the ordering trace. */
export function traceOrder(
  workflow: WorkflowProgram,
  table: SiteTable,
  oracle: OrderOracle,
): OrderTrace {
  const trace = createTraceState(workflow, table, oracle, walkNode);
  walkStatements(trace, trace.body.statements, [trace.root]);
  // Restored phase would still be the root value; the sweep is outside every marker.
  trace.currentPhase = UNPHASED_ID;
  const sites = orderedSteps(table);
  let again = true;
  while (again) again = adoptDetached(trace, sites);
  issueUnplaced(trace, sites);
  return {
    controls: trace.controls,
    events: trace.events,
    phases: trace.phases,
    regions: trace.regions,
    root: trace.root,
  };
}
