import type { WorkspaceId } from "@knorvia/contracts";
import { SessionEventType, traceContextToLogContext } from "../deps.js";
import type { TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { projectIdFromDirectory, slugify, titleFromInput } from "../helpers/index.js";
import { buildExecutionStateEntry, readRuntimeExecutionState } from "../execution-state.js";
import { persistRuntimeModelSelection } from "./turn-model.js";
import { persistSessionShellEnvironmentSnapshot } from "./session-shell-environment.js";

export async function ensureSessionPersisted(
  this: AgentRuntimeInternal,
  input: string,
  traceContext: TraceContext,
): Promise<void> {
  if (!this.sessionStore || this.sessionPersisted) return;
  const startedAt = Date.now();
  let phase = "session_store.create";
  this.logger?.info("Session persistence started", {
    ...traceContextToLogContext(traceContext),
    event: "session.persistence.started",
    module: "core.runtime",
    sessionId: this.sessionId,
    status: "started",
  });
  try {
    const directory = this.workingDirectory;
    const persistedPath = this.config.workspacePath ?? directory;
    const title = titleFromInput(input);
    const workspaceIdentity = this.config.memory?.workspaceIdentity?.trim();
    await this.sessionStore.createSession({
      id: this.sessionId,
      projectID: projectIdFromDirectory(directory),
      workspaceID: this.config.workspaceIdentity ?? (workspaceIdentity as WorkspaceId | undefined),
      parentID: this.config.parentSessionId,
      traceID: traceContext.traceId,
      taskType: this.config.taskType,
      slug: slugify(this.sessionId),
      directory: persistedPath,
      path: persistedPath,
      title,
      titleSource: "first_input",
      version: this.appVersion,
      permission: { mode: this.config.mode ?? "build" },
    });
    phase = "session_model_selection";
    const selection = this.getSessionModelSelection();
    if (selection) await persistRuntimeModelSelection(this, selection);
    phase = "session_shell_snapshot";
    await persistSessionShellEnvironmentSnapshot(this, traceContext);
    phase = "session_execution_state";
    await this.sessionStore!.saveSessionEntry?.(
      buildExecutionStateEntry(this.sessionId, readRuntimeExecutionState(this)),
    );
    this.sessionPersisted = true;
    this.logger?.debug("Session persisted", {
      ...traceContextToLogContext(traceContext),
      event: "session.persisted",
      module: "core.runtime",
      status: "completed",
    });
    phase = "session_title_event";
    await this.appendEvent(
      this.createEvent(
        SessionEventType.SessionTitleUpdated,
        {
          previousTitle: "",
          source: "first_input",
          title,
        },
        traceContext,
      ),
      traceContext,
    );
    this.logger?.info("Session persistence completed", {
      ...traceContextToLogContext(traceContext),
      durationMs: Date.now() - startedAt,
      event: "session.persistence.completed",
      module: "core.runtime",
      sessionId: this.sessionId,
      status: "completed",
    });
  } catch (error) {
    this.logger?.warn("Session persistence failed", {
      ...traceContextToLogContext(traceContext),
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "session.persistence.failed",
      module: "core.runtime",
      phase,
      sessionId: this.sessionId,
      status: "failed",
    });
    throw error;
  }
}
