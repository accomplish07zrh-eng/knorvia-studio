// SPDX-License-Identifier: Apache-2.0
// 会话持久化：五个 phase 顺序落库（store.create → model_selection → shell_snapshot →
// execution_state → title_event），sessionPersisted 置位在标题事件之前——它是唯一写者，
// 失败不置位（可重试整段）。日志序列：started →（落库）→ persisted debug → 标题事件 → completed。
import { SessionEventType, traceContextToLogContext } from "../../deps.js";
import type { SessionId, TraceContext } from "@knorvia/contracts";
import type { WorkspaceId } from "@knorvia/contracts";
import { projectIdFromDirectory, slugify, titleFromInput } from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import { buildExecutionStateEntry, readRuntimeExecutionState } from "../../execution-state.js";
import { persistRuntimeModelSelection } from "../turn-model.js";
import { persistSessionShellEnvironmentSnapshot } from "../session-shell-environment.js";

/** 管线 phase 标记（逐字常量，用于失败定位）。 */
const PHASE_STORE_CREATE = "session_store.create";
const PHASE_MODEL_SELECTION = "session_model_selection";
const PHASE_SHELL_SNAPSHOT = "session_shell_snapshot";
const PHASE_EXECUTION_STATE = "session_execution_state";
const PHASE_TITLE_EVENT = "session_title_event";

/** 会话持久化日志文案与事件名（逐字常量）。 */
const SESSION_LOG_TEXT = {
  completed: "Session persistence completed",
  completedEvent: "session.persistence.completed",
  failed: "Session persistence failed",
  failedEvent: "session.persistence.failed",
  module: "core.runtime",
  persisted: "Session persisted",
  persistedEvent: "session.persisted",
  started: "Session persistence started",
  startedEvent: "session.persistence.started",
} as const;

/** 标题来源（逐字常量）。 */
const FIRST_INPUT_SOURCE = "first_input";

/** 失败标记（逐字常量）。 */
const FAILED_TAG = "failed";

/** 当前毫秒时刻（单点取样入口）。 */
const clockNow = (): number => Date.now();

/** 持久化所需的运行时端口面。 */
export interface SessionPersistPorts {
  /** 会话 id。 */
  sessionId: SessionId;
  /** 工作目录。 */
  workingDirectory: string;
  /** 应用版本。 */
  appVersion: string;
  /** 已持久化位读取（短路判定）。 */
  isSessionPersisted: () => boolean;
  /** 置位写入（本模块唯一写者，失败不置位）。 */
  markSessionPersisted: () => void;
  /** 运行配置。 */
  config: {
    workspaceIdentity?: string;
    workspacePath?: string;
    parentSessionId?: string;
    taskType?: string;
    mode?: string;
    memory?: { workspaceIdentity?: string };
  };
  /** 会话存储端口。 */
  sessionStore?: {
    createSession?(record: unknown): Promise<void> | void;
    saveSessionEntry?(entry: unknown): Promise<void> | void;
    [method: string]: unknown;
  };
  /** 当前模型选择（可缺）。 */
  getSessionModelSelection?: () => unknown;
  /** 标题事件出口（走 B23 管线）。 */
  deliverTitleEvent: (payload: unknown, traceContext: TraceContext) => Promise<void>;
  /** 日志出口。 */
  logger?: {
    info: (message: string, fields: Record<string, unknown>) => void;
    warn: (message: string, fields: Record<string, unknown>) => void;
    debug: (message: string, fields: Record<string, unknown>) => void;
  };
}

/** 会话首次落盘：短路（无 store 或已持久化）→ 五 phase → 置位 → 标题事件。 */
export async function persistSessionFirstTime(
  runtime: AgentRuntimeInternal,
  ports: SessionPersistPorts,
  input: string,
  traceContext: TraceContext,
): Promise<void> {
  if (!ports.sessionStore || ports.isSessionPersisted()) return;
  const startedAt = clockNow();
  let phase = PHASE_STORE_CREATE;
  const log = ports.logger;
  log?.info(SESSION_LOG_TEXT.started, {
    ...traceContextToLogContext(traceContext),
    event: SESSION_LOG_TEXT.startedEvent,
    module: SESSION_LOG_TEXT.module,
    sessionId: ports.sessionId,
    status: "started",
  });
  try {
    const directory = ports.workingDirectory;
    const persistedPath = ports.config.workspacePath ?? directory;
    const title = titleFromInput(input);
    const trimmedIdentity = ports.config.memory?.workspaceIdentity?.trim();
    await ports.sessionStore.createSession?.({
      id: ports.sessionId,
      projectID: projectIdFromDirectory(directory),
      workspaceID: ports.config.workspaceIdentity ?? (trimmedIdentity as WorkspaceId | undefined),
      parentID: ports.config.parentSessionId,
      traceID: traceContext.traceId,
      taskType: ports.config.taskType,
      slug: slugify(ports.sessionId),
      directory: persistedPath,
      path: persistedPath,
      title,
      titleSource: FIRST_INPUT_SOURCE,
      version: ports.appVersion,
      permission: { mode: ports.config.mode ?? "build" },
    });

    phase = PHASE_MODEL_SELECTION;
    const selection = ports.getSessionModelSelection?.();
    if (selection) await persistRuntimeModelSelection(runtime, selection as never);

    phase = PHASE_SHELL_SNAPSHOT;
    await persistSessionShellEnvironmentSnapshot(runtime, traceContext);

    phase = PHASE_EXECUTION_STATE;
    await ports.sessionStore.saveSessionEntry?.(
      buildExecutionStateEntry(ports.sessionId, readRuntimeExecutionState(runtime)),
    );

    // 置位点：标题事件之前——失败可整段重试。
    ports.markSessionPersisted();
    log?.debug(SESSION_LOG_TEXT.persisted, {
      ...traceContextToLogContext(traceContext),
      event: SESSION_LOG_TEXT.persistedEvent,
      module: SESSION_LOG_TEXT.module,
      status: "completed",
    });

    phase = PHASE_TITLE_EVENT;
    const titlePayload: Record<string, unknown> = {};
    titlePayload.previousTitle = "";
    titlePayload.source = FIRST_INPUT_SOURCE;
    titlePayload.title = title;
    await ports.deliverTitleEvent(titlePayload, traceContext);

    log?.info(SESSION_LOG_TEXT.completed, {
      ...traceContextToLogContext(traceContext),
      durationMs: clockNow() - startedAt,
      event: SESSION_LOG_TEXT.completedEvent,
      module: SESSION_LOG_TEXT.module,
      sessionId: ports.sessionId,
      status: "completed",
    });
  } catch (error) {
    log?.warn(SESSION_LOG_TEXT.failed, {
      ...traceContextToLogContext(traceContext),
      durationMs: clockNow() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
      event: SESSION_LOG_TEXT.failedEvent,
      module: SESSION_LOG_TEXT.module,
      phase,
      sessionId: ports.sessionId,
      status: FAILED_TAG,
    });
    throw error;
  }
}

/** 标题事件类型（逐字对外，供门面接线）。 */
export const SESSION_TITLE_EVENT_TYPE = SessionEventType.SessionTitleUpdated;
