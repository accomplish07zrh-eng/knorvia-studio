import { countContextPrefixMessages } from "../deps.js";
import type { EnvInfo, ExecutionShellSelection, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { AgentRuntimeConfig } from "../types.js";
import {
  persistBashShellSelectionSnapshot,
  readPersistedBashShellSelectionSnapshot,
  resolveBashShellSnapshotForResume,
  type BashShellSnapshotRestore,
} from "./bash-shell-snapshot.js";
import { rebuildContextPrefix } from "./context-refresh.js";
import {
  buildShellEnvironmentResumeNotice,
  getShellEnvironmentResumeNoticeKind,
} from "./shell-environment.js";
import { refreshBranchAwareBuiltInTools } from "./embedded-search-branch.js";

type SessionShellConfig = Pick<AgentRuntimeConfig, "bashShellSelection">;

export type SessionShellEnvironmentCandidate =
  | ExecutionShellSelection
  | (() => ExecutionShellSelection);

interface SessionShellEnvironment {
  selection: ExecutionShellSelection;
  promptShell: string;
}

export function getSessionShellSelectionFromConfig(
  config: SessionShellConfig,
): ExecutionShellSelection | undefined {
  return config.bashShellSelection;
}

export function getSessionShellEnvironment(
  runtime: AgentRuntimeInternal,
): SessionShellEnvironment | undefined {
  const selection = getSessionShellSelectionFromConfig(runtime.config);
  if (!selection) return undefined;
  return {
    promptShell: selection.display.name,
    selection,
  };
}

export function getSessionShellSelection(
  runtime: AgentRuntimeInternal,
): ExecutionShellSelection | undefined {
  return getSessionShellEnvironment(runtime)?.selection;
}

export function getContextSourceShellDisplayName(
  runtime: AgentRuntimeInternal,
): string | undefined {
  return getSessionShellEnvironment(runtime)?.promptShell;
}

export function initializeSessionShellEnvironmentIfNeeded(
  runtime: AgentRuntimeInternal,
  candidate: SessionShellEnvironmentCandidate,
): boolean {
  if (getSessionShellEnvironment(runtime)) return false;
  const selection = typeof candidate === "function" ? candidate() : candidate;
  applySessionShellSelection(runtime, selection, {
    refreshPreConversationContext: true,
  });
  return true;
}

export async function persistSessionShellEnvironmentSnapshot(
  runtime: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<void> {
  await persistBashShellSelectionSnapshot({
    logger: runtime.logger,
    selection: getSessionShellSelection(runtime),
    sessionId: runtime.sessionId,
    sessionStore: runtime.sessionStore,
    traceContext,
  });
}

export async function restoreSessionShellEnvironmentSelectionForResume(
  runtime: AgentRuntimeInternal,
  options: {
    currentSelection: ExecutionShellSelection | undefined;
    traceContext: TraceContext;
  },
): Promise<BashShellSnapshotRestore> {
  const restore = resolveBashShellSnapshotForResume({
    currentSelection: options.currentSelection,
    logger: runtime.logger,
    restore: await readPersistedBashShellSelectionSnapshot({
      logger: runtime.logger,
      sessionId: runtime.sessionId,
      sessionStore: runtime.sessionStore,
      traceContext: options.traceContext,
    }),
    traceContext: options.traceContext,
  });
  if (restore.status === "restored" || restore.status === "fallback") {
    applySessionShellSelection(runtime, restore.selection, {
      refreshPreConversationContext: false,
    });
  }
  return restore;
}

export function announceSessionShellEnvironmentNoticeAfterResume(
  runtime: AgentRuntimeInternal,
  options: {
    persistedEnvInfo: EnvInfo | undefined;
    restore: BashShellSnapshotRestore;
  },
): void {
  const selection = getSessionShellSelection(runtime);
  const noticeKind = getShellEnvironmentResumeNoticeKind({
    persistedShell: options.persistedEnvInfo?.shell,
    restoreStatus: options.restore.status,
    selection,
  });
  if (!selection || !noticeKind) return;
  const notice = buildShellEnvironmentResumeNotice(noticeKind, selection);
  const entries = runtime.messageHistory.borrowReadOnlyRuntimeEntries();
  if (
    entries.some(
      (entry) =>
        entry.kind === "attachment" &&
        entry.metadata?.source === "shell_environment_change" &&
        entry.content === notice,
    )
  ) {
    return;
  }
  runtime.messageHistory.addAttachment("shell_environment_change", notice);
}

function applySessionShellSelection(
  runtime: AgentRuntimeInternal,
  selection: ExecutionShellSelection,
  options: { refreshPreConversationContext?: boolean },
): void {
  runtime.config.bashShellSelection = selection;
  refreshBranchAwareBuiltInTools(runtime);
  if (options.refreshPreConversationContext !== false) {
    refreshPreConversationShellContext(runtime, selection);
  }
}

function refreshPreConversationShellContext(
  runtime: AgentRuntimeInternal,
  selection: ExecutionShellSelection | undefined,
): void {
  if (
    !selection ||
    !runtime.contextBuilder ||
    !runtime.contextInitialized ||
    !runtime.contextSourceSnapshot ||
    runtime.sessionPersisted
  ) {
    return;
  }
  const entries = runtime.messageHistory.borrowReadOnlyRuntimeEntries();
  if (entries.length !== countContextPrefixMessages(entries)) return;
  runtime.config.envInfo = applySessionShellToEnvInfo(runtime.config.envInfo, selection);
  runtime.contextSourceSnapshot = {
    ...runtime.contextSourceSnapshot,
    envInfo: applySessionShellToEnvInfo(runtime.contextSourceSnapshot.envInfo, selection),
  };
  rebuildContextPrefix(runtime);
}

function applySessionShellToEnvInfo(
  envInfo: EnvInfo,
  selection: ExecutionShellSelection | undefined,
): EnvInfo;
function applySessionShellToEnvInfo(
  envInfo: EnvInfo | undefined,
  selection: ExecutionShellSelection | undefined,
): EnvInfo | undefined;
function applySessionShellToEnvInfo(
  envInfo: EnvInfo | undefined,
  selection: ExecutionShellSelection | undefined,
): EnvInfo | undefined {
  if (!envInfo || !selection?.display.name) return envInfo;
  return { ...envInfo, shell: selection.display.name };
}
