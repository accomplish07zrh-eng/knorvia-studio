// SPDX-License-Identifier: Apache-2.0
// 目录形状：这里只有类型事实，运行期由 locales/ 下的两份目录填充。
// 为了可读性，TUI 部分先按面板拆成具名段落类型，再由 TuiCopy 组合；对外形状不变。
import type { SupportedLocale } from "@knorvia/contracts";

export type { SupportedLocale, UiLocale } from "@knorvia/contracts";

export interface KnorviaCopy {
  cli: CliCopy;
  locale: SupportedLocale;
  tui: TuiCopy;
}

export interface CliCopy {
  errors: {
    localeUnsupported(value: string): string;
  };
  help(version: string): string;
}

export interface TuiCopy {
  copy: CopyFeedbackCopy;
  effort: EffortCopy;
  input: InputCopy;
  modelConfigurationRequired: ModelSetupCopy;
  model: ModelStatusCopy;
  sidebar: SidebarCopy;
  status: StatusLineCopy;
  terminal: TerminalCopy;
  transcript: TranscriptCopy;
  selection: SelectionCopy;
  fileMention: FileMentionCopy;
  slash: SlashCopy;
}

/** 剪贴板复制的三种结局：成功、失败、终端不支持。 */
interface CopyFeedbackCopy {
  copied: string;
  failed: string;
  unavailable: string;
}

interface EffortCopy {
  disabled: string;
  enabled: string;
}

interface InputCopy {
  activeStatusHint: string;
  busyPlaceholder: string;
  placeholder: string;
  queuedMore(count: number): string;
  queuedSubmitHint: string;
  queuedTitle(count: number): string;
  title: string;
  noHistorySource: string;
  noPreviousInput: string;
  restoredPreviousInput: string;
  restoredPreviousInputWithAttachments(count: number): string;
  restorePreviousInputFailed: string;
  typePrompt: string;
}

/** 缺少模型凭据时，标题、正文、帮助与状态行共用同一段说明。 */
interface ModelSetupCopy {
  help: string;
  message: string;
  status: string;
  title: string;
}

interface ModelStatusCopy {
  requestFailed(message: string): string;
  responseReceived: string;
  responseReceivedWithTokens(tokens: string): string;
  retryScheduled(input: {
    attempt: number;
    delay: string;
    maxAttempts: number;
    reason: string;
  }): string;
  streamStalled: string;
}

interface SidebarCopy {
  subagents: SubagentPanelCopy;
  api: ProviderPanelCopy;
  cache: CachePanelCopy;
  context: ContextPanelCopy;
  modifiedFiles: ModifiedFilesPanelCopy;
  mcp: McpPanelCopy;
  request: RequestPanelCopy;
  status: { last: string };
  run: RunPanelCopy;
  sections: SectionTitlesCopy;
  shellSubtitle: string;
  title: string;
  todos: TodoPanelCopy;
}

interface SubagentPanelCopy {
  title: string;
  empty: string;
  emptyOutput: string;
  back: string;
  readonly: string;
  loading: string;
  unavailable: string;
  retry: string;
  more: string;
  pendingMain: string;
  ended(count: number): string;
  status: Record<
    "running" | "waiting" | "blocked" | "success" | "failed" | "cancelled" | "lost",
    string
  >;
}

interface ProviderPanelCopy {
  empty: string;
  model: string;
  more(count: number): string;
  requests: string;
  server: string;
}

interface CachePanelCopy {
  hit: string;
  lastHit: string;
  lastMiss: string;
  readWrite(input: { read: string; write: string }): string;
  total: string;
}

interface ContextPanelCopy {
  cache: string;
  cacheReadWrite: string;
  inputOutput: string;
  reason: string;
  tokens: string;
  used: string;
  window: string;
}

interface ModifiedFilesPanelCopy {
  empty: string;
  more(count: number): string;
}

interface McpPanelCopy {
  empty: string;
  loadFailed: string;
  loading: string;
  more(count: number): string;
  servers: string;
  status: {
    connected: string;
    connecting: string;
    disabled: string;
    disconnected: string;
    failed: string;
    untrusted: string;
  };
  summary(input: { connected: number; total: number }): string;
  tools(count: number): string;
}

interface RequestPanelCopy {
  complete: string;
  error: string;
  errorWithStatus(statusCode: number): string;
  pending: string;
}

interface RunPanelCopy {
  draft: string;
  draftChars(count: number): string;
  draftEmpty: string;
  messages: string;
  mode: string;
  model: string;
  provider: string;
  thought: string;
  trace: string;
  turn: string;
  workspace: string;
}

interface SectionTitlesCopy {
  apis: string;
  context: string;
  mcp: string;
  modifiedFiles: string;
  run: string;
  status: string;
  todos: string;
}

interface TodoPanelCopy {
  empty: string;
  more(count: number): string;
  progress: string;
}

interface StatusLineCopy {
  compactFailed: string;
  compacted: string;
  compacting: string;
  interruptedStreamDiscarded: string;
  modelCalling: string;
  permissionRequested(toolName: string): string;
  permissionResolved(toolName: string): string;
  ready: string;
  recoveringStream: string;
  retryingStream: string;
  sessionResumed: string;
  targetChanged(action: string): string;
  thinking: string;
  toolCompleted(toolName: string): string;
  toolFailed(toolName: string): string;
  toolPending(toolName: string): string;
  toolRunning(toolName: string): string;
  turnFailed: string;
}

interface TerminalCopy {
  requiresInteractive: string;
  starting: string;
}

interface TranscriptCopy {
  compact: CompactionCopy;
  roles: { agent: string; system: string; user: string };
  thought: { complete: string; thinking: string };
  title: string;
  workflow: WorkflowCopy;
}

interface CompactionCopy {
  completed: string;
  failed: string;
  interrupted: string;
  retry(command: string): string;
  retrying(input: { attempt: number; maxAttempts: number }): string;
  skipped: string;
  started: string;
}

interface WorkflowCopy {
  actors: string;
  actorRow(input: { name: string; status: string }): string;
  usage(input: { spentTokens: number }): string;
  collapsed(input: {
    label: string;
    status: string;
    nodesSettled: number;
    nodesTotal: number;
  }): string;
  error(message: string): string;
  expandHint: string;
  collapseHint: string;
  log: string;
  nodes(input: { nodesSettled: number; nodesTotal: number }): string;
  result(preview: string): string;
  status: {
    completed: string;
    errored: string;
    pending: string;
    running: string;
    stopped: string;
  };
  /** `stopped` 的原因词。 */
  stopReason: {
    user: string;
    model: string;
    provider: string;
    interrupted: string;
    superseded: string;
  };
  truncated: string;
  interruptedNotice(input: { label: string; runId: string }): string;
}

interface SelectionCopy {
  defaultHelp: string;
  disabled(reason: string): string;
  filterLine(input: { filter: string; help?: string }): string;
  noFilter: string;
}

interface FileMentionCopy {
  empty: string;
  loading: string;
  row(input: { path: string; selected: boolean }): string;
  title: string;
}

interface SlashCopy {
  title: string;
  row(input: { name: string; selected: boolean; summary: string }): string;
}
