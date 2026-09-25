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
import type {
  StudioApplyReceipt,
  StudioOverview,
  StudioTimeline,
  StudioWorkspaceChange,
} from "./types.js";
import type { StudioGroupDefinition, StudioWorkflowDefinition } from "./workflowTypes.js";

export * from "./kernelTypes.js";
export * from "./workflowTypes.js";
export * from "./types.js";
export * from "./domain/outputRef.js";
export { validateStudioWorkflow } from "./domain/workflowGraph.js";
export { studioConditionReferences } from "./domain/condition.js";
/** 交付结论/重启显示的纯判定入口；上层只读，不写任何记录。 */
export { studioRestartDisplay, STUDIO_ACCEPTANCE_KIND } from "./app/runOutcomeProjection.js";
export type { StudioRestartInput } from "./app/runOutcomeProjection.js";

export type StudioCommand = { commandId: string } & (
  | { type: "configure"; kernel: StudioKernelId; config: StudioKernelConfig }
  | { type: "create-conversation"; id: string; kernel: StudioKernelId; workspacePath: string }
  | {
      type: "save-group";
      group: StudioGroupDefinition;
      onlyIfAbsent?: boolean;
      /** 编辑所依据的服务端 `updatedAt`；与当前记录不一致时拒绝，防止多窗口静默覆盖。 */
      baseUpdatedAt?: number;
    }
  | {
      type: "save-workflow";
      workflow: StudioWorkflowDefinition;
      onlyIfAbsent?: boolean;
      baseUpdatedAt?: number;
    }
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
  /**
   * 应用成功后由服务层写入验收记录（辅助证据，`apply-acceptance` kind）。
   * 该记录**不是**任务终态，`run` / `step-result` / `turn` 仍然是任务状态的唯一所有者。
   */
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
  /**
   * 远端 Host 可以返回它自己的应用回执；
   * 返回 `void` 时本地 Host 只能记录"未返回摘要"，**不得**当作已核验。
   */
  applyAgentWorkspaceChanges(params: {
    runId: string;
    stepId: string;
    paths: string[];
  }): Promise<StudioApplyReceipt | void>;
  onDidChange: Event<{ revision: number }>;
}
export const IStudioRuntimeService =
  createServiceDescriptor<IStudioRuntimeService>("studio-runtime");
