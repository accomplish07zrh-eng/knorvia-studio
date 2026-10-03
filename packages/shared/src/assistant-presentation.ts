import {
  getLatestAssistantContentPart,
  type KnorviaAssistantMessagePart,
} from "./assistant-message-parts.js";

export interface KnorviaAssistantPresentationToolCall {
  toolId: string;
  parentToolUseId?: string | null;
  kind: string;
  title?: string;
  input: unknown;
  status: string;
  output?: unknown;
  error?: string;
  raw?: unknown;
}

export type KnorviaAssistantPresentationBlock =
  | {
      type: "content";
      content: string;
    }
  | {
      type: "thought";
      content: string;
    }
  | {
      type: "tool-call";
      toolCall: KnorviaAssistantPresentationToolCall;
    };

export interface KnorviaAssistantPresentation {
  messageParts: KnorviaAssistantMessagePart[];
  blocks: KnorviaAssistantPresentationBlock[];
  latestPart: Extract<KnorviaAssistantPresentationBlock, { type: "content" }> | null;
  historyBlocks: KnorviaAssistantPresentationBlock[];
}

export interface BuildKnorviaAssistantPresentationOptions {
  content: string;
  thought?: string;
  toolCalls?: readonly KnorviaAssistantPresentationToolCall[];
  parts?: readonly KnorviaAssistantMessagePart[];
  streaming?: boolean;
  interrupted?: boolean;
  settling?: boolean;
}

export function buildKnorviaAssistantPresentation({
  content,
  thought,
  toolCalls = [],
  parts,
  streaming = false,
  interrupted = false,
  settling = false,
}: BuildKnorviaAssistantPresentationOptions): KnorviaAssistantPresentation {
  const toolsById = new Map<string, KnorviaAssistantPresentationToolCall>();
  for (const tool of toolCalls) {
    toolsById.set(tool.toolId, tool);
  }

  const isRoot = (tool: KnorviaAssistantPresentationToolCall): boolean => {
    const parentId = tool.parentToolUseId;
    return !parentId || parentId === tool.toolId || !toolsById.has(parentId);
  };

  const messageParts: KnorviaAssistantMessagePart[] = [];
  if (parts && parts.length > 0) {
    for (const part of parts) {
      messageParts.push(part);
    }
  } else {
    if (thought) {
      messageParts.push({ type: "thought", content: thought });
    }
    for (const tool of toolCalls) {
      if (isRoot(tool)) {
        messageParts.push({ type: "tool-call", toolId: tool.toolId });
      }
    }
    if (content) {
      messageParts.push({ type: "content", content });
    }
  }

  const blocks: KnorviaAssistantPresentationBlock[] = [];
  const renderedToolIds = new Set<string>();
  for (const part of messageParts) {
    switch (part.type) {
      case "content":
        blocks.push({ type: "content", content: part.content });
        break;
      case "thought":
        blocks.push({ type: "thought", content: part.content });
        break;
      case "tool-call": {
        const tool = toolsById.get(part.toolId);
        if (tool && !renderedToolIds.has(part.toolId) && isRoot(tool)) {
          blocks.push({ type: "tool-call", toolCall: tool });
          renderedToolIds.add(part.toolId);
        }
        break;
      }
    }
  }

  let latestPart: KnorviaAssistantPresentation["latestPart"] = null;
  let selectedIndex = -1;
  if (!streaming && !interrupted && !settling) {
    const contentParts: KnorviaAssistantMessagePart[] = [];
    for (const block of blocks) {
      if (block.type === "content") {
        contentParts.push({ type: "content", content: block.content });
      }
    }
    const latestContent = getLatestAssistantContentPart(contentParts);
    if (latestContent !== null) {
      for (let index = 0; index < blocks.length; index += 1) {
        const block = blocks[index];
        if (block.type === "content" && block.content === latestContent.content) {
          latestPart = block;
          selectedIndex = index;
        }
      }
    }
  }

  const historyBlocks = blocks.filter((_, index) => index !== selectedIndex);
  return { messageParts, blocks, latestPart, historyBlocks };
}
