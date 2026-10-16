// SPDX-License-Identifier: Apache-2.0
import type { KnorviaAssistantMessagePart } from "./assistant-part-sequence.js";
import type { Expand, OptionalField, RequiredField } from "./field-slots.js";

type ToolCallShape = {
  toolId: RequiredField<string>;
  parentToolUseId: OptionalField<string | null>;
  kind: RequiredField<string>;
  title: OptionalField<string>;
  input: RequiredField<unknown>;
  status: RequiredField<string>;
  output: OptionalField<unknown>;
  error: OptionalField<string>;
  raw: OptionalField<unknown>;
};

export type KnorviaAssistantPresentationToolCall = Expand<ToolCallShape>;

type ContentBlock = { type: "content"; content: string };
type ThoughtBlock = { type: "thought"; content: string };
type ToolCallBlock = { type: "tool-call"; toolCall: KnorviaAssistantPresentationToolCall };

export type KnorviaAssistantPresentationBlock = ContentBlock | ThoughtBlock | ToolCallBlock;

type PresentationShape = {
  messageParts: RequiredField<KnorviaAssistantMessagePart[]>;
  blocks: RequiredField<KnorviaAssistantPresentationBlock[]>;
  latestPart: RequiredField<Extract<KnorviaAssistantPresentationBlock, { type: "content" }> | null>;
  historyBlocks: RequiredField<KnorviaAssistantPresentationBlock[]>;
};

export type KnorviaAssistantPresentation = Expand<PresentationShape>;

type OptionsShape = {
  content: RequiredField<string>;
  thought: OptionalField<string>;
  toolCalls: OptionalField<readonly KnorviaAssistantPresentationToolCall[]>;
  parts: OptionalField<readonly KnorviaAssistantMessagePart[]>;
  streaming: OptionalField<boolean>;
  interrupted: OptionalField<boolean>;
  settling: OptionalField<boolean>;
};

export type BuildKnorviaAssistantPresentationOptions = Expand<OptionsShape>;

type ToolIndex = ReadonlyMap<string, KnorviaAssistantPresentationToolCall>;

function indexTools(toolCalls: readonly KnorviaAssistantPresentationToolCall[]): Map<
  string,
  KnorviaAssistantPresentationToolCall
> {
  const byId = new Map<string, KnorviaAssistantPresentationToolCall>();
  for (const call of toolCalls) byId.set(call.toolId, call);
  return byId;
}

// A call is a root when it has no parent, points at itself, or names a parent we never saw.
function rootedTool(tool: KnorviaAssistantPresentationToolCall, byId: ToolIndex): boolean {
  const parent = tool.parentToolUseId;
  if (parent === undefined || parent === null || parent.length === 0) return true;
  if (parent === tool.toolId) return true;
  return byId.has(parent) === false;
}

function copySuppliedParts(
  parts: readonly KnorviaAssistantMessagePart[],
): KnorviaAssistantMessagePart[] {
  const copy: KnorviaAssistantMessagePart[] = [];
  for (const part of parts) copy.push(part);
  return copy;
}

function synthesizeParts(
  options: BuildKnorviaAssistantPresentationOptions,
  toolCalls: readonly KnorviaAssistantPresentationToolCall[],
  byId: ToolIndex,
): KnorviaAssistantMessagePart[] {
  const assembled: KnorviaAssistantMessagePart[] = [];
  if (options.thought) assembled.push({ type: "thought", content: options.thought });
  for (const call of toolCalls) {
    if (!rootedTool(call, byId)) continue;
    assembled.push({ type: "tool-call", toolId: call.toolId });
  }
  if (options.content) assembled.push({ type: "content", content: options.content });
  return assembled;
}

function toolBlock(
  toolId: string,
  byId: ToolIndex,
  seen: Set<string>,
): KnorviaAssistantPresentationBlock | undefined {
  const tool = byId.get(toolId);
  if (tool === undefined || seen.has(toolId) || !rootedTool(tool, byId)) return undefined;
  seen.add(toolId);
  return { type: "tool-call", toolCall: tool };
}

function projectBlocks(
  messageParts: readonly KnorviaAssistantMessagePart[],
  byId: ToolIndex,
): KnorviaAssistantPresentationBlock[] {
  const seen = new Set<string>();
  const projected: KnorviaAssistantPresentationBlock[] = [];
  for (const piece of messageParts) {
    if (piece.type === "content" || piece.type === "thought") {
      projected.push({ type: piece.type, content: piece.content });
      continue;
    }
    const block = toolBlock(piece.toolId, byId, seen);
    if (block !== undefined) projected.push(block);
  }
  return projected;
}

function quoteSettled(options: BuildKnorviaAssistantPresentationOptions): boolean {
  return !options.streaming && !options.interrupted && !options.settling;
}

function pickLatestContent(
  blocks: readonly KnorviaAssistantPresentationBlock[],
  allowSelection: boolean,
): { latestPart: KnorviaAssistantPresentation["latestPart"]; selectedIndex: number } {
  if (!allowSelection) return { latestPart: null, selectedIndex: -1 };
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block !== undefined && block.type === "content") {
      return { latestPart: block, selectedIndex: index };
    }
  }
  return { latestPart: null, selectedIndex: -1 };
}

export function buildKnorviaAssistantPresentation(
  options: BuildKnorviaAssistantPresentationOptions,
): KnorviaAssistantPresentation {
  const toolCalls = options.toolCalls === undefined ? [] : options.toolCalls;
  const byId = indexTools(toolCalls);
  const supplied = options.parts;
  const messageParts =
    supplied !== undefined && supplied.length > 0
      ? copySuppliedParts(supplied)
      : synthesizeParts(options, toolCalls, byId);
  const blocks = projectBlocks(messageParts, byId);
  const picked = pickLatestContent(blocks, quoteSettled(options));
  return {
    messageParts,
    blocks,
    latestPart: picked.latestPart,
    historyBlocks: blocks.filter((_, index) => index !== picked.selectedIndex),
  };
}
