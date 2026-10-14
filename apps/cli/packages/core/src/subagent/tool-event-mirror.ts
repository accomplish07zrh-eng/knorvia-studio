// SPDX-License-Identifier: Apache-2.0
// 子代理工具事件的镜像层：把子会话里的工具调用与交互事件改写成父会话可消费的形状。
// 两类事件分开构造——工具事件补 agent/来源等字段，交互事件额外带上阻塞交互的来源标记；
// 字段插入顺序是协议的一部分，构造时一律按序展开。事件类型集合由 SessionEventType 成员登记。
import {
  buildSubagentInteractionOrigin,
  type SubagentInteractionOriginContext,
} from "./interaction-origin.js";
import {
  SessionEventType,
  createSessionEvent,
  type SessionEvent,
  type ToolCallId,
} from "@knorvia/contracts";

const SUBAGENT_TOOL_CALL_ID_PREFIX = "tool_subagent";
const SUBAGENT_EVENT_SOURCE = "subagent";

// 工具类事件：调度、开始、进度、结果、错误。
const MIRRORED_TOOL_EVENT_TYPES = new Set<SessionEventType>();
MIRRORED_TOOL_EVENT_TYPES.add(SessionEventType.ToolCallScheduled);
MIRRORED_TOOL_EVENT_TYPES.add(SessionEventType.ToolCallStarted);
MIRRORED_TOOL_EVENT_TYPES.add(SessionEventType.ToolCallProgress);
MIRRORED_TOOL_EVENT_TYPES.add(SessionEventType.ToolCallResult);
MIRRORED_TOOL_EVENT_TYPES.add(SessionEventType.ToolCallError);

// 交互类事件：permission 的三态。
const MIRRORED_INTERACTION_EVENT_TYPES = new Set<SessionEventType>();
MIRRORED_INTERACTION_EVENT_TYPES.add(SessionEventType.PermissionRequested);
MIRRORED_INTERACTION_EVENT_TYPES.add(SessionEventType.PermissionResolved);
MIRRORED_INTERACTION_EVENT_TYPES.add(SessionEventType.PermissionDenied);

interface SubagentToolEventMirrorContext extends SubagentInteractionOriginContext {
  background?: boolean;
  parentTurnId?: SessionEvent["turnId"];
  toolNameByChildToolCallId?: Map<string, string>;
}

// 该事件类型是否属于要镜像的两类之一。
function isMirroredEventType(type: SessionEventType): boolean {
  if (MIRRORED_TOOL_EVENT_TYPES.has(type)) return true;
  return MIRRORED_INTERACTION_EVENT_TYPES.has(type);
}

// 工具事件载荷：补 agent 身份、父工具调用、来源，并按需带上调度字段。
function toolMirrorPayload(
  event: SessionEvent,
  context: SubagentToolEventMirrorContext,
  payload: Record<string, unknown>,
  toolCallId: ToolCallId,
  toolName: string | undefined,
  childToolCallId: string,
): Record<string, unknown> {
  return {
    ...payload,
    toolCallId,
    ...(toolName ? { toolName } : {}),
    ...mirrorScheduleFields(payload, context.agentId),
    agentId: context.agentId,
    agentType: context.agentType,
    ...(context.background ? { background: true } : {}),
    childSessionId: context.childSessionId,
    childToolCallId,
    description: context.description,
    parentToolCallId: context.parentToolCallId,
    source: SUBAGENT_EVENT_SOURCE,
  };
}

// 交互事件载荷：只补父界面响应所需的最小字段；permission 请求另带来源标记。
// V4 只从父 task 的实时投影生成阻塞交互；仅转发 broker request 会让子 agent 的
// permission / AskUserQuestion 停在子 session 里，父界面无从响应。
function interactionMirrorPayload(
  event: SessionEvent,
  context: SubagentToolEventMirrorContext,
  payload: Record<string, unknown>,
  toolCallId: ToolCallId,
  toolName: string | undefined,
): Record<string, unknown> {
  const origin =
    event.type === SessionEventType.PermissionRequested
      ? { origin: buildSubagentInteractionOrigin(context, event.turnId) }
      : {};
  return {
    ...payload,
    toolCallId,
    ...(toolName ? { toolName } : {}),
    childSessionId: context.childSessionId,
    ...(context.background ? { background: true } : {}),
    ...origin,
  };
}

export function mirrorSubagentToolEvent(
  event: SessionEvent,
  context: SubagentToolEventMirrorContext,
): SessionEvent | undefined {
  if (!isMirroredEventType(event.type)) return undefined;

  const payload = asRecord(event.payload);
  const childToolCallId = stringField(payload, "toolCallId");
  if (!childToolCallId) return undefined;

  const toolCallId = mirroredToolCallId(context.agentId, childToolCallId);
  const declaredToolName = stringField(payload, "toolName");
  const toolName = declaredToolName ?? context.toolNameByChildToolCallId?.get(childToolCallId);
  if (toolName) context.toolNameByChildToolCallId?.set(childToolCallId, toolName);

  const mirroredPayload = MIRRORED_INTERACTION_EVENT_TYPES.has(event.type)
    ? interactionMirrorPayload(event, context, payload, toolCallId, toolName)
    : toolMirrorPayload(event, context, payload, toolCallId, toolName, childToolCallId);

  return createSessionEvent(event.type, context.parentSessionId, mirroredPayload, {
    traceId: event.traceId,
    turnId: context.parentTurnId,
  });
}

// 一组子工具调用 id 换成镜像 id；非字符串项丢掉。
function mirroredIdList(agentId: string, values: readonly unknown[]): ToolCallId[] {
  const mirrored: ToolCallId[] = [];
  for (const value of values) {
    if (typeof value === "string") mirrored.push(mirroredToolCallId(agentId, value));
  }
  return mirrored;
}

// 调度字段：dependencies 与 schedule 里的 id 都要镜像。
function mirrorScheduleFields(
  // 调度字段镜像
  payload: Record<string, unknown>,
  agentId: string, // 子代理 id
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (Array.isArray(payload.dependencies)) {
    fields.dependencies = mirroredIdList(agentId, payload.dependencies);
  }

  const schedule = asRecord(payload.schedule);
  if (Object.keys(schedule).length > 0) {
    // 有调度信息才镜像
    const executionOrder = stringArrayField(schedule, "executionOrder");
    const parallelGroups = arrayField(schedule, "parallelGroups");
    fields.schedule = {
      // 逐项镜像
      ...schedule, // 保留原调度字段
      executionOrder: mirroredIdList(agentId, executionOrder),
      parallelGroups: parallelGroups.map((group) =>
        Array.isArray(group) ? mirroredIdList(agentId, group) : group,
      ),
    };
  }

  return fields; // 只带上实际存在的字段
}

function mirroredToolCallId(agentId: string, childToolCallId: string): ToolCallId {
  // 父会话里的镜像 id
  const mirrored = `${SUBAGENT_TOOL_CALL_ID_PREFIX}_${agentId}_${childToolCallId}`;
  return mirrored as ToolCallId;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== "string") return undefined;
  return value;
}

function arrayField(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const values = arrayField(record, key);
  return values.filter((value): value is string => typeof value === "string");
}
