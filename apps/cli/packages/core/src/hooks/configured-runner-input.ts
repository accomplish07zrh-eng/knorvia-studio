// SPDX-License-Identifier: Apache-2.0
// 兼容输入与环境：把内部 camelCase 输入翻译成 Hook 脚本期望的输入形态（含 transcript 临时文件），
// 并解析插件环境变量与超时。
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveWorkspaceHookTimeoutMs } from "@knorvia/shared/workspace-hook-discovery";
import {
  CoreErrorType,
  HookEventName,
  createCoreError,
  type HookConfig,
  type HookInput,
  type HookPluginContext,
} from "@knorvia/contracts";

const TEMP_PREFIX = "knorvia-hook-";
const TRANSCRIPT_FILE = "transcript.jsonl";
const SKILL_DIRECTORY_VARIABLES = ["CLAUDE_SKILL_DIR", "KNORVIA_SKILL_DIR"] as const;
const VARIABLE_PATTERN =
  /\$\{(CLAUDE_CODE_SESSION_ID|CLAUDE_PLUGIN_DATA|CLAUDE_PLUGIN_ROOT|CLAUDE_PROJECT_DIR|CLAUDE_SESSION_ID|CLAUDE_SKILL_DIR|KNORVIA_PLUGIN_DATA|KNORVIA_PLUGIN_ROOT|KNORVIA_PROJECT_DIR|KNORVIA_SESSION_ID|KNORVIA_SKILL_DIR)\}/gu;

/** 会话/项目相关的变量在任何情况下都可用；插件变量只有拿到插件上下文时才注入。 */
function baseEnvironment(input: HookInput, workingDirectory: string): Record<string, string> {
  const projectDirectory = input.cwd || workingDirectory;
  return {
    CLAUDE_CODE_SESSION_ID: input.sessionId,
    CLAUDE_PROJECT_DIR: projectDirectory,
    CLAUDE_SESSION_ID: input.sessionId,
    KNORVIA_PROJECT_DIR: projectDirectory,
    KNORVIA_SESSION_ID: input.sessionId,
  };
}

function pluginEnvironment(plugin: HookPluginContext): Record<string, string> {
  return {
    CLAUDE_PLUGIN_DATA: plugin.dataPath,
    CLAUDE_PLUGIN_ROOT: plugin.rootPath,
    KNORVIA_PLUGIN_DATA: plugin.dataPath,
    KNORVIA_PLUGIN_ID: plugin.id,
    KNORVIA_PLUGIN_NAME: plugin.name,
    KNORVIA_PLUGIN_ROOT: plugin.rootPath,
  };
}

function transcriptLine(role: "assistant" | "user", text: string): string {
  return `${JSON.stringify({ message: { content: [{ text, type: "text" }], role } })}\n`;
}

function transcriptFor(input: HookInput): string {
  if (input.hookEventName === HookEventName.Stop)
    return transcriptLine("assistant", input.responseText ?? input.responsePreview);
  if (input.hookEventName === HookEventName.UserPromptSubmit)
    return transcriptLine("user", input.prompt);
  return "";
}

/** 事件专属的兼容字段；只补无损别名，保留原始 camelCase 字段作为内部主契约。 */
function eventSpecificFields(input: HookInput): Record<string, unknown> {
  switch (input.hookEventName) {
    case HookEventName.PermissionRequest:
      return { permission_suggestions: input.permissionSuggestions };
    case HookEventName.PostToolUse:
      return { tool_response: input.toolResponse };
    case HookEventName.PostToolUseFailure:
      return {
        error: input.error.message,
        error_details: input.error,
        is_interrupt: input.isInterrupt,
      };
    case HookEventName.Stop:
      return {
        last_assistant_message: input.responseText ?? input.responsePreview,
        stop_hook_active: input.stopHookActive,
      };
    default:
      return {};
  }
}

/**
 * 生成脚本 stdin 与一次性 transcript 文件。
 * 返回的 `cleanup` 是临时目录的唯一释放点，必须由调用方在 finally 中执行。
 */
export async function createCompatibleHookStdin(
  input: HookInput,
): Promise<{ cleanup: () => Promise<void>; value: string }> {
  const directory = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
  const transcriptPath = join(directory, TRANSCRIPT_FILE);
  await writeFile(transcriptPath, transcriptFor(input), "utf8");

  const payload: Record<string, unknown> = {
    ...input,
    agent_type: input.agentName,
    hook_event_name: input.hookEventName,
    permission_mode: input.mode,
    session_id: input.sessionId,
    transcript_path: transcriptPath,
    transcriptPath,
    ...("toolName" in input
      ? { tool_name: input.toolName, tool_input: input.toolInput, tool_use_id: input.toolCallId }
      : {}),
    ...eventSpecificFields(input),
  };

  return {
    cleanup: async () => {
      await rm(directory, { force: true, recursive: true });
    },
    value: `${JSON.stringify(payload)}\n`,
  };
}

export function resolveHookTimeoutMs(hook: HookConfig, defaultTimeoutMs: number): number {
  return resolveWorkspaceHookTimeoutMs(hook, defaultTimeoutMs);
}

/** 执行时注入给子进程的环境覆盖（不是增量 patch：调用方按 `set` 使用）。 */
export function createPluginEnvOverlay(
  plugin: HookPluginContext | undefined,
  input: HookInput,
  workingDirectory: string,
): { set: Record<string, string> } {
  const set = baseEnvironment(input, workingDirectory);
  return { set: plugin ? { ...set, ...pluginEnvironment(plugin) } : set };
}

/**
 * 展开命令/参数里的 `${VAR}`。skill 相关变量在 hook 运行时没有语义，
 * 展开成空串会把「缺少上下文」静默变成错误命令，因此这里显式报配置错误。
 */
export function expandPluginVariables(
  value: string,
  plugin: HookPluginContext | undefined,
  input: HookInput,
  workingDirectory: string,
): string {
  const replacements: Record<string, string> = baseEnvironment(input, workingDirectory);
  if (plugin) Object.assign(replacements, pluginEnvironment(plugin));

  return value.replace(VARIABLE_PATTERN, (match, key: string) => {
    if ((SKILL_DIRECTORY_VARIABLES as readonly string[]).includes(key)) {
      throw createCoreError(
        CoreErrorType.ConfigurationError,
        `Hook variable requires a skill context: ${key}`,
        { context: { hookEventName: input.hookEventName, variable: key }, recoverable: true },
      );
    }
    return replacements[key] ?? match;
  });
}
