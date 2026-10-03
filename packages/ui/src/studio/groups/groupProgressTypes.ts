// SPDX-License-Identifier: Apache-2.0
// Existing consumer shapes preserved; file-level source and rights review pending.
import type { StudioKernelId, StudioRun, StudioStepResult } from "@knorvia/services";

export type GroupProgressState =
  | "queued"
  | "running"
  | "waiting"
  | "stopping"
  | "completed"
  | "failed"
  | "blocked"
  | "stopped"
  | "unknown"
  | "unassigned";

export interface GroupTaskProgress {
  id: string;
  stepId: string;
  member: StudioKernelId;
  instruction: string;
  state: GroupProgressState;
  evidence?: Pick<StudioStepResult, "workspacePath" | "changesSummary">;
}

export interface GroupProgress {
  runId: string;
  runState: StudioRun["state"];
  phase: "planning" | "tasks" | "steering" | "reviewing" | "complete";
  round: number;
  host: StudioKernelId;
  members: Array<{ id: StudioKernelId; state: GroupProgressState; tasks: GroupTaskProgress[] }>;
  review?: { round: number; status: "complete" | "revise"; summary: string };
}

export interface GroupSavedPlan {
  round: number;
  phase: "tasks" | "steering" | "complete";
  tasks: Array<{ id: string; member: StudioKernelId; instruction: string; dependsOn?: string[] }>;
  review?: GroupProgress["review"];
}
