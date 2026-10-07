// SPDX-License-Identifier: Apache-2.0
import type { StudioReviewDraft } from "../workspaceReviewTypes.js";
import type { StudioRun } from "../types.js";
import type { StudioRepository } from "./storePort.js";

/** Saved review is authoritative; delivery status is read from the existing run owner. */
export function projectWorkspaceReview(
  db: StudioRepository,
  draft: StudioReviewDraft,
): StudioReviewDraft {
  const {
    id,
    projectKey,
    targetId,
    runId,
    stepId,
    kernel,
    revision,
    comments,
    preview,
    lastDelivery,
  } = draft;
  const delivery = lastDelivery ? db.read<StudioRun>("run", lastDelivery.runId) : undefined;
  return {
    id,
    projectKey,
    targetId,
    runId,
    stepId,
    kernel,
    revision,
    comments,
    ...(preview ? { preview } : {}),
    ...(lastDelivery
      ? {
          lastDelivery: {
            runId: lastDelivery.runId,
            state: delivery?.state,
            error: delivery?.error,
          },
        }
      : {}),
  };
}
