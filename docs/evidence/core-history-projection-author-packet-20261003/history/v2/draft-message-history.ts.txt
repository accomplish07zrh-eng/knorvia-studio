import {
  modelMessageContentToText,
  type RuntimeInputPresentation,
  type ModelCacheControl,
  type ModelMessageContent,
  type Model,
  type ModelReasoningContentBlock,
  type TokenUsageInfo,
} from "@knorvia/contracts";
import {
  SYSTEM_REMINDER_SOURCES,
  type SystemReminderSource,
} from "../system-reminder/source.js";

export interface ToolCallInput {
  id: string;
  name: string;
  input: unknown;
}
export type ReasoningContentInput = ModelReasoningContentBlock;
export interface ModelInputMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: ModelMessageContent;
  cacheControl?: ModelCacheControl;
  toolCalls?: ToolCallInput[];
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  providerId?: Model["providerId"];
  modelId?: Model["modelId"];
}
export type RuntimeMessageSource = SystemReminderSource | "shared_context" | "real_user" | "legacy_synthetic";
export interface RuntimeMessageMetadata {
  source: RuntimeMessageSource;
  inputPresentation?: RuntimeInputPresentation;
}
export interface RuntimeMessageMessageEntry {
  kind?: "message";
  message: ModelInputMessage;
  metadata?: RuntimeMessageMetadata;
  tokens?: TokenUsageInfo;
  queryScope?: "output_token_continuation";
}
export interface RuntimeAttachmentEntry {
  kind: "attachment";
  content: string;
  cacheControl?: ModelCacheControl;
  metadata: RuntimeMessageMetadata;
}
export type RuntimeMessageEntry = RuntimeMessageMessageEntry | RuntimeAttachmentEntry;
export interface CacheStats {
  totalMessages: number;
  cachedMessages: number;
  lastCacheHit: boolean;
  cacheReadTokens?: number;
}
export interface MessageHistory {
  init(systemPromptOrMessages?: string | Array<ModelInputMessage | RuntimeMessageEntry>): void;
  addUser(content: ModelMessageContent, metadata?: RuntimeMessageMetadata): void;
  addAttachment(source: SystemReminderSource, content: string): void;
  addEntries(entries: readonly RuntimeMessageEntry[]): void;
  addAssistant(content: string, toolCalls?: ToolCallInput[], reasoning?: ReasoningContentInput[], model?: Pick<Model, "providerId" | "modelId">, tokens?: TokenUsageInfo): void;
  addToolResult(toolCallId: string, toolName: string, content: ModelMessageContent, success: boolean, isError?: boolean): void;
  borrowReadOnlyRuntimeEntries(): readonly RuntimeMessageEntry[];
  toRuntimeEntries(): RuntimeMessageEntry[];
  replaceMessages(messages: readonly (ModelInputMessage | RuntimeMessageEntry)[]): void;
  getMessageCount(): number;
  getCacheStats(): CacheStats;
  setCacheHit(tokens?: number): void;
  setCacheMiss(): void;
  reset(): void;
}

export function systemReminderRuntimeMetadata(source: SystemReminderSource): RuntimeMessageMetadata {
  return { source };
}

export function realUserRuntimeMetadata(): RuntimeMessageMetadata {
  return { source: "real_user" };
}

export function legacySyntheticRuntimeMetadata(): RuntimeMessageMetadata {
  return { source: "legacy_synthetic" };
}

export function todoReminderRuntimeMetadata(): RuntimeMessageMetadata {
  return { source: "todo_reminder" };
}

export function isKnownSystemReminderSource(value: unknown): value is SystemReminderSource {
  return typeof value === "string" && SYSTEM_REMINDER_SOURCES.includes(value as SystemReminderSource);
}

export function isRuntimeAttachmentEntry(input: ModelInputMessage | RuntimeMessageEntry): input is RuntimeAttachmentEntry {
  return "kind" in input && input.kind === "attachment";
}

export function systemReminderAttachmentEntry(source: SystemReminderSource, content: string): RuntimeAttachmentEntry {
  return { kind: "attachment", content, metadata: systemReminderRuntimeMetadata(source) };
}

export function createRuntimeUserEntry(content: ModelMessageContent, metadata?: RuntimeMessageMetadata): RuntimeMessageMessageEntry {
  return {
    message: { role: "user", content },
    metadata: metadata ? { ...metadata } : undefined,
  };
}

function cloneReasoningBlock(block: ReasoningContentInput): ReasoningContentInput {
  return { ...block, providerOptions: block.providerOptions ? { ...block.providerOptions } : undefined };
}

function cloneTokenUsage(tokens: TokenUsageInfo): TokenUsageInfo {
  return { ...tokens, cache: { ...tokens.cache } };
}

export function createRuntimeAssistantEntry(
  content: string,
  toolCalls?: readonly ToolCallInput[],
  reasoning?: readonly ReasoningContentInput[],
  model?: Pick<Model, "providerId" | "modelId">,
  tokens?: TokenUsageInfo,
): RuntimeMessageMessageEntry {
  const blocks = reasoning?.map(cloneReasoningBlock) ?? [];
  const message: ModelInputMessage = {
    role: "assistant",
    content: blocks.length > 0
      ? [...blocks, ...(content.length > 0 ? [{ type: "text" as const, text: content }] : [])]
      : content,
    toolCalls: toolCalls?.map(({ id, name, input }) => ({ id, name, input })),
    ...(model ? { providerId: model.providerId, modelId: model.modelId } : {}),
  };
  return { message, ...(tokens ? { tokens: cloneTokenUsage(tokens) } : {}) };
}

export function createRuntimeToolResultEntry(
  toolCallId: string,
  toolName: string,
  content: ModelMessageContent,
  isError: boolean,
): RuntimeMessageMessageEntry {
  return { message: { role: "tool", content, toolCallId, toolName, isError } };
}

export function cloneModelMessageContent(content: ModelMessageContent): ModelMessageContent {
  if (typeof content === "string") return content;
  return content.map((block) => {
    if (block.type === "reasoning") return cloneReasoningBlock(block);
    if ("source" in block && block.source) return { ...block, source: { ...block.source } };
    return { ...block };
  });
}

export function cloneModelInputMessage(message: ModelInputMessage): ModelInputMessage {
  return {
    role: message.role,
    content: cloneModelMessageContent(message.content),
    ...(message.cacheControl ? { cacheControl: { ...message.cacheControl } } : {}),
    ...(message.toolCalls ? { toolCalls: message.toolCalls.map((call) => ({ ...call })) } : {}),
    ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
    ...(message.toolName !== undefined ? { toolName: message.toolName } : {}),
    ...(message.isError !== undefined ? { isError: message.isError } : {}),
    ...(message.providerId ? { providerId: message.providerId } : {}),
    ...(message.modelId ? { modelId: message.modelId } : {}),
  };
}

export function cloneRuntimeMessageEntry(entry: RuntimeMessageEntry): RuntimeMessageEntry {
  if (isRuntimeAttachmentEntry(entry)) {
    return {
      kind: "attachment",
      content: entry.content,
      cacheControl: entry.cacheControl ? { ...entry.cacheControl } : undefined,
      metadata: entry.metadata ? { ...entry.metadata } : undefined,
    } as RuntimeAttachmentEntry;
  }
  return {
    message: cloneModelInputMessage(entry.message),
    metadata: entry.metadata ? { ...entry.metadata } : undefined,
    ...(entry.tokens ? { tokens: cloneTokenUsage(entry.tokens) } : {}),
    ...(entry.queryScope ? { queryScope: entry.queryScope } : {}),
  };
}

function cloneEntryInput(input: ModelInputMessage | RuntimeMessageEntry): RuntimeMessageEntry {
  if ("message" in input || isRuntimeAttachmentEntry(input)) return cloneRuntimeMessageEntry(input);
  return { message: cloneModelInputMessage(input) };
}

function hasContextPrefixSource(metadata: RuntimeMessageMetadata | undefined): boolean {
  return metadata?.source === "context_prefix" || metadata?.source === "skills_listing";
}

function modelMessageFromInput(input: ModelInputMessage | RuntimeMessageEntry): ModelInputMessage {
  if (isRuntimeAttachmentEntry(input)) {
    throw new Error("Runtime attachment entries do not have a direct model message representation");
  }
  return "message" in input ? input.message : input;
}

export function countContextPrefixMessages(messagesOrEntries: readonly (ModelInputMessage | RuntimeMessageEntry)[]): number {
  let count = 0;
  for (const input of messagesOrEntries) {
    if (isRuntimeAttachmentEntry(input)) {
      if (!hasContextPrefixSource(input.metadata)) break;
    } else {
      const message = modelMessageFromInput(input);
      const metadata = "message" in input ? input.metadata : undefined;
      if (message.role !== "system") {
        if (message.role !== "user") break;
        if (metadata) {
          if (!hasContextPrefixSource(metadata)) break;
        } else if (!modelMessageContentToText(message.content).trimStart().startsWith("<system-reminder>")) {
          break;
        }
      }
    }
    count += 1;
  }
  return count;
}

export function invalidateRuntimeTokenUsage(tokens: TokenUsageInfo): TokenUsageInfo {
  return { ...tokens, total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };
}

export class MessageHistoryImpl implements MessageHistory {
  private entries: RuntimeMessageEntry[] = [];
  private cacheStats: CacheStats = { totalMessages: 0, cachedMessages: 0, lastCacheHit: false };

  init(systemPromptOrMessages?: string | Array<ModelInputMessage | RuntimeMessageEntry>): void {
    this.entries = [];
    if (typeof systemPromptOrMessages === "string") {
      if (systemPromptOrMessages.length > 0) {
        this.entries.push({ message: { role: "system", content: systemPromptOrMessages } });
      }
    } else if (Array.isArray(systemPromptOrMessages)) {
      this.entries.push(...systemPromptOrMessages.map(cloneEntryInput));
    }
    this.recomputeCacheStats();
  }

  addUser(content: ModelMessageContent, metadata?: RuntimeMessageMetadata): void {
    this.entries.push(createRuntimeUserEntry(content, metadata));
    this.cacheStats.totalMessages = this.entries.length;
  }

  addAttachment(source: SystemReminderSource, content: string): void {
    this.entries.push(systemReminderAttachmentEntry(source, content));
    this.cacheStats.totalMessages = this.entries.length;
  }

  addEntries(entries: readonly RuntimeMessageEntry[]): void {
    this.entries.push(...entries.map(cloneRuntimeMessageEntry));
    this.cacheStats.totalMessages = this.entries.length;
  }

  addAssistant(content: string, toolCalls?: ToolCallInput[], reasoning?: ReasoningContentInput[], model?: Pick<Model, "providerId" | "modelId">, tokens?: TokenUsageInfo): void {
    this.entries.push(createRuntimeAssistantEntry(content, toolCalls, reasoning, model, tokens));
    this.cacheStats.totalMessages = this.entries.length;
  }

  addToolResult(toolCallId: string, toolName: string, content: ModelMessageContent, success: boolean, isError?: boolean): void {
    this.entries.push(createRuntimeToolResultEntry(toolCallId, toolName, content, isError === undefined ? !success : isError));
    this.cacheStats.totalMessages = this.entries.length;
  }

  borrowReadOnlyRuntimeEntries(): readonly RuntimeMessageEntry[] {
    return this.entries;
  }

  toRuntimeEntries(): RuntimeMessageEntry[] {
    return this.entries.map(cloneRuntimeMessageEntry);
  }

  replaceMessages(messages: readonly (ModelInputMessage | RuntimeMessageEntry)[]): void {
    const entries = messages.map(cloneEntryInput);
    this.entries = entries;
    this.recomputeCacheStats();
  }

  getMessageCount(): number {
    return this.entries.length;
  }

  getCacheStats(): CacheStats {
    return { ...this.cacheStats };
  }

  setCacheHit(tokens?: number): void {
    this.cacheStats.lastCacheHit = true;
    this.cacheStats.cacheReadTokens = tokens;
    this.cacheStats.cachedMessages = this.entries.length;
  }

  setCacheMiss(): void {
    this.cacheStats.lastCacheHit = false;
    this.cacheStats.cacheReadTokens = undefined;
    this.cacheStats.cachedMessages = countContextPrefixMessages(this.entries);
  }

  reset(): void {
    const count = countContextPrefixMessages(this.entries);
    const entries = this.entries.slice(0, count).map(cloneRuntimeMessageEntry);
    this.entries = entries;
    this.cacheStats = { totalMessages: entries.length, cachedMessages: entries.length, lastCacheHit: false };
  }

  private recomputeCacheStats(): void {
    this.cacheStats = {
      totalMessages: this.entries.length,
      cachedMessages: countContextPrefixMessages(this.entries),
      lastCacheHit: false,
    };
  }
}

export function createMessageHistory(): MessageHistory {
  return new MessageHistoryImpl();
}
