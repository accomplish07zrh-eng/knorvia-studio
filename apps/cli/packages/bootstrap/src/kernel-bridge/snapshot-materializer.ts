/* eslint-disable max-lines -- 快照构造、配置归约与 DSH 事件翻译共用同一套 control/availability/inputRouting 派生函数；拆开后三处会各自复制一份派生规则，反而更容易漂移。 */
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-01: 会话快照物化与 revision 推进（合同 B8–B11）
//
// 本文件是桥自己的快照事实源：初始快照完全按 @knorvia/shared/protocol-v4 的
// ConversationSnapshot schema 逐字段构造，不依赖旧运行时的 projection 状态工厂。
// revision 只在用户可见状态实际变化时推进；同值配置命令仍占一个事件序号，但不改快照。
//
// DSH 源事件到 v4 行/控制面的翻译也在这里：它只做「事件 → 快照形状」的纯映射，
// 不持有会话身份、序号与订阅，因此可以和序号记账（projection-layer）分开读。

import { resolveExecutionState, type ExecutionState } from "@knorvia/shared";
import type {
  AssistantTextRow,
  ConversationDelta,
  ConversationSnapshot,
  ReasoningRow,
  SessionConfigState,
  StatePatch,
  ToolCallRow,
  TurnHeaderRow,
  UserInputRow,
} from "@knorvia/shared/protocol-v4";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import type { BridgeConfigMutationInput } from "./interface.js";

export interface ConfigMutationOutcome {
  readonly changed: boolean;
  readonly revision: number;
  readonly deltas: readonly ConversationDelta[];
  readonly nextConfig: SessionConfigState;
}

/** 行的可变记账：rowId 单调不复用，turn 与工具调用用于把后续事件挂回原行。 */
export interface ProjectionCursor {
  nextRowId: number;
  turn: { readonly turnId: string; readonly rowId: number; readonly startedAt: number } | null;
  readonly toolRowIdByCallId: Map<string, number>;
}

/** 单个源事件的投影结果：行增量 + 控制面替换 + 计量增量。 */
export interface EventProjection {
  readonly rowDeltas: ConversationDelta[];
  /** 需要整体替换 control 时给出新值；null 表示只把控制面清空（turn 结束）。 */
  control?: ConversationSnapshot["control"];
  /** control 之外的 A 区替换字段。 */
  readonly patch: StatePatch;
  /** 本事件推进的 usage 累计值；缺省表示不改变计量。 */
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheRead: number;
    readonly cacheWrite: number;
  };
}

const PERMISSION_MODES: readonly ExecutionState["mode"][] = ["build", "edit", "yolo", "auto"];

/** 把任意字符串模式收窄到 execution-state 词表；未知值按 build 处理。 */
function normalizePermissionMode(mode: string): ExecutionState["mode"] {
  const matched = PERMISSION_MODES.find((candidate) => candidate === mode);
  return matched ?? "build";
}

/**
 * 会话可执行能力由 phase 派生（不落库、不缓存）：草稿只能配置，运行中才能停止/压缩，
 * 有历史行才允许 fork。reasonCode 与旧运行时词表一致，客户端不需要新分支。
 */
export function deriveAvailability(
  phase: ConversationSnapshot["control"]["phase"],
  totalRows: number,
): ConversationSnapshot["availability"] {
  const running = phase === "running" || phase === "prewarming";
  const hasRows = totalRows > 0;
  return {
    fork: hasRows ? { allowed: true } : { allowed: false, reasonCode: "forkTargetNotStable" },
    compact: running ? { allowed: true } : { allowed: false, reasonCode: "idleCannotCompact" },
    switchModelConfig: { allowed: true },
    setFollowupMode: { allowed: true },
    queueEdit: { allowed: true },
    sendQueuedNow: running
      ? { allowed: true }
      : { allowed: false, reasonCode: "sendQueuedNowRequiresRunning" },
    pauseGoal: { allowed: false, reasonCode: "noGoalToPause" },
    resumeGoal: { allowed: false, reasonCode: "noGoalToResume" },
  };
}

/** 输入路由由 phase + followupMode 派生：只有运行中才谈得上 guide/enqueue。 */
export function deriveInputRouting(
  phase: ConversationSnapshot["control"]["phase"],
  followupMode: SessionConfigState["followupMode"],
): ConversationSnapshot["inputRouting"] {
  if (phase !== "running" && phase !== "prewarming") return { mode: "startNow" };
  return followupMode === "guide" ? { mode: "guide" } : { mode: "enqueue" };
}

function textOfContent(
  content: readonly { readonly type: string; readonly text?: string }[],
): string {
  let text = "";
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") text += block.text;
  }
  return text;
}

/** turn/end 的 reason 决定收尾语义：成功、被打断、失败各对应一个 phase。 */
function phaseAfterTurnEnd(reason: {
  readonly kind: string;
}): ConversationSnapshot["control"]["phase"] {
  switch (reason.kind) {
    case "completed":
      return "completedSuccess";
    case "error":
      return "error";
    default:
      return "completedInterrupted";
  }
}

/** 草稿控制面：没有 turn 在跑，因此不可停止、没有活跃工作、也没有错误。 */
function draftControl(): ConversationSnapshot["control"] {
  return {
    phase: "draft",
    sessionEnded: false,
    stopState: "idle",
    canStop: false,
    stopTargetKind: "unknown",
    lastError: null,
    activeWorks: [],
    apiRetry: null,
  };
}

/** 空行窗口：草稿会话没有任何 transcript，三个字段必须同时为空。 */
function emptyRows(): ConversationSnapshot["rows"] {
  return { window: [], totalCount: 0, firstRowId: null };
}

/** 空子代理账本：草稿没有派发过子会话。 */
function emptySubagents(): ConversationSnapshot["subagents"] {
  return { revision: 0, childSessionIds: [], running: [], endedTotal: 0 };
}

/** 零计量：草稿未发生模型调用，累计 token 从 0 起算。 */
function emptyUsage(): ConversationSnapshot["usage"]["cumulative"] {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

/** 按 schema 构造草稿快照；initialConfig 只覆盖 config，不伪造任何可见事实。 */
export class SnapshotMaterializer {
  static createDraftSnapshot(
    sessionId: string,
    logEpoch: string,
    initialConfig?: Partial<SessionConfigState>,
  ): ConversationSnapshot {
    const config: SessionConfigState = {
      provider: "",
      model: "",
      thought: "",
      thoughtLevels: [],
      followupMode: "queue",
      mode: "build",
      planEnabled: false,
      ...initialConfig,
    };

    return {
      protocolVersion: 1,
      sessionId,
      logEpoch,
      // 草稿还没有任何事件：水位与 CAS 版本都停在 0，控制面是纯派生值。
      control: draftControl(),
      seq: 0,
      revision: 0,
      availability: deriveAvailability("draft", 0),
      inputRouting: deriveInputRouting("draft", config.followupMode),
      config,
      meta: { title: "", titleSource: "default" },
      rows: emptyRows(),
      queue: { items: [], autoDrain: true },
      subagents: emptySubagents(),
      usage: { contextWindow: null, cumulative: emptyUsage() },
      modelTransition: null,
      pendingInteractions: [],
      pendingCommands: [],
      backgroundWorks: [],
      goal: null,
      plan: null,
      workspaceHookAdmission: null,
    };
  }

  /**
   * 应用配置变更并判定 revision 是否推进。
   *
   * - followupMode 独立于权限模式；同值不产生 delta。
   * - mode/planEnabled 交给共享的 resolveExecutionState 归约：plan 是正交开关，
   *   不会写进 mode（mode 只取 build/edit/yolo/auto）。
   * - 只有归约结果与当前 config 不同才算可见变更；no-op 返回空 deltas，revision 不动。
   */
  static applyConfigMutation(
    currentSnapshot: ConversationSnapshot,
    mutation: BridgeConfigMutationInput["mutation"],
    currentRevision: number,
  ): ConfigMutationOutcome {
    const currentConfig = currentSnapshot.config;

    let followupMode = currentConfig.followupMode;
    let followupChanged = false;
    if (
      mutation.followupMode !== undefined &&
      mutation.followupMode !== currentConfig.followupMode
    ) {
      followupMode = mutation.followupMode;
      followupChanged = true;
    }

    let mode = currentConfig.mode;
    let planEnabled = currentConfig.planEnabled ?? false;
    let executionChanged = false;
    if (mutation.mode !== undefined || mutation.planEnabled !== undefined) {
      const currentExecution: ExecutionState = {
        mode: normalizePermissionMode(currentConfig.mode),
        planEnabled: currentConfig.planEnabled ?? false,
      };
      const resolved = resolveExecutionState(
        { mode: mutation.mode, planEnabled: mutation.planEnabled },
        currentExecution,
      );
      if (
        resolved.mode !== currentExecution.mode ||
        resolved.planEnabled !== currentExecution.planEnabled
      ) {
        mode = resolved.mode;
        planEnabled = resolved.planEnabled;
        executionChanged = true;
      }
    }

    // kernel-bridge-03 的三个新增配置类变更（都只改快照、不跑回合）。
    //
    // `renameSession`：标题 + 来源一起改。**必须**把 `titleSource` 设为 `custom`——
    // 否则模型自动生成的标题会把用户显式重命名覆盖掉（`sessionMetaStateSchema` 的
    // 注释写明：custom = 用户显式重命名，不再被自动标题覆盖）。
    const titleChanged =
      mutation.title !== undefined &&
      (mutation.title !== currentSnapshot.meta.title ||
        (mutation.titleSource !== undefined &&
          mutation.titleSource !== currentSnapshot.meta.titleSource));

    // `switchModelConfig`：只更新配置里的模型选择，**不触发模型轮**。
    // 与「发一条消息」的区别就在于此：这里没有任何 executor 调用。
    const nextModelSelection =
      mutation.modelSelection === undefined
        ? currentConfig.modelSelection
        : mutation.modelSelection;
    const modelChanged =
      mutation.modelSelection !== undefined &&
      (currentConfig.modelSelection === undefined ||
        currentConfig.modelSelection.providerId !== mutation.modelSelection.providerId ||
        currentConfig.modelSelection.modelId !== mutation.modelSelection.modelId ||
        currentConfig.modelSelection.options?.reasoningLevel !==
          mutation.modelSelection.options?.reasoningLevel);

    // `setAssistantFeedback`：**反馈属于行**（`rows.ts` L164 的 `assistantText.feedback`），
    // 不是快照级字段——所以这里不写快照，而是产出一条 `row.upserted` 更新那一行。
    // `null` 表示清除：行上没有 `feedback` 键（而不是 `feedback: null`，schema 是 optional 不是 nullable）。
    const feedbackRequested = mutation.assistantFeedback !== undefined;
    const feedbackRowId = mutation.assistantFeedbackRowId;

    if (
      !followupChanged &&
      !executionChanged &&
      !titleChanged &&
      !modelChanged &&
      !feedbackRequested
    ) {
      return { changed: false, revision: currentRevision, deltas: [], nextConfig: currentConfig };
    }

    const nextRevision = currentRevision + 1;
    const nextConfig: SessionConfigState = {
      ...currentConfig,
      followupMode,
      mode,
      planEnabled,
      ...(mutation.modelSelection === undefined ? {} : { modelSelection: nextModelSelection }),
    };
    const patch: StatePatch = {
      revision: nextRevision,
      config: nextConfig,
      // 运行中切换 followupMode 会改变输入路由，客户端据此决定入队还是引导。
      inputRouting: deriveInputRouting(currentSnapshot.control.phase, followupMode),
      // 标题只在真的改了时才进 patch，避免把「没改」也写成一次状态更新。
      ...(titleChanged
        ? {
            meta: {
              title: mutation.title ?? currentSnapshot.meta.title,
              titleSource: mutation.titleSource ?? currentSnapshot.meta.titleSource,
            },
          }
        : {}),
    };

    // 反馈走行操作而不是状态补丁：它更新的是某一行的呈现，与快照配置无关。
    // 行在快照里的位置是 `rows.window`（分页窗口），不是顶层数组。
    // `deltas` 是 readonly 数组，所以先算出额外的行操作再拼接，而不是 push。
    const patchDelta: ConfigMutationOutcome["deltas"][number] = { op: "state.updated", patch };
    const feedbackDelta = (() => {
      const extra: ConfigMutationOutcome["deltas"][number][] = [];
      if (!feedbackRequested || feedbackRowId === undefined) return extra;
      const target = currentSnapshot.rows.window.find((row) => row.rowId === feedbackRowId);
      if (target === undefined || target.kind !== "assistantText") return extra;
      const { feedback: _previous, ...withoutFeedback } = target;
      extra.push({
        op: "row.upserted",
        row:
          mutation.assistantFeedback === null
            ? { ...withoutFeedback }
            : { ...withoutFeedback, feedback: mutation.assistantFeedback },
      } as ConfigMutationOutcome["deltas"][number]);
      return extra;
    })();
    const deltas: ConfigMutationOutcome["deltas"] = [patchDelta, ...feedbackDelta];

    return {
      changed: true,
      revision: nextRevision,
      deltas,
      nextConfig,
    };
  }

  /**
   * 为链路打帧取快照副本。两个 clientMode 共用同一份内容，profile 不改变快照。
   */
  static getWireSnapshot(snapshot: ConversationSnapshot): ConversationSnapshot {
    return {
      ...snapshot,
      rows: {
        ...snapshot.rows,
      },
    };
  }
}

/**
 * DSH 会话事件 → v4 行与控制面。
 *
 * 只投影用户可见事实：轮次边界、用户输入、模型正文/思考、工具调用与结果、计量。
 * 日志专用事件（step/*、request/*、session/end-seed…）返回空投影：调用方仍应占用一个 seq，
 * 让客户端从 (fromSeq,toSeq] 得知「水位推进、状态未变」。
 */
export class DshEventProjector {
  static project(
    snapshot: ConversationSnapshot,
    cursor: ProjectionCursor,
    event: SessionEvent,
    toSeq: number,
  ): EventProjection {
    switch (event.type) {
      case "turn/start":
        return DshEventProjector.projectTurnStart(cursor, event.time, event.data.turn, toSeq);
      case "user/message":
        return DshEventProjector.projectUserMessage(cursor, event, toSeq);
      case "assistant/message":
        return DshEventProjector.projectAssistantMessage(snapshot, cursor, event, toSeq);
      case "tool/call":
        return DshEventProjector.projectToolCall(cursor, event, toSeq);
      case "tool/result":
        return DshEventProjector.projectToolResult(snapshot, cursor, event);
      case "turn/end":
        return DshEventProjector.projectTurnEnd(snapshot, cursor, event);
      default:
        return { rowDeltas: [], patch: {} };
    }
  }

  private static projectTurnStart(
    cursor: ProjectionCursor,
    time: number,
    turn: number,
    toSeq: number,
  ): EventProjection {
    const turnId = `turn-${turn}`;
    const row: TurnHeaderRow = {
      kind: "turnHeader",
      rowId: allocateRowId(cursor),
      turnId,
      origin: "userInput",
      executionKind: "agent",
      state: "running",
      startedAt: time,
      createdAt: time,
      createdAtSeq: toSeq,
    };
    cursor.turn = { turnId, rowId: row.rowId, startedAt: time };
    return {
      rowDeltas: [{ op: "row.appended", row }],
      control: {
        phase: "running",
        sessionEnded: false,
        canStop: true,
        stopState: "stoppable",
        stopTargetKind: "assistant",
        activeWorks: [{ kind: "primaryTurn", startedAt: time }],
        lastError: null,
        apiRetry: null,
      },
      patch: {},
    };
  }

  private static projectUserMessage(
    cursor: ProjectionCursor,
    event: SessionEvent<"user/message">,
    toSeq: number,
  ): EventProjection {
    const row: UserInputRow = {
      kind: "userInput",
      rowId: allocateRowId(cursor),
      turnId: cursor.turn?.turnId ?? `turn-${event.seq}`,
      // 只有真实用户来源才算 realUser；注入上下文用 synthetic，避免伪装成人话。
      origin: event.data.source.kind === "user" ? "realUser" : "synthetic",
      text: textOfContent(event.data.content),
      createdAt: event.time,
      createdAtSeq: toSeq,
    };
    return { rowDeltas: [{ op: "row.appended", row }], patch: {} };
  }

  private static projectAssistantMessage(
    snapshot: ConversationSnapshot,
    cursor: ProjectionCursor,
    event: SessionEvent<"assistant/message">,
    toSeq: number,
  ): EventProjection {
    const turnId = cursor.turn?.turnId ?? `turn-${event.data.turn}`;
    const rowDeltas: ConversationDelta[] = [];

    let reasoning = "";
    for (const block of event.data.message.content) {
      if (block.type === "reasoning") reasoning += block.text;
    }
    if (reasoning.length > 0) {
      const reasoningRow: ReasoningRow = {
        kind: "reasoning",
        rowId: allocateRowId(cursor),
        turnId,
        text: reasoning,
        state: event.data.interrupted ? "interrupted" : "complete",
        createdAt: event.time,
        createdAtSeq: toSeq,
      };
      rowDeltas.push({ op: "row.appended", row: reasoningRow });
    }

    const text = textOfContent(event.data.message.content);
    if (text.length > 0) {
      const row: AssistantTextRow = {
        kind: "assistantText",
        rowId: allocateRowId(cursor),
        turnId,
        text,
        state: event.data.interrupted ? "interrupted" : "complete",
        model: snapshot.config.model.length > 0 ? snapshot.config.model : undefined,
        createdAt: event.time,
        createdAtSeq: toSeq,
      };
      rowDeltas.push({ op: "row.appended", row });
    }

    const usage = event.data.usage;
    return {
      rowDeltas,
      patch: {},
      usage: usage
        ? {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheRead: usage.cacheReadTokens ?? 0,
            cacheWrite: usage.cacheWriteTokens ?? 0,
          }
        : undefined,
    };
  }

  private static projectToolCall(
    cursor: ProjectionCursor,
    event: SessionEvent<"tool/call">,
    toSeq: number,
  ): EventProjection {
    const row: ToolCallRow = {
      kind: "toolCall",
      rowId: allocateRowId(cursor),
      turnId: cursor.turn?.turnId ?? `turn-${event.data.turn}`,
      toolCallId: event.data.callId,
      toolName: event.data.name,
      status: "running",
      inputText: event.data.arguments,
      startedAt: event.time,
      createdAt: event.time,
      createdAtSeq: toSeq,
    };
    cursor.toolRowIdByCallId.set(event.data.callId, row.rowId);
    return { rowDeltas: [{ op: "row.appended", row }], patch: {} };
  }

  private static projectToolResult(
    snapshot: ConversationSnapshot,
    cursor: ProjectionCursor,
    event: SessionEvent<"tool/result">,
  ): EventProjection {
    const rowId = cursor.toolRowIdByCallId.get(event.data.message.toolCallId);
    if (rowId === undefined) return { rowDeltas: [], patch: {} };
    const existing = snapshot.rows.window.find((row) => row.rowId === rowId);
    if (existing === undefined || existing.kind !== "toolCall") {
      return { rowDeltas: [], patch: {} };
    }
    const row: ToolCallRow = {
      ...existing,
      status: event.data.message.isError ? "error" : "success",
      output: { text: textOfContent(event.data.message.content) },
      endedAt: event.time,
    };
    return { rowDeltas: [{ op: "row.upserted", row }], patch: {} };
  }

  private static projectTurnEnd(
    snapshot: ConversationSnapshot,
    cursor: ProjectionCursor,
    event: SessionEvent<"turn/end">,
  ): EventProjection {
    const phase = phaseAfterTurnEnd(event.data.reason);
    const rowDeltas: ConversationDelta[] = [];
    const turn = cursor.turn;
    if (turn) {
      const existing = snapshot.rows.window.find((row) => row.rowId === turn.rowId);
      if (existing !== undefined && existing.kind === "turnHeader") {
        const row: TurnHeaderRow = {
          ...existing,
          state:
            phase === "completedSuccess"
              ? "completedSuccess"
              : phase === "error"
                ? "failed"
                : "completedInterrupted",
          endedAt: event.time,
          activeMs: Math.max(0, event.time - turn.startedAt),
        };
        rowDeltas.push({ op: "row.upserted", row });
      }
    }
    const failure = event.data.reason.kind === "error" ? event.data.reason.error : undefined;
    cursor.turn = null;
    return {
      rowDeltas,
      control: {
        phase,
        sessionEnded: true,
        canStop: false,
        stopState: "idle",
        stopTargetKind: "unknown",
        activeWorks: [],
        lastError: failure
          ? {
              code: failure.code,
              message: failure.message,
              recoverable: false,
              at: event.time,
              source: "provider",
            }
          : null,
        apiRetry: null,
      },
      patch: {},
    };
  }
}

function allocateRowId(cursor: ProjectionCursor): number {
  const rowId = cursor.nextRowId;
  cursor.nextRowId += 1;
  return rowId;
}
