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
  options: string[];
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
export type StudioKernelEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; text: string }
  | { type: "progress"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool";
      id: string;
      name: string;
      state: "running" | "succeeded" | "failed";
      input?: string;
      output?: string;
    }
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
