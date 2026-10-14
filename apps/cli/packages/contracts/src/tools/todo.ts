// SPDX-License-Identifier: Apache-2.0
// Todo 工具声明：会话级任务清单（待办）的读取与整体覆盖写入。

import { z } from "zod";
import type { ToolCallId, TraceId } from "../interfaces/shared.js";
import { toToolJsonSchema } from "./json-schema.js";

export const TodoStatus = {
  Pending: "pending",
  InProgress: "in_progress",
  Completed: "completed",
} as const;

export type TodoStatus = (typeof TodoStatus)[keyof typeof TodoStatus];

export const TodoPriority = {
  High: "high",
  Medium: "medium",
  Low: "low",
} as const;

export type TodoPriority = (typeof TodoPriority)[keyof typeof TodoPriority];

export const TodoItemSchema = z.object({
  content: z.string().min(1).describe("Brief description of the task"),
  status: z.enum(["pending", "in_progress", "completed"]).describe("Current status of the task"),
  priority: z.enum(["high", "medium", "low"]).describe("Priority level of the task"),
});

export type TodoItem = z.infer<typeof TodoItemSchema>;

export const TodoReadInputSchema = z.object({}).strict();
export type TodoReadInput = z.infer<typeof TodoReadInputSchema>;

export const TodoReadInputJsonSchema = toToolJsonSchema(TodoReadInputSchema);

export interface TodoReadOutput {
  todos: TodoItem[];
}

export const TodoReadOutputSchema = z
  .object({
    todos: z.array(TodoItemSchema),
  })
  .strict();

export type ParsedTodoReadOutput = z.infer<typeof TodoReadOutputSchema>;

export const TodoReadOutputJsonSchema = toToolJsonSchema(TodoReadOutputSchema);

export const TodoWriteInputSchema = z
  .object({
    todos: z
      .array(TodoItemSchema)
      .describe("The complete updated todo list. At most one item may be in_progress at a time."),
  })
  .strict();
// 这里刻意不限制 in_progress 的数量：多 subagent / 并行任务下需要允许多个条目同时进行，
// 旧的「最多一个 in_progress」硬拒绝会让 TodoWrite 失败并连带跳过后续调度组。

export type TodoWriteInput = z.infer<typeof TodoWriteInputSchema>;

export const TodoWriteInputJsonSchema = toToolJsonSchema(TodoWriteInputSchema);

export interface TodoSummary {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}

export interface TodoWriteOutput {
  oldTodos: TodoItem[];
  todos: TodoItem[];
  summary: TodoSummary;
}

export const TodoSummarySchema = z
  .object({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  })
  .strict();

export const TodoWriteOutputSchema = z
  .object({
    oldTodos: z.array(TodoItemSchema),
    todos: z.array(TodoItemSchema),
    summary: TodoSummarySchema,
  })
  .strict();

export type ParsedTodoWriteOutput = z.infer<typeof TodoWriteOutputSchema>;

export const TodoWriteOutputJsonSchema = toToolJsonSchema(TodoWriteOutputSchema);

export interface TodoReadToolCall {
  id: ToolCallId;
  name: "TodoRead";
  input: TodoReadInput;
  traceId: TraceId;
  startedAt: Date;
}

export interface TodoWriteToolCall {
  id: ToolCallId;
  name: "TodoWrite";
  input: TodoWriteInput;
  traceId: TraceId;
  startedAt: Date;
}

// TodoRead / TodoWrite 是同一组工具的两个方向：读当前清单、整体覆盖写清单。
// 名称判定集中在集合里，core 的分派与权限规则都读它，避免各处手写字符串比较。
const TODO_TOOL_NAMES: ReadonlySet<string> = new Set(["TodoRead", "TodoWrite"]);

// 「读不出待办清单」的统一返回值：命名常量比裸 undefined 更能说明调用方该走哪条分支。
// 调用方（结果投影与 TUI）看到它时按「本次工具结果里没有清单」处理，不当作错误。
const MISSING_TODO_LIST: undefined = undefined;

export function isTodoToolName(value: string | undefined): value is "TodoRead" | "TodoWrite" {
  if (value === undefined) return false;
  return TODO_TOOL_NAMES.has(value);
}

// 工具结果内容不保证是合法 JSON：历史会话、被截断的流式输出、第三方 MCP 结果都可能不是
// 合法 JSON。解析失败用哨兵值表示「读不出 todo」，不抛错——清单读取失败不该让整轮对话失败。
// 解析成功的对象还要依次尝试 TodoRead 与 TodoWrite 的输出 schema：两者都带 todos 数组，
// 只有形状匹配的那个才算数，匹配不上仍然按「没有清单」处理。
const BAD_JSON = Symbol("bad-tool-result");

function parseToolResultJson(content: string): unknown | typeof BAD_JSON {
  try {
    return JSON.parse(content);
  } catch {
    return BAD_JSON;
  }
}

export function todoItemsFromToolResultContent(content: string): TodoItem[] | undefined {
  const parsed = parseToolResultJson(content);
  if (parsed === BAD_JSON) return MISSING_TODO_LIST;
  // TodoRead 与 TodoWrite 的输出都带 todos 数组，按顺序尝试；都不匹配就返回 undefined。
  const candidates = [TodoReadOutputSchema, TodoWriteOutputSchema];
  for (const schema of candidates) {
    const parsedOutput = schema.safeParse(parsed);
    if (parsedOutput.success) return cloneTodos(parsedOutput.data.todos);
  }
  return MISSING_TODO_LIST;
}

// 给模型看的清单文本：首行声明这是权威状态（模型不应凭记忆推断待办），
// 之后每条按「序号 + 状态 + 优先级 + 内容」列出；空清单返回空串而不是空标题。
const TODO_STATE_HEADER = "Current session todo state (authoritative):";

export function formatTodoStateForModel(todos: readonly TodoItem[]): string {
  if (todos.length === 0) return "";
  const entries = todos.map(
    (todo, index) => `${index + 1}. [${todo.status}][${todo.priority}] ${todo.content}`,
  );
  return [TODO_STATE_HEADER, ...entries].join("\n");
}

function cloneTodos(todos: readonly TodoItem[]): TodoItem[] {
  return todos.map((todo) => ({ ...todo }));
}
