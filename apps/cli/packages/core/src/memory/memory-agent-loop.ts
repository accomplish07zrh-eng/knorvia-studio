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

function copyHistory(history: readonly ModelInputMessage[]): ModelInputMessage[] {
  return history.map((message) => ({
    ...message,
    cacheControl: message.cacheControl ? { ...message.cacheControl } : undefined,
    content: Array.isArray(message.content)
      ? message.content.map((block) => ({ ...block }))
      : message.content,
    toolCalls: message.toolCalls?.map((call) => ({ ...call })),
  }));
}

function assistantContent(
  text: string,
  reasoning: ModelReasoningContentBlock[] | undefined,
): ModelMessageContent {
  if (!reasoning?.length) return text;
  const blocks: ModelMessageContent = reasoning.map((block) => ({
    ...block,
    providerOptions: block.providerOptions ? { ...block.providerOptions } : undefined,
  }));
  if (text) blocks.push({ text, type: "text" });
  return blocks;
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

function pathArguments(filePath: string, context: LoopInput) {
  return {
    filePath,
    rootDir: context.rootDir,
    workingDirectory: context.workingDirectory,
    workspaceRoot: context.workspaceRoot,
  };
}

function permitsMarkdownChange(value: unknown, context: LoopInput): boolean {
  const filePath = stringProperty(value, "file_path");
  if (filePath === undefined || !filePath.endsWith(".md")) return false;
  try {
    return resolveSafeMemoryFilePath(pathArguments(filePath, context)) !== undefined;
  } catch {
    return false;
  }
}

function permitsShell(value: unknown, context: LoopInput): boolean {
  const command = stringProperty(value, "command");
  if (!command) return false;
  if (
    isRuntimeReadOnlyBashCommand(command, {
      workingDirectory: context.workingDirectory,
      workspaceRoot: context.workspaceRoot,
    })
  )
    return true;

  const analysis = analyzeBashCommand(command);
  if (!isBashCommandPermissionSafe(analysis) || analysis.commands.length !== 1) {
    return false;
  }
  const invocation = analysis.commands[0]!;
  if (
    invocation.argv[0] !== "rm" ||
    invocation.redirects.length !== 0 ||
    invocation.envAssignments.length !== 0
  )
    return false;

  let operands = 0;
  let optionsEnded = false;
  for (const argument of invocation.argv.slice(1)) {
    if (!optionsEnded && argument === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && argument.startsWith("-")) {
      if (argument === "--recursive" || /^-[a-zA-Z]*[rR]/u.test(argument)) {
        return false;
      }
      continue;
    }
    if (/[*?[]/u.test(argument) || !isAbsolute(argument) || !argument.endsWith(".md")) {
      return false;
    }
    try {
      if (resolveContainedMemoryFilePath(pathArguments(argument, context)) === undefined) {
        return false;
      }
    } catch {
      return false;
    }
    operands += 1;
  }
  return operands > 0;
}

function rejectionFor(call: ModelToolCall, context: LoopInput): string | undefined {
  const contract = context.tools.find((tool) => tool.name === call.name);
  if (!contract) {
    return `<tool_use_error>Error: No such tool available: ${call.name}</tool_use_error>`;
  }
  const generic = `only Read, Grep, Glob, read-only Bash, and Edit/Write within ${context.rootDir} are allowed`;
  if (
    call.name === "Agent" ||
    call.name.startsWith("mcp__") ||
    contract.sideEffectScope === "network"
  )
    return generic;

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
      return undefined;
    default:
      return generic;
  }
}

export async function runMemoryAgentLoop(input: LoopInput): Promise<MemoryAgentLoopResult> {
  const messages = copyHistory(input.messages);
  let turns = 0;
  while (turns < input.maxTurns) {
    input.abortSignal?.throwIfAborted();
    const projection = projectMessagesForModelMediaPolicy(
      copyHistory(messages),
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
    messages.push({
      content: assistantContent(response.text, response.reasoning),
      role: "assistant",
      toolCalls: calls.map((call) => ({ ...call })),
    });
    if (calls.length === 0) {
      turns += 1;
      break;
    }
    const toolMessages = await Promise.all(
      calls.map(async (call): Promise<ModelInputMessage> => {
        const reason = rejectionFor(call, input);
        if (reason !== undefined) {
          return {
            content: reason,
            isError: true,
            role: "tool",
            toolCallId: call.id,
            toolName: call.name,
          };
        }
        const result = await input.executeTool(
          { id: call.id, input: call.input, name: call.name },
          { abortSignal: input.abortSignal },
        );
        return {
          content: modelContentForToolResult(result),
          isError: isErrorForToolResult(result),
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
        };
      }),
    );
    messages.push(...toolMessages);
    turns += 1;
  }
  return { messages, turns };
}
