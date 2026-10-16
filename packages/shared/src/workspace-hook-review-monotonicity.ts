// SPDX-License-Identifier: Apache-2.0

const VERDICT = {
  absent: "no_current",
  switched: "cross_flow",
  newer: "same_flow_advance",
  older: "same_flow_stale",
  replay: "same_flow_replay",
  clash: "same_flow_conflict",
} as const;

export type WorkspaceHookReviewIdentity = Record<"reviewFlowId" | "interactionId", string> &
  Record<"generation", number>;

export type WorkspaceHookReviewMonotonicityVerdict = (typeof VERDICT)[keyof typeof VERDICT];

type HeldReview = WorkspaceHookReviewIdentity | undefined;

export function verdictWorkspaceHookReviewRequest(
  current: HeldReview,
  candidate: WorkspaceHookReviewIdentity,
): WorkspaceHookReviewMonotonicityVerdict {
  if (current === undefined) return VERDICT.absent;
  if (candidate.reviewFlowId !== current.reviewFlowId) return VERDICT.switched;
  const generationDelta = Math.sign(candidate.generation - current.generation);
  if (generationDelta > 0) return VERDICT.newer;
  if (generationDelta < 0) return VERDICT.older;
  const sameInteraction = candidate.interactionId === current.interactionId;
  return sameInteraction ? VERDICT.replay : VERDICT.clash;
}
