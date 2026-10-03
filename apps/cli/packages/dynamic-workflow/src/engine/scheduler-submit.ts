import type { AskNode, SchedulerHost } from "./scheduler-types.js";
import type { InstanceRef, Violation } from "./types.js";
import { REPAIR_ATTEMPTS, WorkflowError } from "./types.js";

export interface SubmitSeam {
  readonly host: SchedulerHost;
  liveNode(instance: InstanceRef): AskNode | undefined;
  settleOk(node: AskNode, artifact: unknown): void;
  settleFailed(node: AskNode, error: WorkflowError): void;
}

type Reply =
  | { kind: "accept"; value: unknown }
  | { kind: "repair"; violations: Violation[]; attempt: number }
  | { kind: "nudge" }
  | { kind: "invalid"; violations: Violation[] }
  | { kind: "missing"; finalText: string };

type Candidate =
  | { valid: true; value: unknown }
  | { valid: false; violations: Violation[] };

function submissionCandidate(host: SchedulerHost, schema: unknown, payload: unknown): Candidate {
  const initial = host.validate(schema, payload);
  if (initial.length === 0) return { valid: true, value: payload };
  if (typeof payload !== "string") return { valid: false, violations: initial };
  try {
    const decoded: unknown = JSON.parse(payload);
    const violations = host.validate(schema, decoded);
    // 沿用解码后违规的修复：原值合法时不解析；解码仍失败时不能回报字符串形状的旧违规。
    return violations.length === 0 ? { valid: true, value: decoded } : { valid: false, violations };
  } catch {
    return { valid: false, violations: initial };
  }
}

/** 决定已经提交预算变化；此处只按原 driver → event/settlement 顺序执行裁决。 */
function deliver(seam: SubmitSeam, node: AskNode, instance: InstanceRef, reply: Reply): void {
  switch (reply.kind) {
    case "accept":
      seam.host.driver.respondToSubmit(instance, { kind: "accept" });
      seam.settleOk(node, reply.value);
      return;
    case "repair":
      seam.host.driver.respondToSubmit(instance, { kind: "reject", violations: reply.violations });
      seam.host.record({ type: "node-repairing", instance, attempt: reply.attempt, violations: reply.violations });
      return;
    case "nudge":
      seam.host.driver.respondToSubmit(instance, { kind: "nudge" });
      seam.host.record({ type: "node-nudged", instance });
      return;
    case "invalid":
    case "missing":
      break;
  }
  seam.host.driver.cancelAsk(instance);
  const error = reply.kind === "invalid"
    ? new WorkflowError("ValidationFailed", "submit_result failed schema validation repeatedly and the repair budget is exhausted.", { violations: reply.violations })
    : new WorkflowError("ResultNotSubmitted", "The typed ask ended without a submit_result call, so there is no result.", { finalText: reply.finalText });
  seam.settleFailed(node, error);
}

export function handleSubmitAttempted(seam: SubmitSeam, instance: InstanceRef, payload: unknown): void {
  const node = seam.liveNode(instance);
  if (node === undefined || node.settled || !node.spec.typed) return;
  const candidate = submissionCandidate(seam.host, node.spec.schema, payload);
  let reply: Reply;
  if (candidate.valid) reply = { kind: "accept", value: candidate.value };
  else if (node.repairsRemaining > 0) {
    node.repairsRemaining -= 1;
    reply = { kind: "repair", violations: candidate.violations, attempt: REPAIR_ATTEMPTS - node.repairsRemaining };
  } else reply = { kind: "invalid", violations: candidate.violations };
  deliver(seam, node, instance, reply);
}

export function handleTurnEnded(seam: SubmitSeam, instance: InstanceRef, finalText: string): void {
  const node = seam.liveNode(instance);
  if (node === undefined || node.settled) return;
  if (!node.spec.typed) {
    seam.settleOk(node, finalText);
    return;
  }
  let reply: Reply;
  if (node.nudgesRemaining > 0) {
    node.nudgesRemaining -= 1;
    reply = { kind: "nudge" };
  } else reply = { kind: "missing", finalText };

  deliver(seam, node, instance, reply);
}
