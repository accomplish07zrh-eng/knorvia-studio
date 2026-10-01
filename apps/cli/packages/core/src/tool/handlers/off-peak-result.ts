// Exposed-source decision boundary; inherited diagnostic/output prose remains retained material.
import type { OffPeakCreateOutcome, OffPeakCreateOutput } from "@knorvia/contracts";

type Refusal = Extract<OffPeakCreateOutcome, { ok: false }>;
export type OffPeakCreationDecision =
  | { kind: "created"; value: OffPeakCreateOutput }
  | { kind: "refused"; message: string; failure: Refusal };

const CATEGORY_MESSAGES = new Map<string, string>([
  [
    "quota_3103",
    "The idle-time task quota is used up for now. Tell the user the free quota is exhausted and they can retry later or review tasks in Automations.",
  ],
  [
    "eligibility_3101",
    "The current account has no eligible Coding Plan connection for idle-time tasks. Tell the user to select a ZAI/BigModel Coding Plan connection first.",
  ],
  ["network", "The idle-time ticket service is unreachable. Tell the user to retry later."],
]);
const VALIDATION_MESSAGES = [
  {
    code: "model_not_allowed",
    message:
      "The requested model is not in the idle-time allowed model list. Omit the model field to use the default allowed model.",
  },
  {
    code: "session_bound",
    message:
      "This session already has a pending idle-time task. Tell the user to wait for it to finish or cancel it in Automations before creating another one here.",
  },
  {
    code: "offpeak_disabled",
    message:
      "Idle-time tasks are not enabled for this account right now. Tell the user the feature is unavailable; do not retry with different parameters.",
  },
] as const;
const VALIDATION_REFUSAL = "The idle-time task input was rejected by validation.";
const OTHER_REFUSAL =
  "Creating the idle-time task failed. Tell the user to retry from the Automations page.";

function refusalMessage(failure: Refusal): string {
  const category = failure.errorCategory;
  if (category !== "client_validation") return CATEGORY_MESSAGES.get(category) ?? OTHER_REFUSAL;
  // Ordered code checks retain lazy accessor reads as well as the existing code precedence.
  for (const policy of VALIDATION_MESSAGES)
    if (failure.errorCode === policy.code) return policy.message;
  return VALIDATION_REFUSAL;
}

/** Per-call result decision has no context access, port call, retry or retained task state. */
export function decideOffPeakCreation(outcome: OffPeakCreateOutcome): OffPeakCreationDecision {
  if (!outcome.ok) return { kind: "refused", message: refusalMessage(outcome), failure: outcome };
  return {
    kind: "created",
    value: {
      // The raw task/type projection and its access sequence remain compatibility material.
      task: outcome.task,
      message:
        typeof outcome.task.queuePosition === "number"
          ? `Created idle-time task ${outcome.task.offPeakTaskId} (#${outcome.task.queuePosition} in queue).`
          : `Created idle-time task ${outcome.task.offPeakTaskId}.`,
    },
  };
}
