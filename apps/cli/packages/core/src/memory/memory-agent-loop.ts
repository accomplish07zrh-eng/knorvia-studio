// SPDX-License-Identifier: Apache-2.0
// 记忆提取子代理的回合循环：调模型、按工具白名单过滤调用、把结果回填成 tool 消息。
// 白名单判定是纯函数：写只允许记忆目录内的 .md，shell 只允许只读命令与「目标都在记忆目录内」的 rm。
import { isAbsolute } from "node:path";
import type {
  ModelInputMessage,
  ModelMessageContent,
  Model,
  ModelReasoningContentBlock,
  ModelRequest,
  ModelToolCall,
  ModelToolContract,
} from "@knorvia/contracts";
import { modelContentForToolResult, isErrorForToolResult } from "../runtime/helpers/tool-result.js";
import { projectMessagesForModelMediaPolicy } from "../runtime/helpers/media-budget.js";
import {
  analyzeBashCommand,
  isBashCommandPermissionSafe,
} from "../tool/handlers/bash-command-parser.js";
import { isRuntimeReadOnlyBashCommand } from "../tool/handlers/bash-semantics.js";
import type { ExecutableToolCall, ToolExecutionResult } from "../tool/types.js";
import { resolveContainedMemoryFilePath, resolveSafeMemoryFilePath } from "./memory-file-path.js";
import { auxiliaryModelOptions } from "../model/auxiliary-model-options.js";

interface MemoryAgentLoopResult {
  messages: ModelInputMessage[];
  turns: number;
}

type LoopInput = {
  abortSignal?: AbortSignal;
  executeTool: (
    toolCall: ExecutableToolCall,
    options: { abortSignal?: AbortSignal },
  ) => Promise<ToolExecutionResult>;
  maxTurns: number;
  messages: readonly ModelInputMessage[];
  model: Model;
  rootDir: string;
  tools: readonly ModelToolContract[];
  workingDirectory: string;
  workspaceRoot: string;
};

type ReasoningBlocks = ModelReasoningContentBlock[] | undefined;

interface MemoryFilePathArguments {
  filePath: string;
  rootDir: string;
  workingDirectory: string;
  workspaceRoot: string;
}

// 具名返回值：不放行、没有操作数、没有文本各给一个常量，读起来比裸字面量清楚。
const NO_PERMISSION = false;
const ALLOWED = undefined;
const NO_OPERANDS = undefined;
const NO_TEXT = undefined;
const MARKDOWN_SUFFIX = ".md";
// rm 的递归选项：长写法与任意位置的 r/R 组合（-rf、-Rf…）。
const RECURSIVE_OPTION = /^-[a-zA-Z]*[rR]/u;
const GLOB_CHARS = /[*?[]/u;

function copyContent(content: ModelInputMessage["content"]): ModelInputMessage["content"] {
  if (!Array.isArray(content)) return content;
  return content.map((block) => ({ ...block }));
}

function copyMessage(message: ModelInputMessage): ModelInputMessage {
  return {
    ...message,
    cacheControl: message.cacheControl ? { ...message.cacheControl } : undefined,
    content: copyContent(message.content),
    toolCalls: message.toolCalls?.map((call) => ({ ...call })),
  };
}

// 回填给模型的历史必须是副本：调用方持有的 messages 不能被这一轮回合改写。
function copyHistoryForLoop(history: readonly ModelInputMessage[]): ModelInputMessage[] {
  return history.map(copyMessage);
}

// reasoning 块也要拷一层，且只在这块真的带 providerOptions 时再拷它。
function copyReasoningBlock(block: ModelReasoningContentBlock): ModelReasoningContentBlock {
  if (!block.providerOptions) return { ...block };
  return { ...block, providerOptions: { ...block.providerOptions } };
}

// 助手消息内容：没有 reasoning 就是纯文本，有就先放 reasoning 块再追加文本块。
function assistantContent(text: string, reasoning: ReasoningBlocks): ModelMessageContent {
  const blocks: ModelMessageContent = reasoning?.length ? reasoning.map(copyReasoningBlock) : [];
  if (blocks.length === 0) return text;
  if (text) blocks.push({ text, type: "text" });
  return blocks;
}

function stringFieldOf(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return NO_TEXT;
  const field = (value as Record<string, unknown>)[key];
  if (typeof field !== "string") return NO_TEXT;
  return field;
}

function pathArguments(filePath: string, context: LoopInput): MemoryFilePathArguments {
  const arguments_: MemoryFilePathArguments = {
    filePath,
    rootDir: context.rootDir,
    workingDirectory: context.workingDirectory,
    workspaceRoot: context.workspaceRoot,
  };
  return arguments_;
}

// 目标必须落在记忆目录内；判定本身不抛，异常一律当作不放行。
function isSafeMemoryTarget(filePath: string, context: LoopInput): boolean {
  try {
    const resolved = resolveSafeMemoryFilePath(pathArguments(filePath, context));
    return resolved !== undefined;
  } catch {
    return NO_PERMISSION;
  }
}

// 只有 .md、且落在记忆目录内的写入才放行。
function permitsMarkdownChange(value: unknown, context: LoopInput): boolean {
  const filePath = stringFieldOf(value, "file_path");
  if (filePath === undefined || !filePath.endsWith(MARKDOWN_SUFFIX)) return NO_PERMISSION;
  return isSafeMemoryTarget(filePath, context);
}

// rm 的操作数：`--` 之后全是操作数；`-x` 形式的选项里出现递归就整条拒绝。
function removeOperands(args: readonly string[]): string[] | undefined {
  const operands: string[] = [];
  let optionsEnded = false;
  for (const argument of args) {
    if (!optionsEnded && argument === "--") {
      optionsEnded = true;
    } else if (!optionsEnded && argument.startsWith("-")) {
      if (argument === "--recursive" || RECURSIVE_OPTION.test(argument)) return NO_OPERANDS;
    } else {
      operands.push(argument);
    }
  }
  return operands;
}

// 单个 rm 操作数：不能带通配符、必须是绝对路径、必须 .md、必须落在记忆目录内。
function isMemoryMarkdownPath(argument: string, context: LoopInput): boolean {
  if (GLOB_CHARS.test(argument) || !isAbsolute(argument) || !argument.endsWith(MARKDOWN_SUFFIX)) {
    return NO_PERMISSION;
  }
  try {
    const resolved = resolveContainedMemoryFilePath(pathArguments(argument, context));
    return resolved !== undefined;
  } catch {
    return NO_PERMISSION;
  }
}

// 只允许单条 rm：无重定向、无环境赋值、无递归选项、每个操作数都在记忆目录内。
function isPermittedRemoveCommand(command: string, context: LoopInput): boolean {
  const parsed = analyzeBashCommand(command);
  if (!isBashCommandPermissionSafe(parsed) || parsed.commands.length !== 1) {
    return NO_PERMISSION;
  }
  const invocation = parsed.commands[0]!;
  if (invocation.argv[0] !== "rm") return NO_PERMISSION;
  if (invocation.redirects.length !== 0 || invocation.envAssignments.length !== 0) {
    return NO_PERMISSION;
  }
  const operands = removeOperands(invocation.argv.slice(1));
  if (operands === undefined || operands.length === 0) return NO_PERMISSION;
  return operands.every((operand) => isMemoryMarkdownPath(operand, context));
}

// shell：只读命令直接放行，其余只认「目标都在记忆目录内」的 rm。
function permitsShell(value: unknown, context: LoopInput): boolean {
  const command = stringFieldOf(value, "command");
  if (!command) return NO_PERMISSION;
  const readOnly = isRuntimeReadOnlyBashCommand(command, {
    workingDirectory: context.workingDirectory,
    workspaceRoot: context.workspaceRoot,
  });
  if (readOnly) return true;
  return isPermittedRemoveCommand(command, context);
}

// 这些调用一律回同一条通用拒绝文案：子代理、MCP 命名空间、以及任何声明了 network 副作用的工具。
function needsGenericRejection(call: ModelToolCall, contract: ModelToolContract): boolean {
  if (call.name === "Agent") return true;
  if (call.name.startsWith("mcp__")) return true;
  return contract.sideEffectScope === "network";
}

function rejectionFor(call: ModelToolCall, context: LoopInput): string | undefined {
  const contract = context.tools.find((tool) => tool.name === call.name);
  if (!contract) {
    return `<tool_use_error>Error: No such tool available: ${call.name}</tool_use_error>`;
  }
  const generic = `only Read, Grep, Glob, read-only Bash, and Edit/Write within ${context.rootDir} are allowed`;
  if (needsGenericRejection(call, contract)) return generic;

  switch (call.name) {
    case "Write":
    case "Edit":
      return permitsMarkdownChange(call.input, context) ? undefined : generic;
    case "Bash":
      return permitsShell(call.input, context)
        ? undefined
        : `Only read-only shell commands and rm with all paths inside ${context.rootDir} are permitted in this context (ls, find, grep, cat, stat, wc, head, tail, and similar)`;
    case "Read":
    case "Grep":
    case "Glob":
      return ALLOWED;
    default:
      return generic;
  }
}

// 被拒绝的调用也要回一条 tool 消息：模型据此知道哪个工具不可用。
function rejectionToolMessage(call: ModelToolCall, reason: string): ModelInputMessage {
  const message: Record<string, unknown> = {};
  message.content = reason;
  message.isError = true;
  message.role = "tool";
  message.toolCallId = call.id;
  message.toolName = call.name;
  return message as unknown as ModelInputMessage;
}

// 真正执行过的调用：内容与错误标志都取自执行结果。
function resultToolMessage(call: ModelToolCall, result: ToolExecutionResult): ModelInputMessage {
  const message: Record<string, unknown> = {};
  message.content = modelContentForToolResult(result);
  message.isError = isErrorForToolResult(result);
  message.role = "tool";
  message.toolCallId = call.id;
  message.toolName = call.name;
  return message as unknown as ModelInputMessage;
}

// 助手消息：正文 + reasoning 块，再挂上这一轮要执行的调用。
function assistantToolCallMessage(
  text: string,
  reasoning: ReasoningBlocks,
  calls: readonly ModelToolCall[],
): ModelInputMessage {
  const message: Record<string, unknown> = {};
  message.content = assistantContent(text, reasoning);
  message.role = "assistant";
  message.toolCalls = calls.map((call) => ({ ...call }));
  return message as unknown as ModelInputMessage;
}

export async function runMemoryAgentLoop(input: LoopInput): Promise<MemoryAgentLoopResult> {
  const messages = copyHistoryForLoop(input.messages);
  let completedTurns = 0;
  while (completedTurns < input.maxTurns) {
    input.abortSignal?.throwIfAborted();
    const projection = projectMessagesForModelMediaPolicy(
      copyHistoryForLoop(messages),
      input.model.properties.inputFormat,
    );
    const request: ModelRequest = {
      abortSignal: input.abortSignal,
      messages: projection.messages,
      options: auxiliaryModelOptions(input.model),
      tools: input.tools as ModelToolContract[],
    };
    const response = await input.model.generateText(request);
    input.abortSignal?.throwIfAborted();
    const calls = response.toolCalls ?? [];
    messages.push(assistantToolCallMessage(response.text, response.reasoning, calls));
    completedTurns += 1;
    if (calls.length === 0) break;
    const toolMessages = await Promise.all(
      calls.map(async (call): Promise<ModelInputMessage> => {
        const reason = rejectionFor(call, input);
        if (reason !== undefined) return rejectionToolMessage(call, reason);
        const result = await input.executeTool(
          { id: call.id, input: call.input, name: call.name },
          { abortSignal: input.abortSignal },
        );
        return resultToolMessage(call, result);
      }),
    );
    messages.push(...toolMessages);
  }
  return { messages, turns: completedTurns };
}
