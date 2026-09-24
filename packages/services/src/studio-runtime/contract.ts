import type { Event } from "@knorvia/rpc";
import { createServiceDescriptor } from "../descriptors.js";
import type {
  StudioKernelAnswer,
  StudioKernelConfig,
  StudioKernelId,
  StudioKernelStatus,
  StudioKernelOptions,
  StudioChatSelection,
} from "./kernelTypes.js";
import type { StudioOverview, StudioTimeline, StudioWorkspaceChange } from "./types.js";
import type { StudioGroupDefinition, StudioWorkflowDefinition } from "./workflowTypes.js";

export * from "./kernelTypes.js";
export * from "./workflowTypes.js";
export * from "./types.js";
export { validateStudioWorkflow } from "./domain/workflowGraph.js";
export { studioConditionReferences } from "./domain/condition.js";

export type StudioCommand = { commandId: string } & (
  | { type: "configure"; kernel: StudioKernelId; config: StudioKernelConfig }
  | { type: "create-conversation"; id: string; kernel: StudioKernelId; workspacePath: string }
  | { type: "save-group"; group: StudioGroupDefinition; onlyIfAbsent?: boolean }
  | { type: "save-workflow"; workflow: StudioWorkflowDefinition; onlyIfAbsent?: boolean }
  | { type: "delete"; kind: "conversation" | "group" | "workflow"; id: string }
  | {
      type: "send";
      kind: "chat" | "group" | "workflow";
      targetId: string;
      text: string;
      taskMode?: boolean;
      selection?: StudioChatSelection;
      /** A caller-owned per-turn snapshot; avoids mutating a remote Host's global CLI settings. */
      kernelConfig?: StudioKernelConfig;
    }
  | { type: "cancel"; runId: string }
  | { type: "steer"; runId: string; text: string }
  | { type: "resume"; runId: string; retryUncertain: boolean }
  | { type: "answer"; interactionId: string; answer: StudioKernelAnswer }
);
export interface StudioCommandResult {
  id: string;
  revision: number;
}
export interface IStudioRuntimeService {
  overview(): Promise<StudioOverview>;
  timeline(targetId: string, before?: number): Promise<StudioTimeline>;
  command(command: StudioCommand): Promise<StudioCommandResult>;
  inspectKernels(): Promise<StudioKernelStatus[]>;
  kernelOptions(params: {
    kernel: StudioKernelId;
    workspacePath?: string;
    model?: string;
  }): Promise<StudioKernelOptions>;
  manageKernel(params: {
    kernel: StudioKernelId;
    action: "install" | "update" | "uninstall" | "update-existing";
  }): Promise<StudioKernelStatus>;
  workspaceChanges(params: { runId: string; stepId: string }): Promise<StudioWorkspaceChange[]>;
  applyWorkspaceChanges(params: { runId: string; stepId: string; paths: string[] }): Promise<void>;
  /** Called only by an authenticated Studio peer bound to this Host's remote workspace. */
  prepareAgentWorkspace(params: {
    runId: string;
    stepId: string;
    sourcePath: string;
    mode: "isolated" | "shared";
  }): Promise<string>;
  agentWorkspaceChanges(params: {
    runId: string;
    stepId: string;
  }): Promise<StudioWorkspaceChange[]>;
  applyAgentWorkspaceChanges(params: {
    runId: string;
    stepId: string;
    paths: string[];
  }): Promise<void>;
  onDidChange: Event<{ revision: number }>;
}
export const IStudioRuntimeService =
  createServiceDescriptor<IStudioRuntimeService>("studio-runtime");
