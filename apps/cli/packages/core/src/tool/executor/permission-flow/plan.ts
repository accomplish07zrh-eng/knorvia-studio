// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PermissionBrokerResult, PermissionRuleset } from "@knorvia/contracts";
import { normalizeToolExecutionInput } from "../../input-normalization.js";
import { resolveToolApproval } from "../approval-gate.js";
import { createErrorResult } from "../errors.js";
import { emitPermissionDenied, emitPermissionResolved } from "../events.js";
import { applyResolvedPermissionGrants } from "../permission-grants.js";
import { recheckPermissionHookModifiedInput } from "../permission-input-recheck.js";
import { racePermissionResponders } from "../permission-responder-race.js";
import { loadProjectPermissionRuleset } from "../permission-rules-persistence.js";
import { validateInput } from "../validation.js";
import { captureAssessment, evaluateAssessment } from "./assessment.js";
import { observeAssessment, observeDenial, observeResolution } from "./observations.js";
import { suspend, type PermissionInvocation, type PermissionPlan } from "./plan-driver.js";
import { policyRefusal, replyRefusal, requestFailure, storageRefusal } from "./refusals.js";
import { permissionResponders } from "./responders.js";
import { PermissionPublication } from "./publication.js";

const REQUEST_PREFIX = "perm_";
function normalize(c: PermissionInvocation, input: unknown) {
  return normalizeToolExecutionInput({
    entry: c.entry,
    input,
    logger: c.deps.logger,
    source: "permission",
  });
}

/** Each invocation retains its decisions here and yields only externally awaited work. */
export function* permissionPlan(c: PermissionInvocation): PermissionPlan {
  const facts = captureAssessment(c);
  let rules: PermissionRuleset | null;
  try {
    rules = yield* suspend("rules", () => loadProjectPermissionRuleset(c.deps));
  } catch (error) {
    return storageRefusal(c, error);
  }
  let decision = evaluateAssessment(c, facts, rules);
  observeAssessment(c, decision);
  if (decision.allowed) {
    c.telemetry?.setPermissionDecision("not_required");
    return { allowed: true, executionInput: c.input };
  }
  if (decision.decision === "deny") {
    c.telemetry?.setPermissionDecision("denied");
    yield* suspend("denied", () => emitPermissionDenied(c.deps, c.call, decision.reason, c.trace));
    observeDenial(c, decision);
    return policyRefusal(c, decision);
  }
  const approval = resolveToolApproval(c.deps, c.call, c.entry, c.input, c.trace);
  if (approval.gate === "proceed") {
    c.telemetry?.setPermissionDecision("not_required");
    return { allowed: true, executionInput: c.input };
  }

  const id = REQUEST_PREFIX + crypto.randomUUID();
  c.telemetry?.markPermissionRequested();
  const publication = new PermissionPublication();
  let reply: PermissionBrokerResult;
  let rewrite: { input: unknown; retain: boolean } | undefined;
  try {
    const answer = yield* suspend("responders", () =>
      racePermissionResponders(
        permissionResponders(c, decision, id, facts.suggestions, approval, publication),
      ),
    );
    reply = answer.result;
    const hookAnswer = answer.source === "hook" ? answer.result : undefined;
    if (hookAnswer?.decision === "modify") {
      rewrite = { input: normalize(c, hookAnswer.modifiedInput ?? c.input), retain: true };
      if (!validateInput(rewrite.input, c.entry)) {
        // Hook 改写目标后必须复核权限；复用原项目规则和请求 ID，不能沿用旧目标的许可。
        const input = rewrite.input;
        const checked = yield* suspend("recheck", () =>
          recheckPermissionHookModifiedInput({
            deps: c.deps,
            entry: c.entry,
            mode: c.mode,
            modifiedInput: input,
            projectRules: rules,
            requestId: id,
            signal: c.signal,
            toolCall: c.call,
            traceContext: c.trace,
          }),
        );
        if (checked.permissionDecision) decision = checked.permissionDecision;
        if (checked.brokerResult) {
          reply = checked.brokerResult;
          rewrite.retain = reply.decision === "allow";
        }
      }
    }
  } catch (error) {
    if (publication.failure) throw publication.failure.error;
    c.telemetry?.setPermissionDecision("denied");
    const failure = requestFailure(c, id, error);
    if (publication.published)
      yield* suspend("resolved", () =>
        emitPermissionResolved(
          c.deps,
          c.call,
          id,
          {
            decision: "deny",
            reason: failure.message,
            resolvedAt: new Date(),
          },
          c.trace,
        ),
      );
    return { allowed: false, result: createErrorResult(c.call, failure) };
  }

  const resolution = { ...reply, resolvedAt: reply.resolvedAt ?? new Date() };
  const permissionWaitMs = publication.elapsed;
  yield* suspend("resolved", () => emitPermissionResolved(c.deps, c.call, id, resolution, c.trace));
  observeResolution(c, resolution, id);
  const refused = replyRefusal(c, resolution, decision, id);
  if (refused) return refused;
  const grantError = yield* suspend("grants", () =>
    applyResolvedPermissionGrants({
      deps: c.deps,
      toolCall: c.call,
      entry: c.entry,
      resolvedPermission: resolution,
      requestId: id,
      traceContext: c.trace,
    }),
  );
  if (grantError) return { allowed: false, result: grantError };
  c.telemetry?.setPermissionDecision("granted");

  if (resolution.decision !== "modify") {
    return {
      allowed: true,
      executionInput: rewrite?.retain ? rewrite.input : c.input,
      permissionWaitMs,
    };
  }
  const input = rewrite?.retain ? rewrite.input : normalize(c, resolution.modifiedInput ?? c.input);
  const invalid = validateInput(input, c.entry);
  return invalid
    ? { allowed: false, result: createErrorResult(c.call, invalid) }
    : { allowed: true, executionInput: input, permissionWaitMs };
}
