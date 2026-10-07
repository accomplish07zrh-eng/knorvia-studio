// SPDX-License-Identifier: Apache-2.0
import type { StudioKernelId } from "./kernelTypes.js";
import type { StudioRunState } from "./types.js";

export interface StudioReviewFileVersion {
  beforeHash: string | null;
  afterHash: string | null;
  sourceHash: string | null;
}
export interface StudioReviewAnchor {
  path: string;
  side: "old" | "new";
  startLine: number;
  endLine: number;
  version: StudioReviewFileVersion;
}
export interface StudioReviewComment {
  id: string;
  anchor: StudioReviewAnchor;
  context: string;
  body: string;
}
export interface StudioReviewDraft {
  id: string;
  projectKey: string;
  targetId: string;
  runId: string;
  stepId: string;
  kernel: StudioKernelId;
  revision: number;
  comments: StudioReviewComment[];
  preview?: { id: string; commandId: string; summary: string };
  lastDelivery?: { runId: string; state?: StudioRunState; error?: string };
}
export type StudioReviewCommand = {
  type: "workspace-review";
  runId: string;
  stepId: string;
  draftId?: string;
  baseRevision: number;
} & (
  | { action: "save-comment"; commentId: string; body: string; anchor?: StudioReviewAnchor }
  | { action: "delete-comment"; commentId: string }
  | { action: "prepare" }
  | { action: "send"; previewId: string }
);
