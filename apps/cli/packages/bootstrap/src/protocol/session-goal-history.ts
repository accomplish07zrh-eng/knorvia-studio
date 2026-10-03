import {
  getKnorviaGoalActiveIterationCount,
  isMainAgentToolProjectionSource,
  type KnorviaSessionGoalStats,
  type KnorviaSessionTodoGroup,
} from "@knorvia/shared";
import type { MessageWithParts, SessionProjection, TodoItem, ToolState } from "@knorvia/contracts";
import {
  compareSessionMessages,
  goalBoundaries,
  goalIterationAt,
  goalIterationStart,
} from "./session-goal-recovery.js";
import {
  normalizedHistoryText,
  sessionRecord,
  sessionString,
} from "./session-projection-primitives.js";

const TODO_STATUSES = new Set(["pending", "in_progress", "completed"]);
const TODO_PRIORITIES = new Set(["high", "medium", "low"]);
const GOAL_GROUP_PREFIX = "goal-iteration-";
const HISTORY_SCOPE = "session";
const CURRENT_GROUP_ID = "session-current";
const SECONDS_IN_MS = 1000;

export function sessionTodo(todo: TodoItem): TodoItem {
  return { content: todo.content, priority: todo.priority, status: todo.status };
}

function todoStatus(value: string | undefined): value is TodoItem["status"] {
  return value !== undefined && TODO_STATUSES.has(value);
}

function todoPriority(value: string | undefined): value is TodoItem["priority"] {
  return value !== undefined && TODO_PRIORITIES.has(value);
}

function todoBatch(input: Record<string, unknown>): TodoItem[] | undefined {
  const source = input.todos;
  if (!Array.isArray(source)) return undefined;
  const accepted: TodoItem[] = [];
  let invalid = false;
  source.forEach((value: unknown) => {
    const item = sessionRecord(value);
    const content = sessionString(item.content)?.trim();
    const status = sessionString(item.status);
    const priority = sessionString(item.priority);
    if (!content || !todoStatus(status) || !todoPriority(priority)) invalid = true;
    else accepted.push({ content, priority, status });
  });
  return !invalid && accepted.length === source.length ? accepted : undefined;
}

function stateMetadata(state: ToolState): Record<string, unknown> | undefined {
  return state.status === "running" || state.status === "completed" || state.status === "error"
    ? state.metadata
    : undefined;
}

function stateUpdatedAt(state: ToolState): number | undefined {
  if (state.status === "completed" || state.status === "error") return state.time.end;
  return state.status === "running" ? state.time.start : undefined;
}

interface TodoSlot {
  group: KnorviaSessionTodoGroup;
  index: number;
}

export function sessionTodoGroups(
  messages: readonly MessageWithParts[],
  current: readonly TodoItem[],
  projection: SessionProjection,
): KnorviaSessionTodoGroup[] {
  const target = projection.target;
  const timeline = goalBoundaries(projection, target);
  const groups = new Map<string, KnorviaSessionTodoGroup>();
  // 直接持有原归属 group 的位置；新一轮同内容更新不能迁移它，也不改变首次插入顺序。
  const owners = new Map<string, TodoSlot>();
  const history = Array.from(messages).sort(compareSessionMessages);
  for (const message of history) {
    if (message.info.role !== "assistant") continue;
    const iteration = goalIterationAt(message.info.time.created, target, timeline);
    for (const part of message.parts) {
      if (part.type !== "tool") continue;
      if (part.tool.toLowerCase().replace(/[_\s-]/g, "") !== "todowrite") continue;
      if (!isMainAgentToolProjectionSource(part.metadata, stateMetadata(part.state))) continue;
      const todos = todoBatch(part.state.input);
      if (!todos) continue;
      const updatedAt =
        stateUpdatedAt(part.state) ?? message.info.time.completed ?? message.info.time.created;
      const id = iteration ? GOAL_GROUP_PREFIX + iteration : HISTORY_SCOPE;
      const startedAt = iteration
        ? goalIterationStart(iteration, target, timeline, message.info.time.created)
        : message.info.time.created;
      const targetId = iteration ? target?.targetID : undefined;
      let group = groups.get(id);
      if (group) group.updatedAt = Math.max(group.updatedAt ?? 0, updatedAt);
      else {
        group = {
          id,
          source: iteration ? "goal_iteration" : "session",
          ...(iteration ? { goalIteration: iteration } : {}),
          ...(targetId ? { targetId } : {}),
          startedAt,
          updatedAt,
          todos: [],
        };
        groups.set(id, group);
      }
      for (const todo of todos) {
        const fingerprint = normalizedHistoryText(todo.content);
        const key = (target?.targetID ?? HISTORY_SCOPE) + String.fromCharCode(0) + fingerprint;
        const slot = owners.get(key);
        if (slot) {
          slot.group.todos[slot.index] = sessionTodo(todo);
          slot.group.updatedAt = Math.max(slot.group.updatedAt ?? 0, updatedAt);
        } else {
          const index = group.todos.length;
          owners.set(key, { group, index });
          group.todos.push(sessionTodo(todo));
        }
      }
    }
  }
  if (groups.size === 0 && current.length > 0) {
    groups.set(CURRENT_GROUP_ID, {
      id: CURRENT_GROUP_ID,
      source: "session",
      todos: current.map(sessionTodo),
    });
  }
  return Array.from(groups.values()).sort((left, right) => {
    const first = left.startedAt ?? Number.MAX_SAFE_INTEGER;
    const second = right.startedAt ?? Number.MAX_SAFE_INTEGER;
    return first !== second ? first - second : left.id.localeCompare(right.id);
  });
}

interface IterationTotals {
  tools: number;
  tokens: number;
  seconds: number;
}

export function sessionGoalStats(
  projection: SessionProjection,
  messages: readonly MessageWithParts[],
): KnorviaSessionGoalStats | undefined {
  const target = projection.target;
  if (!target) return undefined;
  const timeline = goalBoundaries(projection, target);
  const totals = new Map<number, IterationTotals>();
  for (const message of Array.from(messages).sort(compareSessionMessages)) {
    if (message.info.role !== "assistant") continue;
    const iteration = goalIterationAt(message.info.time.created, target, timeline);
    if (!iteration) continue;
    let row = totals.get(iteration);
    if (!row) {
      row = { tools: 0, tokens: 0, seconds: 0 };
      totals.set(iteration, row);
    }
    let tools = 0;
    message.parts.forEach((part) => {
      if (part.type === "tool") tools += 1;
    });
    const tokens = message.info.tokens;
    const completedAt = message.info.time.completed ?? message.info.time.created;
    row.tools += tools;
    row.tokens +=
      tokens.total ??
      tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
    row.seconds += Math.max(
      0,
      Math.ceil((completedAt - message.info.time.created) / SECONDS_IN_MS),
    );
  }
  const iterationCount = getKnorviaGoalActiveIterationCount({
    targetStatus: target.status ?? null,
    timeline: goalBoundaries(projection, target),
  });
  const rows = Array.from(totals.values());
  const tokens = rows.reduce((sum, row) => sum + row.tokens, 0);
  const seconds = rows.reduce((sum, row) => sum + row.seconds, 0);
  return {
    contextUsed: projection.contextUsed,
    contextWindow: projection.contextWindow,
    iterationCount,
    // 保留 live-run 恢复修复：activeRunStartedAtMs 在场时，已结算时间仍以 target 为准。
    timeUsedSeconds:
      target.timeUsedSeconds > 0 || target.activeRunStartedAtMs != null
        ? target.timeUsedSeconds
        : seconds,
    tokenBudget: target.tokenBudget ?? null,
    tokensUsed: target.tokensUsed > 0 ? target.tokensUsed : tokens,
    toolCallCount: rows.reduce((sum, row) => sum + row.tools, 0),
  };
}
