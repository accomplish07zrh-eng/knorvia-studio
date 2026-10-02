import {
  WorkflowCriticReopenProposalSchema,
  WorkflowCriticResultSchema,
  type WorkflowCriticReopenProposal,
  type WorkflowCriticResult,
} from "@knorvia/contracts";
import { isRecord, parsePlannerJson, stringValue } from "./json.js";

export function parseCriticResult(response: string): WorkflowCriticResult {
  const raw = parsePlannerJson(response);
  const result = normalizeCriticResult(raw);
  if (result === null) {
    throw new Error("Workflow critic did not return JSON verdict data");
  }
  return result;
}

export function dedupeReopenProposals(
  proposals: readonly WorkflowCriticReopenProposal[],
): WorkflowCriticReopenProposal[] {
  const seen = new Set<string>();
  const unique: WorkflowCriticReopenProposal[] = [];
  for (const proposal of proposals) {
    if (!seen.has(proposal.nodeId)) {
      seen.add(proposal.nodeId);
      unique.push(proposal);
    }
  }
  return unique;
}

function normalizeCriticResult(value: unknown): WorkflowCriticResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const legacy =
    Array.isArray(value.acceptance_gaps) ||
    typeof value.overallVerdict === "string" ||
    typeof value.passed === "boolean" ||
    Array.isArray(value.reopenNodes) ||
    Array.isArray(value.reopen_proposals);
  if (!legacy) {
    const direct = WorkflowCriticResultSchema.safeParse(value);
    if (direct.success) {
      return direct.data;
    }
  }

  const verdict = normalizeVerdict(value);
  if (verdict === null) {
    return null;
  }
  const reasoning =
    stringValue(value.reasoning) ??
    stringValue(value.summary) ??
    (typeof value.verdict === "string" ? value.verdict : "");
  const proposalCandidates = Array.isArray(value.reopenProposals)
    ? value.reopenProposals
    : Array.isArray(value.reopen_proposals)
      ? value.reopen_proposals
      : Array.isArray(value.reopenNodes)
        ? value.reopenNodes.map((nodeId) => ({
            nodeId,
            reason: reasoning || "critic requested reopen",
          }))
        : [];
  const reopenProposals = proposalCandidates
    .map(normalizeProposal)
    .filter((proposal): proposal is WorkflowCriticReopenProposal => proposal !== null);
  const gapCandidates = Array.isArray(value.acceptanceGaps)
    ? value.acceptanceGaps
    : Array.isArray(value.acceptance_gaps)
      ? value.acceptance_gaps
      : [];
  const acceptanceGaps = gapCandidates
    .map(stringValue)
    .filter((gap): gap is string => gap !== undefined);
  const result = WorkflowCriticResultSchema.safeParse({
    acceptanceGaps,
    reasoning,
    reopenProposals,
    verdict,
  });
  return result.success ? result.data : null;
}

function normalizeVerdict(value: Record<string, unknown>): "pass" | "fail" | null {
  if (value.verdict === "pass" || value.verdict === "fail") {
    return value.verdict;
  }
  if (typeof value.passed === "boolean") {
    return value.passed ? "pass" : "fail";
  }
  if (typeof value.overallVerdict === "string") {
    return value.overallVerdict === "approved" || value.overallVerdict === "conditionallyApproved"
      ? "pass"
      : "fail";
  }
  return null;
}

function normalizeProposal(value: unknown): WorkflowCriticReopenProposal | null {
  if (!isRecord(value)) {
    return null;
  }
  const nodeId =
    stringValue(value.nodeId) ??
    stringValue(value.node_id) ??
    stringValue(value.nodeName) ??
    stringValue(value.node_name);
  const reason = stringValue(value.reason) ?? stringValue(value.issue);
  if (nodeId === undefined || reason === undefined) {
    return null;
  }
  const severity = value.severity;
  const result = WorkflowCriticReopenProposalSchema.safeParse({
    nodeId,
    reason,
    ...(severity === "critical" || severity === "major" || severity === "minor"
      ? { severity }
      : {}),
  });
  return result.success ? result.data : null;
}
