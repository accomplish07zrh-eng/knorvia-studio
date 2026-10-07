// SPDX-License-Identifier: Apache-2.0
import type { StudioWorkspaceRuntimeCommand } from "../workspaceRuntimeTypes.js";

/** Hashes avoid persisting command-bearing macOS process identities. */
export interface WorkspaceRuntimeProcessProof {
  rootPid: number;
  identities: Array<{
    pid: number;
    parentPid: number;
    processGroupId?: number;
    startToken: string;
  }>;
}
export interface WorkspaceRuntimeProcess {
  proof(): Promise<WorkspaceRuntimeProcessProof>;
  exited: Promise<{ code: number | null; conflict: boolean }>;
  alive(): boolean;
  stop(): Promise<boolean>;
}
export interface WorkspaceRuntimePort {
  reservePort(excluded: readonly number[]): Promise<{ port: number; release(): Promise<void> }>;
  spawn(
    workspacePath: string,
    command: StudioWorkspaceRuntimeCommand,
    port: number | undefined,
    onCreated: (proof: WorkspaceRuntimeProcessProof) => void,
  ): Promise<WorkspaceRuntimeProcess>;
  ready(process: WorkspaceRuntimeProcess, port: number, healthPath: string): Promise<boolean>;
  recover(proof: WorkspaceRuntimeProcessProof): Promise<boolean>;
}
