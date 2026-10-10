import type { StudioKernelProbe } from "./adapters/kernels/probeResult.js";

export type LocalStudioKernelId =
  | "knorvia"
  | "codex"
  | "claude-code"
  | "grok-build"
  | "opencode"
  | "qoder"
  | "qoder-cn"
  | "gemini-cli"
  | "antigravity"
  | "goose"
  | "kimi-cli"
  | "copilot"
  | "hermes"
  | "qwen-code"
  | "mistral-vibe"
  | "deepseek-harness"
  | "devin"
  | "cursor"
  | "factory-droid"
  | "cline"
  | "auggie"
  | "junie"
  | `acp:${string}`;
/** Stable SSH workspace identity, never the ephemeral connection/session id. */
export type StudioKernelId = LocalStudioKernelId | `ssh:${string}:${LocalStudioKernelId}`;
export type StudioPermission = "read-only" | "ask" | "full-access";
export interface StudioKernelConfig {
  executablePath: string;
  permission: StudioPermission;
  model?: string;
  reasoningEffort?: string;
}
export interface StudioChatSelection {
  model?: string;
  reasoningEffort?: string;
}
export interface StudioKernelOptions {
  commands?: Array<{ name: string; description: string; inputHint?: string }>;
  models: Array<{
    id: string;
    label: string;
    description?: string;
    reasoning: Array<{ id: string; label: string }>;
    defaultReasoning?: string;
    /** 缺失表示未核验，空数组或只有 text 表示明确没有图片。 */
    inputModalities?: Array<"text" | "image" | "audio">;
  }>;
  defaultModel?: string;
  error?: string;
  sharedResourceWarnings?: string[];
}
export interface StudioKernelCapabilities {
  resume: boolean;
  approval: boolean;
  questions: boolean;
  readOnly: boolean;
  fullAccess: boolean;
}
export interface StudioKernelStatus {
  id: StudioKernelId;
  displayName?: string;
  management?: "studio" | "external";
  installed: boolean;
  version?: string;
  executablePath?: string;
  origin: "builtin" | "managed" | "external" | "missing";
  capabilities: StudioKernelCapabilities;
  /** Verified in-app update path for an existing local installation, if any. */
  externalUpdate?: "native" | "npm";
  error?: string;
  /** Present only for SSH-discovered agents; used for clear host/project routing in the GUI. */
  remoteWorkspacePath?: string;
  remoteEnvironmentLabel?: string;
  /**
   * Layered probe evidence (locate/version/protocol/auth). Optional: older persisted records,
   * rejected manifests and SSH-relayed statuses carry only the legacy fields above.
   */
  probe?: StudioKernelProbe;
}

/** 显式重探请求：`refresh` 跳过短时协议缓存，用于用户主动刷新与管理动作之后。 */
export interface StudioKernelInspectOptions {
  refresh?: boolean;
}
/** A per-turn snapshot of Studio-owned MCP connections, never a global CLI config mutation. */
export type StudioSharedMcpServer =
  | {
      name: string;
      type: "stdio";
      command: string;
      args: string[];
      env: Record<string, string>;
    }
  | {
      name: string;
      type: "http" | "sse";
      url: string;
      headers: Record<string, string>;
    };
export interface StudioQuestion {
  id: string;
  title: string;
  options: Array<string | { label: string; description?: string }>;
  multiple?: boolean;
}
export interface StudioKernelInteraction {
  id: string;
  kind: "approval" | "question";
  title: string;
  detail?: string;
  questions?: StudioQuestion[];
  choices?: string[];
}
export interface StudioKernelAnswer {
  decision?: "allow-once" | "allow-session" | "deny";
  answers?: Record<string, string[]>;
}
/** Native usage snapshot. inputTokens includes cached input; missing values stay unknown. */
export interface StudioKernelUsage {
  scope?: "request" | "turn" | "reported";
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  contextUsedTokens?: number;
  contextMaxTokens?: number;
  modelSteps?: number;
}
export type StudioToolState =
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "unknown";
/** 可选增量字段；缺省与显式空字符串有不同含义，旧记录仍使用 text。 */
export interface StudioToolDetail {
  input?: string;
  output?: string;
  /** 脱敏且有界的原生 typed content JSON；不是 raw output。 */
  content?: string;
  statusDetail?: string;
}
/** 内核原生产出的媒体（specs/knorvia-kernel-native-media-20261010.md）；`uri` 与 `dataBase64` 二选一。 */
export interface StudioKernelMedia {
  kind: "image" | "video" | "audio" | "file";
  mimeType?: string;
  name?: string;
  /** http(s)、file:// 或本机绝对路径。 */
  uri?: string;
  /** 内联内容；由内核注册表落盘为文件后改为 `uri`，不进入数据库。 */
  dataBase64?: string;
  /** 内联内容超过保存上限时只保留名称。 */
  omitted?: "too-large";
}
export type StudioKernelEvent =
  | { type: "session"; sessionId: string }
  | { type: "media"; items: StudioKernelMedia[] }
  | { type: "text"; text: string }
  | { type: "progress"; text: string }
  | { type: "reasoning"; text: string }
  | (StudioToolDetail & {
      type: "tool";
      id: string;
      name: string;
      state: StudioToolState;
      /** 旧远端消息只含 text 时传回原历史详情，不能把它推断为 output。 */
      legacyText?: string;
    })
  | ({ type: "usage" } & StudioKernelUsage);
export interface StudioKernelTurn {
  runId: string;
  turnId: string;
  /** Stable for one run/step attempt, including across an uncertain SSH reconnect. */
  dispatchId?: string;
  workspaceMode?: "isolated" | "shared";
  workspaceRunId?: string;
  workspaceStepId?: string;
  conversationId: string;
  kernel: StudioKernelId;
  workspacePath: string;
  nativeSessionId?: string;
  executablePath?: string;
  model?: string;
  reasoningEffort?: string;
  permission: StudioPermission;
  text: string;
  attachments?: import("./imageTypes.js").StudioImageInput[];
  sharedMcpServers?: StudioSharedMcpServer[];
  /** Studio-owned private per-turn bridge config; removed after the native CLI exits. */
  sharedMcpConfigPath?: string;
}
export interface StudioKernelTurnResult {
  status: "succeeded" | "failed" | "cancelled" | "interrupted";
  text: string;
  nativeSessionId?: string;
  error?: string;
  resultKnown: boolean;
  retryable?: boolean;
  /** The remote member's actual project, not the local orchestration project. */
  workspacePath?: string;
  changesSummary?: string;
}
export interface StudioKernelSink {
  emit(event: StudioKernelEvent): Promise<void>;
  /** Native withdrawal cancels only this question, not the surrounding turn. */
  ask(interaction: StudioKernelInteraction, signal?: AbortSignal): Promise<StudioKernelAnswer>;
}
export interface StudioKernelAdapter {
  run(
    turn: StudioKernelTurn,
    sink: StudioKernelSink,
    signal: AbortSignal,
  ): Promise<StudioKernelTurnResult>;
}

// T04 新增的公开符号通过这里进入 `contract.ts` 的通配导出；两个模块都保持浏览器安全（无 Node 导入）。
export * from "./adapters/kernels/probeResult.js";
export * from "./domain/capabilityMatrix.js";
