// SPDX-License-Identifier: Apache-2.0

import type { AskNode, SchedulerHost } from "./scheduler-types.js";
import type { InstanceRef, Violation } from "./types.js";
import { REPAIR_ATTEMPTS, WorkflowError } from "./types.js";

export interface SubmitSeam {
  readonly host: SchedulerHost;
  readonly liveNode: (instance: InstanceRef) => AskNode | undefined;
  readonly settleOk: (node: AskNode, artifact: unknown) => void;
  readonly settleFailed: (node: AskNode, error: WorkflowError) => void;
}

const REPAIR_BUDGET_EXHAUSTED =
  "submit_result failed schema validation repeatedly and the repair budget is exhausted.";
const RESULT_MISSING = "The typed ask ended without a submit_result call, so there is no result.";

const NOT_JSON = Symbol("not-json");

type PayloadCheck =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly violations: Violation[] };

type Validate = SchedulerHost["validate"];

function decode(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return NOT_JSON;
  }
}

/** 先按原样校验；原样不过且是字符串时，再按 JSON 解码校验一次。 */
function inspectPayload(validate: Validate, schema: unknown, raw: unknown): PayloadCheck {
  const rawViolations = validate(schema, raw);
  if (rawViolations.length === 0) return { ok: true, value: raw };
  if (typeof raw !== "string") return { ok: false, violations: rawViolations };
  const decoded = decode(raw);
  if (decoded === NOT_JSON) return { ok: false, violations: rawViolations };
  const decodedViolations = validate(schema, decoded);
  if (decodedViolations.length === 0) return { ok: true, value: decoded };
  return { ok: false, violations: decodedViolations };
}

function liveTyped(seam: SubmitSeam, ref: InstanceRef): AskNode | undefined {
  const node = seam.liveNode(ref);
  return node !== undefined && !node.settled && node.spec.typed ? node : undefined;
}

function liveAny(seam: SubmitSeam, ref: InstanceRef): AskNode | undefined {
  const node = seam.liveNode(ref);
  return node !== undefined && !node.settled ? node : undefined;
}

function accept(seam: SubmitSeam, node: AskNode, ref: InstanceRef, value: unknown): void {
  seam.host.driver.respondToSubmit(ref, { kind: "accept" });
  seam.settleOk(node, value);
}

function beginRepair(
  seam: SubmitSeam,
  node: AskNode,
  ref: InstanceRef,
  violations: Violation[],
): void {
  node.repairsRemaining--;
  const attempt = REPAIR_ATTEMPTS - node.repairsRemaining;
  seam.host.driver.respondToSubmit(ref, { kind: "reject", violations });
  seam.host.record({ type: "node-repairing", instance: ref, attempt, violations });
}

function reject(seam: SubmitSeam, node: AskNode, ref: InstanceRef, violations: Violation[]): void {
  if (node.repairsRemaining > 0) {
    beginRepair(seam, node, ref, violations);
  } else {
    seam.host.driver.cancelAsk(ref);
    seam.settleFailed(
      node,
      new WorkflowError("ValidationFailed", REPAIR_BUDGET_EXHAUSTED, { violations }),
    );
  }
}

function nudge(seam: SubmitSeam, node: AskNode, ref: InstanceRef): void {
  node.nudgesRemaining--;
  seam.host.driver.respondToSubmit(ref, { kind: "nudge" });
  seam.host.record({ type: "node-nudged", instance: ref });
}

function abandon(seam: SubmitSeam, node: AskNode, ref: InstanceRef, finalText: string): void {
  seam.host.driver.cancelAsk(ref);
  seam.settleFailed(node, new WorkflowError("ResultNotSubmitted", RESULT_MISSING, { finalText }));
}

export function handleSubmitAttempted(seam: SubmitSeam, ref: InstanceRef, body: unknown): void {
  const node = liveTyped(seam, ref);
  if (node === undefined) return;
  const check = inspectPayload(seam.host.validate, node.spec.schema, body);
  if (check.ok) accept(seam, node, ref, check.value);
  else reject(seam, node, ref, check.violations);
}

export function handleTurnEnded(seam: SubmitSeam, ref: InstanceRef, text: string): void {
  const node = liveAny(seam, ref);
  if (node === undefined) return;
  if (!node.spec.typed) {
    seam.settleOk(node, text);
  } else if (node.nudgesRemaining > 0) {
    nudge(seam, node, ref);
  } else {
    abandon(seam, node, ref, text);
  }
}
