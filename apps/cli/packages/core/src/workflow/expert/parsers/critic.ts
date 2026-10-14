// SPDX-License-Identifier: Apache-2.0
// 批评结果解析：兼容新版 verdict 与旧版字段（acceptance_gaps / overallVerdict / reopenNodes 等）。
import {
  WorkflowCriticReopenProposalSchema,
  WorkflowCriticResultSchema,
  type WorkflowCriticReopenProposal,
  type WorkflowCriticResult,
} from "@knorvia/contracts";
import { isRecord, parseOrNull, parsePlannerJson, stringValue, withoutNulls } from "./json.js";

const CRITIC_ERROR = "Workflow critic did not return JSON verdict data";

/** 旧版字段探测表：任一命中就走兼容归一化。 */
const LEGACY_PROBES: readonly ((value: Record<string, unknown>) => boolean)[] = [
  (value) => Array.isArray(value.acceptance_gaps),
  (value) => typeof value.overallVerdict === "string",
  (value) => typeof value.passed === "boolean",
  (value) => Array.isArray(value.reopenNodes),
  (value) => Array.isArray(value.reopen_proposals),
];

/** 通过判定别名：这些 overallVerdict 视为通过。 */
const APPROVED_VERDICTS: ReadonlySet<string> = new Set(["approved", "conditionallyApproved"]);

/** 提案与差距字段的候选键。 */
const PROPOSAL_KEYS = ["reopenProposals", "reopen_proposals"] as const;
const NODE_ONLY_KEYS = ["reopenNodes"] as const;
const GAP_KEYS = ["acceptanceGaps", "acceptance_gaps"] as const;

/** 允许的严重度取值。 */
const SEVERITIES: ReadonlySet<string> = new Set(["critical", "major", "minor"]);

/** 取第一个数组字段：候选键顺序即优先级。 */
const firstArray = (value: Record<string, unknown>, keys: readonly string[]): unknown[] => {
  for (const key of keys) {
    const entry = value[key];
    if (Array.isArray(entry)) return entry;
  }
  return [];
};

/** 判定归一化：verdict → passed → overallVerdict 依次兜底。 */
function normalizeVerdict(value: Record<string, unknown>): "pass" | "fail" | null {
  const readers: readonly (() => "pass" | "fail" | null)[] = [
    () => (value.verdict === "pass" || value.verdict === "fail" ? value.verdict : null),
    () => (typeof value.passed === "boolean" ? (value.passed ? "pass" : "fail") : null),
    () =>
      typeof value.overallVerdict !== "string"
        ? null
        : APPROVED_VERDICTS.has(value.overallVerdict)
          ? "pass"
          : "fail",
  ];
  for (const read of readers) {
    const verdict = read();
    if (verdict !== null) return verdict;
  }
  return null;
}

/** 重开提案归一化：nodeId 与 reason 都必需。 */
function normalizeProposal(value: unknown): WorkflowCriticReopenProposal | null {
  if (!isRecord(value)) return null;
  const nodeId =
    stringValue(value.nodeId) ?? stringValue(value.node_id) ?? stringValue(value.nodeName);
  const reason = stringValue(value.reason) ?? stringValue(value.issue);
  if (nodeId === undefined || reason === undefined) return null;
  const severity = value.severity;
  const fields = Object.fromEntries([
    ["nodeId", nodeId],
    ["reason", reason],
    ...(typeof severity === "string" && SEVERITIES.has(severity) ? [["severity", severity]] : []),
  ]);
  return parseOrNull(WorkflowCriticReopenProposalSchema, fields);
}

/** 仅给出节点 id 的旧版重开列表：补上统一原因后走同一提案归一化。 */
const nodeOnlyProposals = (
  nodeIds: readonly unknown[],
  reasoning: string,
): (WorkflowCriticReopenProposal | null)[] =>
  nodeIds.map((nodeId) =>
    normalizeProposal({ nodeId, reason: reasoning || "critic requested reopen" }),
  );

/** 结果归一化：新版直读，旧版按兼容字段重建。 */
function normalizeCriticResult(value: unknown): WorkflowCriticResult | null {
  if (!isRecord(value)) return null;
  const isLegacy = LEGACY_PROBES.some((probe) => probe(value));
  if (!isLegacy) {
    const direct = parseOrNull(WorkflowCriticResultSchema, value);
    if (direct !== null) return direct;
  }

  const verdict = normalizeVerdict(value);
  if (verdict === null) return null;
  const reasoningReaders: readonly (() => string | undefined)[] = [
    () => stringValue(value.reasoning),
    () => stringValue(value.summary),
    () => (typeof value.verdict === "string" ? value.verdict : undefined),
  ];
  const reasoning = reasoningReaders.map((read) => read()).find((text) => text !== undefined) ?? "";
  const proposals = firstArray(value, PROPOSAL_KEYS).map(normalizeProposal);
  const nodeOnly = nodeOnlyProposals(firstArray(value, NODE_ONLY_KEYS), reasoning);
  const reopenProposals = withoutNulls([...proposals, ...nodeOnly]);
  const acceptanceGaps = withoutNulls(firstArray(value, GAP_KEYS).map(stringValue));
  const rebuilt = Object.fromEntries([
    ["acceptanceGaps", acceptanceGaps],
    ["reasoning", reasoning],
    ["reopenProposals", reopenProposals],
    ["verdict", verdict],
  ]);
  return parseOrNull(WorkflowCriticResultSchema, rebuilt);
}

export function parseCriticResult(response: string): WorkflowCriticResult {
  const result = normalizeCriticResult(parsePlannerJson(response));
  if (result === null) {
    throw new Error(CRITIC_ERROR);
  }
  return result;
}

/** 重开提案去重：同一节点保留首个提案，顺序与输入一致。 */
export function dedupeReopenProposals(
  proposals: readonly WorkflowCriticReopenProposal[],
): WorkflowCriticReopenProposal[] {
  const firstByNode = new Map<string, WorkflowCriticReopenProposal>();
  for (const proposal of proposals) {
    if (!firstByNode.has(proposal.nodeId)) firstByNode.set(proposal.nodeId, proposal);
  }
  return [...firstByNode.values()];
}
