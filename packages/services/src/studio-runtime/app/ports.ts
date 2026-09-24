import type {
  StudioKernelAdapter,
  StudioKernelConfig,
  StudioKernelId,
  StudioKernelStatus,
  StudioPermission,
} from "../kernelTypes.js";
import type { StudioCheckpoint, StudioStepResult } from "../workflowTypes.js";
import type { StudioWorkspaceChange } from "../types.js";
import type { IStudioRuntimeService } from "../contract.js";

export interface StudioKernelRegistry {
  remoteWorkspace?(
    kernel: StudioKernelId,
  ):
    | Pick<IStudioRuntimeService, "agentWorkspaceChanges" | "applyAgentWorkspaceChanges">
    | undefined;
  options?(params: {
    kernel: StudioKernelId;
    workspacePath?: string;
    model?: string;
    config: StudioKernelConfig;
  }): Promise<import("../kernelTypes.js").StudioKernelOptions>;
  adapter(kernel: StudioKernelId): StudioKernelAdapter;
  inspect(configs: Record<StudioKernelId, StudioKernelConfig>): Promise<StudioKernelStatus[]>;
  manage(
    kernel: StudioKernelId,
    action: "install" | "update" | "uninstall" | "update-existing",
  ): Promise<StudioKernelStatus>;
  dispose(): Promise<void>;
}
export interface StudioAgentStep {
  id: string;
  kernel: StudioKernelId;
  prompt: string;
  memberId?: string;
  permission?: StudioPermission;
  signal?: AbortSignal;
}
export interface StudioExecutionPort {
  steering?(): Array<{ id: string; text: string }>;
  ackSteering?(ids: string[]): Promise<void>;
  attempt: number;
  signal: AbortSignal;
  checkpoint: StudioCheckpoint;
  /** Merge metadata atomically; only the run owner writes step outcomes. */
  saveCheckpoint(
    update: Partial<Pick<StudioCheckpoint, "values" | "completedRounds" | "plan">>,
  ): Promise<void>;
  agent(step: StudioAgentStep): Promise<StudioStepResult>;
  createMedia?(request: {
    nodeId: string;
    modelId: string;
    prompt: string;
    referencePath?: string;
    signal: AbortSignal;
  }): Promise<StudioStepResult>;
  confirm(id: string, title: string, signal?: AbortSignal): Promise<boolean>;
  progress(text: string): Promise<void>;
  delay(milliseconds: number, signal?: AbortSignal): Promise<void>;
  now(): number;
}
export interface StudioWorkspacePort {
  prepare(params: {
    runId: string;
    stepId: string;
    sourcePath: string;
    mode: "isolated" | "shared";
  }): Promise<string>;
  changes(runId: string, stepId: string): Promise<StudioWorkspaceChange[]>;
  apply(runId: string, stepId: string, paths: string[]): Promise<void>;
}
