// SPDX-License-Identifier: Apache-2.0
// 持久化事件分派：按事件类型查表落会话账本。**错误语义两制**（KD-1 原样）：checkpoint 落账
// 失败由 workspace 持久化层吞错转 warn（checkpoint.persist.failed），rewind 分派错误**冒泡**；
// 会话账本类（auto-resolution、steer 三类、target verification）失败只 warn 吞掉——持久化
// 尽力而为，不阻塞事件管线；TurnSteerDiscarded 逐 id 失败不中断后续 id。
import {
  createMessageId,
  createPartId,
  SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION,
  SESSION_ENTRY_USER_INPUT_AUTO_RESOLUTION,
  SessionEventType,
  traceContextToLogContext,
} from "../../deps.js";
import type {
  MessageId,
  PartId,
  SessionEvent,
  SessionId,
  TraceContext,
  TurnId,
  TurnInputIntentMetadata,
} from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import { buildPersistedConversationInputIntent } from "../input-intent-persistence.js";
import {
  persistWorkspaceCheckpointEntry,
  persistWorkspaceFileRewindEntry,
} from "../workspace-checkpoint-persistence.js";

/** 各类短别名（签名行不与历史实现同形）。 */
type RuntimePorts = AgentRuntimeInternal;
type SessionRecord = SessionEvent;
type TraceHandle = TraceContext;
type PendingTag = string;
type TextBody = string;
type CommandKind = string;
type DeliveryMode = "guide" | "queue";
type AdmittedDelivery = "queue";
type InputIntent = TurnInputIntentMetadata;

/** 账本类失败日志事件名（逐字常量）。 */
const LEDGER_FAIL_EVENTS = {
  autoResolution: "user_input_auto_resolution.persist_failed",
  deliveryChange: "session_input.delivery_change_failed",
  inputAdmit: "session_input.admit_failed",
  inputSettle: "session_input.settle_failed",
  targetVerification: "session_entry.target_completion_verification.persist_failed",
} as const;

/** 失败日志文案（逐字常量）。 */
const AUTO_RESOLUTION_FAIL_TEXT = "Failed to persist user input auto-resolution state";
const INPUT_ADMIT_FAIL_TEXT = "Failed to admit session input to ledger";
const DELIVERY_FAIL_TEXT = "Failed to persist session input delivery fallback";
const INPUT_SETTLE_FAIL_TEXT = "Failed to settle session input in ledger";
const TARGET_FAIL_TEXT = "Failed to persist target completion verification event";

const LOG_MODULE = "core.runtime";
const FAILED_TAG = "failed";
const SEND_TEXT_KIND = "sendText";
const QUEUE_DELIVERY = "queue";
const RESUMED_REASON = "session_resumed";
const PROMOTED_REASON = "promoted";
const DISCARDED_STATUS = "discarded";
const CANCELLED_STATUS = "cancelled";

/** 宽松载荷读取面（外部边界，防御式）。 */
type PayloadFields = Record<string, unknown>;

/** steer 排队载荷。 */
type QueuedInputPayload = {
  pendingInputId: PendingTag;
  input: TextBody;
  commandKind?: CommandKind;
  delivery?: DeliveryMode;
  intent?: InputIntent;
};

/** steer 改档载荷。 */
type DeliveryChangedPayload = {
  admittedDelivery: AdmittedDelivery;
  intent?: InputIntent;
  pendingInputId: PendingTag;
};

/** steer 丢弃载荷。 */
type DiscardedInputPayload = { pendingInputIds: PendingTag[]; reason?: string };

/** 目标验证载荷（字段是兼容接口）。 */
type TargetVerificationPayload = {
  anchorAssistantMessageId: MessageId;
  anchorTurnId?: TurnId;
  goalIteration?: number;
  status: string;
  targetId: string;
  verification?: { passed: boolean; reason: string; nextAction?: string | null | undefined };
  verificationId: string;
};

/** 事件公共事实（解构一次，字段简写复用）。 */
interface EventFacts {
  /** 事件标识（字符串化）。 */
  eventId: string;
  /** 存储序号。 */
  sequenceNumber: number;
  /** 所属会话。 */
  sessionId: SessionId;
  /** 事件毫秒时刻。 */
  timestampMs: number;
  /** 追踪标识。 */
  traceId: unknown;
  /** 回合标识（可缺）。 */
  turnId: unknown;
}

const eventFacts = (record: SessionRecord): EventFacts => {
  const { id, sequenceNumber, sessionId, timestamp, traceId, turnId } = record;
  return {
    eventId: String(id),
    sequenceNumber,
    sessionId,
    timestampMs: timestamp.getTime(),
    traceId,
    turnId,
  };
};

/** 故障描述（Error 取消息，其余字符串化）。 */
const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** 可选 turn 字段（有则带上）。 */
const withTurn = (turnId: unknown): PayloadFields => (turnId ? { turnId } : {});

/** 从历史消息里读既有 timeline 分部的时刻（复用避免重复创建）。 */
async function readTimelineTiming(
  ports: RuntimePorts,
  sid: SessionId,
  ref: PartId,
): Promise<{ messageCreated: number; partStarted: number | undefined } | undefined> {
  const history = await ports.sessionStore?.messages({ sessionID: sid });
  for (const message of history ?? []) {
    const found = message.parts.find((candidate) => candidate.id === ref);
    if (found === undefined || found.type !== "timeline") continue;
    const timing = { messageCreated: message.info.time.created, partStarted: found.time?.start };
    return timing;
  }
  return undefined;
}

/** 账本类失败 warn（吞掉错误，不阻塞管线）。 */
const warnLedgerFailure = (
  ports: RuntimePorts,
  trace: TraceHandle,
  text: string,
  eventName: string,
  extra: PayloadFields,
  error: unknown,
): void => {
  ports.logger?.warn(text, {
    ...traceContextToLogContext(trace),
    errorMessage: describeError(error),
    event: eventName,
    module: LOG_MODULE,
    status: FAILED_TAG,
    ...extra,
  });
};

/** auto-resolution：一条会话条目（id/类型/时刻/数据面逐字段兼容）。 */
const persistAutoResolution = async (
  ports: RuntimePorts,
  record: SessionRecord,
  trace: TraceHandle,
): Promise<void> => {
  const payload = record.payload as PayloadFields & {
    interactionId: string;
    toolCallId?: string;
    autoResolution: { startedAt: number };
  };
  const facts = eventFacts(record);
  try {
    const data: PayloadFields = {};
    data.interactionId = payload.interactionId;
    data.toolCallId = payload.toolCallId;
    data.autoResolution = payload.autoResolution;
    data.eventId = facts.eventId;
    data.sequenceNumber = facts.sequenceNumber;
    data.traceId = facts.traceId;
    Object.assign(data, withTurn(facts.turnId));
    const entry = {} as Record<string, unknown>;
    entry.id = `user-input-auto-resolution:${payload.interactionId}`;
    entry.sessionID = facts.sessionId;
    entry.type = SESSION_ENTRY_USER_INPUT_AUTO_RESOLUTION;
    entry.time = { created: payload.autoResolution.startedAt, updated: facts.timestampMs };
    entry.data = data;
    await ports.sessionStore!.saveSessionEntry?.(entry as never);
  } catch (error) {
    warnLedgerFailure(
      ports,
      trace,
      AUTO_RESOLUTION_FAIL_TEXT,
      LEDGER_FAIL_EVENTS.autoResolution,
      { interactionId: payload.interactionId },
      error,
    );
  }
};

/** steer 排队：会话输入条目（kind/delivery/payload 兼容字段）。 */
const persistQueuedInput = async (
  ports: RuntimePorts,
  record: SessionRecord,
  trace: TraceHandle,
): Promise<void> => {
  const payload = record.payload as unknown as QueuedInputPayload;
  const conversationInputIntent = buildPersistedConversationInputIntent(
    payload.input,
    payload.intent,
    "queued",
  );
  const facts = eventFacts(record);
  try {
    const body: PayloadFields = { text: payload.input };
    if (payload.intent) body.intent = payload.intent;
    if (conversationInputIntent) body.conversationInputIntent = conversationInputIntent;
    const entry = {} as Record<string, unknown>;
    entry.id = payload.pendingInputId;
    entry.sessionID = facts.sessionId;
    entry.kind = payload.intent?.kind ?? payload.commandKind ?? SEND_TEXT_KIND;
    entry.delivery = payload.delivery ?? QUEUE_DELIVERY;
    entry.payload = body;
    await ports.sessionStore!.saveSessionInput?.(entry as never);
  } catch (error) {
    warnLedgerFailure(
      ports,
      trace,
      INPUT_ADMIT_FAIL_TEXT,
      LEDGER_FAIL_EVENTS.inputAdmit,
      { pendingInputId: payload.pendingInputId },
      error,
    );
  }
};

/** steer 投递改档：逐条 update。 */
const persistDeliveryChange = async (
  ports: RuntimePorts,
  record: SessionRecord,
  trace: TraceHandle,
): Promise<void> => {
  const payload = record.payload as unknown as DeliveryChangedPayload;
  const facts = eventFacts(record);
  try {
    const change: PayloadFields = {
      delivery: payload.admittedDelivery,
      id: payload.pendingInputId,
    };
    if (payload.intent) change.intent = payload.intent;
    await ports.sessionStore!.updateSessionInputs?.({
      sessionID: facts.sessionId,
      updates: [change],
    } as never);
  } catch (error) {
    warnLedgerFailure(
      ports,
      trace,
      DELIVERY_FAIL_TEXT,
      LEDGER_FAIL_EVENTS.deliveryChange,
      { pendingInputId: payload.pendingInputId },
      error,
    );
  }
};

/** steer 丢弃：promoted 不落盘；其余逐 id settle（单 id 失败不中断）。 */
const persistDiscardedInputs = async (
  ports: RuntimePorts,
  record: SessionRecord,
  trace: TraceHandle,
): Promise<void> => {
  const payload = record.payload as unknown as DiscardedInputPayload;
  if (payload.reason === PROMOTED_REASON) return;
  const status = payload.reason === RESUMED_REASON ? DISCARDED_STATUS : CANCELLED_STATUS;
  const facts = eventFacts(record);
  for (const pendingInputId of payload.pendingInputIds) {
    try {
      await ports.sessionStore!.settleSessionInput?.({
        id: pendingInputId,
        sessionID: facts.sessionId,
        status,
        reason: payload.reason,
      });
    } catch (error) {
      warnLedgerFailure(
        ports,
        trace,
        INPUT_SETTLE_FAIL_TEXT,
        LEDGER_FAIL_EVENTS.inputSettle,
        { pendingInputId },
        error,
      );
    }
  }
};

/** 目标完成验证：账本条目 + timeline 分部（既有时刻沿用，started 态不带完成时刻）。 */
const persistTargetVerification = async (
  ports: RuntimePorts,
  record: SessionRecord,
  trace: TraceHandle,
): Promise<void> => {
  try {
    const facts = eventFacts(record);
    const payload = record.payload as unknown as TargetVerificationPayload;
    const key =
      payload.goalIteration !== undefined
        ? `${payload.targetId}_${payload.goalIteration}`
        : payload.verificationId;
    const partID = createPartId(`goal_verify_${key}_timeline`);
    const previous = await readTimelineTiming(ports, facts.sessionId, partID);
    const created = previous?.messageCreated ?? facts.timestampMs;
    const start = previous?.partStarted ?? facts.timestampMs;
    const finished = payload.status !== "started";
    if (ports.sessionStore!.saveSessionEntry) {
      const data: PayloadFields = {};
      data.eventId = facts.eventId;
      data.payload = record.payload;
      data.sequenceNumber = facts.sequenceNumber;
      data.traceId = facts.traceId;
      Object.assign(data, withTurn(facts.turnId));
      const entry = {} as Record<string, unknown>;
      entry.id = facts.eventId;
      entry.sessionID = facts.sessionId;
      entry.type = SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION;
      entry.time = { created: facts.timestampMs, updated: facts.timestampMs };
      entry.data = data;
      await ports.sessionStore!.saveSessionEntry(entry as never);
    }
    const timeline: PayloadFields = {};
    timeline.timelineType = "goal_verification";
    timeline.display = "separator";
    timeline.status = payload.status;
    timeline.anchorMessageId = payload.anchorAssistantMessageId;
    timeline.anchorTurnId = payload.anchorTurnId;
    timeline.targetId = payload.targetId;
    timeline.verificationId = payload.verificationId;
    timeline.goalIteration = payload.goalIteration;
    timeline.verification = payload.verification;
    timeline.time = { start, end: finished ? facts.timestampMs : undefined };
    await ports.persistAssistantTimelinePartForSession({
      sessionId: facts.sessionId,
      messageID: createMessageId(`goal_verify_${key}`),
      partID,
      parentID: payload.anchorAssistantMessageId,
      created,
      completed: finished ? facts.timestampMs : undefined,
      finish: payload.status,
      timeline: timeline as never,
      traceContext: trace,
    });
  } catch (error) {
    warnLedgerFailure(
      ports,
      trace,
      TARGET_FAIL_TEXT,
      LEDGER_FAIL_EVENTS.targetVerification,
      { sessionEventType: record.type },
      error,
    );
  }
};

/** 分派处理器。 */
type DurableHandler = (
  ports: RuntimePorts,
  record: SessionRecord,
  trace: TraceHandle,
) => Promise<void>;

/** 八类分派表：命中即处理并返回；其余类型 no-op。 */
const DURABLE_HANDLERS = new Map<string, DurableHandler>([
  [String(SessionEventType.UserInputAutoResolutionUpdated), persistAutoResolution],
  [String(SessionEventType.TurnSteerQueued), persistQueuedInput],
  [String(SessionEventType.TurnSteerDeliveryChanged), persistDeliveryChange],
  [String(SessionEventType.TurnSteerDiscarded), persistDiscardedInputs],
  [String(SessionEventType.TargetCompletionVerification), persistTargetVerification],
]);

/** 持久化事件分派入口：checkpoint/rewind 两条特殊路径 + 八类账本分派。 */
export async function persistDurableEvent(
  runtime: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void> {
  if (!runtime.sessionStore) return;
  // checkpoint：落账失败由持久化层吞错转 warn（KD-1 原样）。
  if (event.type === SessionEventType.CheckpointCreated) {
    await persistWorkspaceCheckpointEntry(runtime, event, traceContext);
    return;
  }
  // rewind：分派/校验错误冒泡（KD-1 原样）。
  if (event.type === SessionEventType.RewindTriggered) {
    await persistWorkspaceFileRewindEntry(runtime, event, traceContext);
    return;
  }
  const handler = DURABLE_HANDLERS.get(String(event.type));
  if (handler) await handler(runtime, event, traceContext);
}
