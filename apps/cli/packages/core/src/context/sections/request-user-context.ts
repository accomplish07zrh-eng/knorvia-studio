// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// request-level 用户上下文段：把用户指令文件与 memory 索引合成一个 meta user 段；
// 两者都缺席时返回 null（不产出空段）。
import { join } from "node:path";
import { formatProjectMemoryIndexContent } from "../../memory/index-content.js";
import type { ContextSection, ResolvedUserInstructions } from "../types.js";
import { contextSectionFromText } from "./section-core.js";

const REQUEST_CONTEXT_HEADING = "# agentsMd";

const REQUEST_CONTEXT_INTRO =
  "Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.";

const MEMORY_INDEX_SUFFIX = " (user's auto-memory, persists across conversations):";

const WORKSPACE_SCOPE_PHRASE = "workspace instructions";

const USER_SCOPE_PHRASE = "user default instructions";

type InstructionSource = NonNullable<ResolvedUserInstructions["sources"]>[number];

/** 没有 sources 列表时，把顶层字段当成一份 workspace 指令。 */
function primaryInstructionSource(instructions: ResolvedUserInstructions): InstructionSource {
  const source = {} as InstructionSource;
  source.scope = "workspace";
  source.filePath = instructions.filePath;
  source.fileName = instructions.fileName;
  source.content = instructions.content;
  source.bytesRead = instructions.bytesRead;
  source.sizeBytes = instructions.sizeBytes;
  source.truncated = instructions.truncated;
  return source;
}

/** 单份指令文件：被截断时补标记行，正文全空白则整份丢弃。 */
function instructionBlock(source: InstructionSource): string | null {
  const truncationNote = source.truncated ? `\n\n[File truncated: ${source.fileName}]` : "";
  const body = (source.content + truncationNote).trim();
  if (!body) return null;
  const scope = source.scope === "user" ? USER_SCOPE_PHRASE : WORKSPACE_SCOPE_PHRASE;
  return `Contents of ${source.filePath} (${scope}):\n\n${body}`;
}

/** 所有指令文件拼成一段；每份之间空行分隔。 */
function instructionContent(instructions: ResolvedUserInstructions): string {
  const listed = instructions.sources;
  const sources = listed && listed.length > 0 ? listed : [primaryInstructionSource(instructions)];
  const blocks: string[] = [];
  for (const source of sources) {
    const block = instructionBlock(source);
    if (block !== null) blocks.push(block);
  }
  return blocks.join("\n\n");
}

/** memory 索引段：格式化结果为空就不出段。 */
function memoryIndexBlock(memoryRoot: string, memoryIndexContent: string): string | null {
  const formatted = formatProjectMemoryIndexContent(memoryIndexContent);
  if (!formatted) return null;
  const memoryPath = join(memoryRoot, "MEMORY.md");
  return `Contents of ${memoryPath}${MEMORY_INDEX_SUFFIX}\n\n${formatted}`;
}

export function buildRequestUserContextSection(input: {
  userInstructions?: ResolvedUserInstructions; // 用户指令（顶层字段或 sources 列表）
  memoryIndexContent?: string; // memory 索引原文
  memoryRoot?: string; // memory 根目录，用来拼 MEMORY.md 路径
}): ContextSection | null {
  const parts: string[] = [];

  if (input.userInstructions) {
    const instructions = instructionContent(input.userInstructions);
    if (instructions) parts.push(instructions);
  }

  const memoryRoot = input.memoryRoot;
  const memoryIndexContent = input.memoryIndexContent;
  if (memoryRoot && memoryIndexContent !== undefined) {
    const memoryBlock = memoryIndexBlock(memoryRoot, memoryIndexContent);
    if (memoryBlock !== null) parts.push(memoryBlock);
  }

  if (parts.length === 0) return null;

  const content = [REQUEST_CONTEXT_HEADING, REQUEST_CONTEXT_INTRO, "", parts.join("\n\n")].join(
    "\n",
  );
  return contextSectionFromText(
    "Request User Context",
    "request_user_context",
    "meta_user",
    "dynamic",
    content,
  );
}
