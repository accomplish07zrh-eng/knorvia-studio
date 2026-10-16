// SPDX-License-Identifier: Apache-2.0

export type KnorviaBackgroundTaskControlStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "killed"
  | "lost";

export interface KnorviaBackgroundTaskControlItem {
  jobId: string;
  taskKind: "agent" | "bash";
  command: string;
  status: KnorviaBackgroundTaskControlStatus;
  title?: string;
  toolCallId?: string;
  startedAt?: number;
  elapsedMs?: number;
  pid?: number;
  cancellable?: boolean;
  stdoutTail?: string;
  stderrTail?: string;
  outputTail?: string;
  raw?: unknown;
}
