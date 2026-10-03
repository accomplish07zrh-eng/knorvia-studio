import {
  CoreErrorType,
  TodoReadInputJsonSchema,
  TodoReadInputSchema,
  TodoReadOutputJsonSchema,
  TodoReadOutputSchema,
  TodoWriteInputJsonSchema,
  TodoWriteInputSchema,
  TodoWriteOutputJsonSchema,
  TodoWriteOutputSchema,
  createCoreError,
  type TodoReadOutput,
  type TodoWriteOutput,
} from "@knorvia/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";

const readTodos: ToolHandler = async (input, context): Promise<TodoReadOutput> => {
  TodoReadInputSchema.parse(input);
  if (!context.sessionStore) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "SessionStorePort is not configured for TodoRead",
      {
        context: { toolCallId: context.toolCallId, toolName: "TodoRead" },
        recoverable: false,
      },
    );
  }
  const todos = await context.sessionStore.readTodos({ sessionID: context.sessionId });
  return { todos };
};

const writeTodos: ToolHandler = async (input, context): Promise<TodoWriteOutput> => {
  const { todos } = TodoWriteInputSchema.parse(input);
  if (!context.sessionStore) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "SessionStorePort is not configured for TodoWrite",
      {
        context: { toolCallId: context.toolCallId, toolName: "TodoWrite" },
        recoverable: false,
      },
    );
  }
  const oldTodos = await context.sessionStore.readTodos({ sessionID: context.sessionId });
  await context.sessionStore.updateTodos({ sessionID: context.sessionId, todos });
  return {
    oldTodos,
    todos,
    summary: {
      total: todos.length,
      pending: todos.filter((todo) => todo.status === "pending").length,
      inProgress: todos.filter((todo) => todo.status === "in_progress").length,
      completed: todos.filter((todo) => todo.status === "completed").length,
    },
  };
};

export const todoReadToolEntry: ToolEntry = {
  capability: "Read the current session todo list without modifying external state",
  metadata: {
    name: "TodoRead",
    description: "Read the current session todo list",
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: 30000,
    maxOutputBytes: 100000,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: readTodos,
  inputSchema: TodoReadInputJsonSchema,
  outputSchema: TodoReadOutputJsonSchema,
  runtimeInputSchema: TodoReadInputSchema,
  runtimeOutputSchema: TodoReadOutputSchema,
  permission: {
    permission: "todo.read",
    reason: "TodoRead only reads session-local task state",
    riskLevel: "low",
    sideEffectScope: "none",
    needsApproval: false,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 100000,
    maxModelBytes: 100000,
    strategy: "truncate",
    preview: { maxBytes: 100000, direction: "head" },
  },
  timeout: { defaultMs: 30000, maxMs: 30000, allowCallOverride: false },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "TodoRead was cancelled before todo state was returned",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};

export const todoWriteToolEntry: ToolEntry = {
  capability: "Replace the current session todo list to track multi-step task progress and resume state",
  metadata: {
    name: "TodoWrite",
    description: "Create and update a task list for the current session. The list is rendered to the user as your working plan.\n\n- Each todo has `content`, `status` (\"pending\" | \"in_progress\" | \"completed\"), and `priority` (\"high\" | \"medium\" | \"low\").\n- Send the full list each call; it replaces the previous one.\n- Keep one item `in_progress` at a time and mark it `completed` when done.",
    readOnly: true,
    destructive: false,
    concurrentSafe: false,
    timeoutMs: 30000,
    maxOutputBytes: 100000,
    sideEffectScope: "session",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: writeTodos,
  inputSchema: TodoWriteInputJsonSchema,
  outputSchema: TodoWriteOutputJsonSchema,
  runtimeInputSchema: TodoWriteInputSchema,
  runtimeOutputSchema: TodoWriteOutputSchema,
  permission: {
    permission: "todo.write",
    reason: "TodoWrite only updates session-local task state for progress tracking",
    riskLevel: "low",
    sideEffectScope: "session",
    needsApproval: false,
    patternSources: ["toolName", "input"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 100000,
    maxModelBytes: 100000,
    strategy: "truncate",
    preview: { maxBytes: 100000, direction: "head" },
  },
  timeout: { defaultMs: 30000, maxMs: 30000, allowCallOverride: false },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "TodoWrite was cancelled before todo state was updated",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
