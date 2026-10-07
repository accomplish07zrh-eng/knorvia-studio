import type { StudioKernelId } from "./kernelTypes.js";
import type { StudioRun, StudioRunState } from "./types.js";

/** Host-derived facts; reading never changes execution or approval state. */
export interface StudioAttentionItem {
  id: string;
  object: "run" | "interaction";
  version: string;
  category: "pending" | "failed" | "completed";
  unread: boolean;
  runId: string;
  attempt: number;
  targetId: string;
  targetKind: StudioRun["kind"];
  title: string;
  workspacePath: string;
  kernels: StudioKernelId[];
  state: StudioRunState;
  updatedAt: number;
  interactionKind?: "approval" | "question";
  interactionId?: string;
  nativeSessionId?: string;
  targetDeleted: boolean;
  kernelUnavailable: boolean;
  resultUnknown: boolean;
}

export interface StudioAttentionProjection {
  items: StudioAttentionItem[];
  counts: { pending: number; failed: number; completed: number };
}
