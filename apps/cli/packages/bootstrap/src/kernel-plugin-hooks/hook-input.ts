// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// Hook stdin 构造：把内部输入翻译成 Hook 脚本期望的形态（B1）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B1 的 19 条规格。
//
// 设计要点：
//   ① 载荷是**四层合并**（原始字段 → 固定别名 → 工具字段 → 事件专属别名），
//      后者覆盖前者；这样「原始 camelCase 仍是主契约」而「别名为兼容而加」。
//   ② transcript 是**临时文件**，所有权归返回的 `cleanup` ——
//      调用方必须在 `finally` 里调用它（B7.4 要求「无论成功、失败、取消」）。
//   ③ 事件专属别名用**表驱动**：某个事件带哪些别名一眼可见，
//      避免长 if 链（也让新增事件只需改一行）。
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { HookEventName } from "@knorvia/contracts";
import type { HookTempDirectoryPort } from "./temp-directory.js";

/** transcript 文件名（固定，B1.2）。 */
const TRANSCRIPT_FILE = "transcript.jsonl";

/** 临时目录前缀：便于在系统临时目录里识别来源。 */
const TEMP_PREFIX = "knorvia-hook-";

/**
 * 构造 stdin 所需的输入。
 *
 * 只列本模块用到的字段；调用方传更宽的对象也可以（额外的 camelCase 字段会原样进载荷）。
 */
export interface HookInputLike {
  readonly hookEventName: HookEventName;
  readonly sessionId: string;
  readonly mode?: string;
  readonly agentName?: string;
  readonly cwd?: string;
  readonly toolName?: string;
  readonly toolInput?: unknown;
  readonly toolCallId?: string;
  readonly prompt?: string;
  readonly responseText?: string;
  readonly responsePreview?: string;
  readonly permissionSuggestions?: unknown;
  readonly toolResponse?: unknown;
  readonly error?: { readonly message: string };
  readonly isInterrupt?: boolean;
  readonly stopHookActive?: boolean;
}

/** 构造结果：`value` 是脚本 stdin 内容，`cleanup` 是临时目录的唯一释放点。 */
export interface HookStdin {
  readonly value: string;
  cleanup(): Promise<void>;
}

/**
 * transcript 的一行：`{"message":{"content":[{"text":...,"type":"text"}],"role":...}}`。
 *
 * 为什么是这个形状：旧 Hook 生态按 Claude Code 的 transcript 格式读取，
 * 所以即使是新实现也必须产出同样的 JSONL 行（B1.4）。
 */
function transcriptLine(role: "assistant" | "user", text: string): string {
  const message = { content: [{ text, type: "text" }], role };
  return `${JSON.stringify({ message })}\n`;
}

/**
 * 事件 → transcript 内容。
 *
 * 只有两个事件需要 transcript：`Stop`（回合结束，脚本要读最后的助手消息）
 * 与 `UserPromptSubmit`（提交时脚本要读用户输入）。其他事件写空文件。
 */
function transcriptFor(input: HookInputLike): string {
  if (input.hookEventName === "Stop") {
    return transcriptLine("assistant", input.responseText ?? input.responsePreview ?? "");
  }
  if (input.hookEventName === "UserPromptSubmit") {
    return transcriptLine("user", input.prompt ?? "");
  }
  return "";
}

/**
 * 事件专属别名表（B1.5–B1.10）。
 *
 * 这些是**兼容别名**：旧 Hook 脚本按这些名字读字段。
 * 表驱动的好处是「哪个事件带哪些别名」在这里一处可见。
 */
function eventSpecificFields(input: HookInputLike): Record<string, unknown> {
  switch (input.hookEventName) {
    case "PermissionRequest":
      return { permission_suggestions: input.permissionSuggestions };
    case "PostToolUse":
      return { tool_response: input.toolResponse };
    case "PostToolUseFailure":
      return {
        // `error` 是**字符串**（旧脚本按字符串读），`error_details` 保留整个对象。
        error: input.error?.message ?? "",
        error_details: input.error,
        is_interrupt: input.isInterrupt,
      };
    case "Stop":
      return {
        last_assistant_message: input.responseText ?? input.responsePreview,
        stop_hook_active: input.stopHookActive,
      };
    default:
      // SessionStart / UserPromptSubmit / PreToolUse 无额外别名。
      return {};
  }
}

/** 工具字段（仅当输入带 `toolName`）。 */
function toolFieldEntries(input: HookInputLike): Record<string, unknown> {
  if (!("toolName" in input)) return {};
  return {
    tool_name: input.toolName,
    tool_input: input.toolInput,
    tool_use_id: input.toolCallId,
  };
}

/** 固定别名（B1.1）：每次都带。 */
function fixedAliases(input: HookInputLike, transcriptPath: string): Record<string, unknown> {
  return {
    agent_type: input.agentName,
    hook_event_name: input.hookEventName,
    permission_mode: input.mode,
    session_id: input.sessionId,
    // 两种拼法同值：旧脚本可能读任一个（B1.2 明确要求）。
    transcript_path: transcriptPath,
    transcriptPath,
  };
}

/**
 * 生成脚本 stdin 与一次性 transcript 文件。
 *
 * `cleanup` 是临时目录的**唯一释放点**，调用方必须在 `finally` 中执行（B7.4）。
 * 返回的 `value` 已带结尾换行（B1.11）。
 */
export async function buildHookStdin(
  input: HookInputLike,
  tempDirectory: HookTempDirectoryPort,
): Promise<HookStdin> {
  const { path: directory } = await tempDirectory.createTempDirectory({ prefix: TEMP_PREFIX });
  // 用 path.join 而不是字符串拼接：Windows 与 POSIX 的分隔符不同。
  const transcriptPath = join(directory, TRANSCRIPT_FILE);

  // 合并顺序即优先级：原始字段 → 固定别名 → 工具字段 → 事件专属别名。
  // 用 object spread 而不是 Object.assign：语义相同但更易读，且不修改入参。
  const payload = {
    ...(input as unknown as Record<string, unknown>),
    ...fixedAliases(input, transcriptPath),
    ...toolFieldEntries(input),
    ...eventSpecificFields(input),
  };

  // transcript 写到临时目录；内容由事件决定（上面 transcriptFor）。
  // ⚠️ 这里用 FileSystemPort 写文件 —— 但本包不直接调 fs，
  //    所以临时目录端口也要能写文件。见 temp-directory.ts 的 writeTranscript。
  await tempDirectory.writeTranscript(transcriptPath, transcriptFor(input));

  let released = false;
  const cleanup = async (): Promise<void> => {
    // 幂等：重复调用不重复删除（B1.5 要求「可重复调用不抛错」）。
    if (released) return;
    released = true;
    await tempDirectory.removeDirectory({ path: directory });
  };

  return { value: `${JSON.stringify(payload)}\n`, cleanup };
}

/** 生成一次性 Hook 标识（供 trace/日志关联；不进入脚本载荷）。 */
export function newHookInvocationId(): string {
  return randomUUID();
}
