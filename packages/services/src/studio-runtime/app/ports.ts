import type {
  StudioKernelAdapter,
  StudioKernelConfig,
  StudioKernelId,
  StudioKernelStatus,
  StudioPermission,
} from "../kernelTypes.js";
import type { StudioCheckpoint, StudioStepResult } from "../workflowTypes.js";
import type { StudioApplyReceipt, StudioFileVersion, StudioWorkspaceChange } from "../types.js";
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
/** 跨隔离目录导入的回执：来源记录 + 复制后的真实版本。源文件永不被写回。 */
export interface StudioImportReceipt {
  /** 导入到本次运行工作区内的相对路径。 */
  path: string;
  sourcePath: string;
  hash: string;
  size: number;
}
/** 工作区内某个文件的当前版本；`hash` 为 `null` 表示文件不存在。 */
export interface StudioReferenceVersion {
  path: string;
  hash: string | null;
}
/** 执行期引用解析所需的宿主上下文；宿主没有读取能力时缺省，引用必须失败关闭。 */
export interface StudioReferencePort {
  runId: string;
  /** 允许产出引用的步骤 id 前缀（例如 `workflow:n1:`）；解析侧按产出节点推导，可省略。 */
  stepOwners?: readonly string[];
  workspaceIdentity?: string;
  /** 重新读取 `workspace-file` 引用目标；不实现时该引用无法取证。 */
  fileVersion?(runId: string, stepId: string, relativePath: string): Promise<string | null>;
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
  /** 引用解析上下文；缺省时结构化 `{{ref.*}}` 引用失败关闭。 */
  reference?: StudioReferencePort;
}
export interface StudioWorkspacePort {
  prepare(params: {
    runId: string;
    stepId: string;
    sourcePath: string;
    mode: "isolated" | "shared";
  }): Promise<string>;
  changes(runId: string, stepId: string): Promise<StudioWorkspaceChange[]>;
  /** 返回 Host 自己生成的应用回执；旧实现可以继续返回 `void`（此时无法取得操作 id）。 */
  apply(runId: string, stepId: string, paths: string[]): Promise<StudioApplyReceipt | void>;
  /** 重新读取已发布的项目文件哈希，供验收取证；本地 Host 之外不适用。 */
  versions?(runId: string, stepId: string, paths: string[]): Promise<StudioFileVersion[]>;
  /**
   * 把工作区之外的输入复制进本次运行的工作区，并记录来源 + 真实版本。
   * 可选能力：不实现时不能导入外部文件（不得退化为直接读取任意路径）。
   */
  importFile?(params: {
    runId: string;
    stepId: string;
    sourcePath: string;
    name: string;
  }): Promise<StudioImportReceipt>;
  /** 读取本次运行内某步骤工作区文件的当前哈希；用于引用存在性与版本校验。 */
  referenceVersion?(
    runId: string,
    stepId: string,
    relativePath: string,
  ): Promise<StudioReferenceVersion>;
}
