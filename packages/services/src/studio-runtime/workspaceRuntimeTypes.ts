// SPDX-License-Identifier: Apache-2.0
export type StudioWorkspaceRuntimePhase =
  | "idle"
  | "preparing"
  | "prepared"
  | "starting"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed"
  | "interrupted"
  | "cleanup-required";
export type StudioWorkspaceRuntimeError =
  | "invalid-command"
  | "approval-required"
  | "read-only"
  | "unavailable"
  | "busy"
  | "setup-required"
  | "setup-failed"
  | "spawn-failed"
  | "port-conflict"
  | "readiness-failed"
  | "process-exited"
  | "cleanup-required"
  | "interrupted";
/** Explicit argv; no shell expansion, repository discovery or persisted environment. */
export interface StudioWorkspaceRuntimeCommand {
  executable: string;
  args: string[];
}
export type StudioWorkspaceRuntimeControl =
  | { action: "prepare"; approved: true; command?: StudioWorkspaceRuntimeCommand }
  | {
      action: "start";
      approved: true;
      command: StudioWorkspaceRuntimeCommand;
      healthPath?: string;
      timeoutMs?: number;
    }
  | { action: "stop" }
  | { action: "recover" };
export interface StudioWorkspaceRuntimeRequest {
  runId: string;
  stepId: string;
  control?: StudioWorkspaceRuntimeControl;
}
export interface StudioWorkspaceRuntimeState {
  workspacePath: string;
  phase: StudioWorkspaceRuntimePhase;
  prepared: boolean;
  updatedAt: number;
  canControl: boolean;
  port?: number;
  previewUrl?: string;
  errorCode?: StudioWorkspaceRuntimeError;
  exitCode?: number | null;
}
