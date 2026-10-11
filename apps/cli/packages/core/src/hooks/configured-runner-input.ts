// SPDX-License-Identifier: Apache-2.0
// 兼容输入与环境：把内部 camelCase 输入翻译成 Hook 脚本期望的形态（含 transcript 临时文件），
// 并处理插件环境变量与超时。字段一律先收集成条目再归约，避免逐字段拼接散落各处。
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
const SKILL_VARIABLES: readonly string[] = ["CLAUDE_SKILL_DIR", "KNORVIA_SKILL_DIR"];
const VARIABLE_PATTERN =
  /\$\{(CLAUDE_CODE_SESSION_ID|CLAUDE_PLUGIN_DATA|CLAUDE_PLUGIN_ROOT|CLAUDE_PROJECT_DIR|CLAUDE_SESSION_ID|CLAUDE_SKILL_DIR|KNORVIA_PLUGIN_DATA|KNORVIA_PLUGIN_ROOT|KNORVIA_PROJECT_DIR|KNORVIA_SESSION_ID|KNORVIA_SKILL_DIR)\}/gu;

const asRecord = (entries: readonly (readonly [string, unknown])[]): Record<string, unknown> =>
  Object.fromEntries(entries);

/** 会话/项目变量始终可用；插件变量只在拿到插件上下文时注入。 */
function environmentEntries(
  input: HookInput,
  workingDirectory: string,
): (readonly [string, string])[] {
  const project = input.cwd || workingDirectory;
  return [
    ["CLAUDE_CODE_SESSION_ID", input.sessionId],
    ["CLAUDE_PROJECT_DIR", project],
    ["CLAUDE_SESSION_ID", input.sessionId],
    ["KNORVIA_PROJECT_DIR", project],
    ["KNORVIA_SESSION_ID", input.sessionId],
  ];
}

function baseEnvironment(input: HookInput, workingDirectory: string): Record<string, string> {
  return Object.fromEntries(environmentEntries(input, workingDirectory));
}

/** 插件上下文的四条 CLAUDE_* 与两条 KNORVIA_*，按条目给出便于整体归约。 */
function pluginEnvironment(plugin: HookPluginContext): Record<string, string> {
  const pairs: (readonly [string, string])[] = [
    ["CLAUDE_PLUGIN_DATA", plugin.dataPath],
    ["CLAUDE_PLUGIN_ROOT", plugin.rootPath],
    ["KNORVIA_PLUGIN_DATA", plugin.dataPath],
    ["KNORVIA_PLUGIN_ID", plugin.id],
    ["KNORVIA_PLUGIN_NAME", plugin.name],
    ["KNORVIA_PLUGIN_ROOT", plugin.rootPath],
  ];
  return Object.fromEntries(pairs);
}

/** 事件专属别名读取用的拓宽视图；只在按事件查表时使用，公开契约仍是 HookInput。 */
type EventInput = HookInput & {
  responseText?: string;
  responsePreview?: string;
  prompt?: string;
  permissionSuggestions?: unknown;
  toolResponse?: unknown;
  error?: { message: string };
  isInterrupt?: boolean;
  stopHookActive?: boolean;
};

type TranscriptBuilder = (input: EventInput) => string;

function transcriptLine(role: "assistant" | "user", text: string): string {
  const message = { content: [{ text, type: "text" }], role };
  return `${JSON.stringify({ message })}\n`;
}

/** 事件 → transcript 行构造器；未列出的事件写空内容。 */
const TRANSCRIPT_BUILDERS = new Map<string, TranscriptBuilder>([
  [
    HookEventName.Stop,
    (input) => transcriptLine("assistant", input.responseText ?? input.responsePreview ?? ""),
  ],
  [HookEventName.UserPromptSubmit, (input) => transcriptLine("user", input.prompt ?? "")],
]);

function transcriptFor(input: HookInput): string {
  const build = TRANSCRIPT_BUILDERS.get(input.hookEventName);
  return build === undefined ? "" : build(input as EventInput);
}

type FieldBuilder = (input: EventInput) => readonly (readonly [string, unknown])[];

/**
 * 事件专属兼容字段表：只补无损别名，原始 camelCase 字段仍是内部主契约。
 * 表驱动让「某事件带哪些别名」一眼可见，也避免长的分支链。
 */
const EVENT_FIELD_BUILDERS: ReadonlyMap<string, FieldBuilder> = new Map([
  [
    HookEventName.PermissionRequest,
    (input) => [["permission_suggestions", input.permissionSuggestions]],
  ],
  [HookEventName.PostToolUse, (input) => [["tool_response", input.toolResponse]]],
  [
    HookEventName.PostToolUseFailure,
    (input) => [
      ["error", input.error?.message ?? ""],
      ["error_details", input.error],
      ["is_interrupt", input.isInterrupt],
    ],
  ],
  [
    HookEventName.Stop,
    (input) => [
      ["last_assistant_message", input.responseText ?? input.responsePreview],
      ["stop_hook_active", input.stopHookActive],
    ],
  ],
]);

function eventSpecificFields(input: HookInput): Record<string, unknown> {
  const build = EVENT_FIELD_BUILDERS.get(input.hookEventName);
  return build === undefined ? {} : asRecord(build(input as EventInput));
}

function toolFieldEntries(input: HookInput): (readonly [string, unknown])[] {
  if (!("toolName" in input)) return [];
  return [
    ["tool_name", input.toolName],
    ["tool_input", input.toolInput],
    ["tool_use_id", input.toolCallId],
  ];
}

/**
 * 生成脚本 stdin 与一次性 transcript 文件。`cleanup` 是临时目录的唯一释放点，
 * 调用方必须在 finally 中执行；返回对象里的 value 已带结尾换行。
 */
export async function createCompatibleHookStdin(
  input: HookInput,
): Promise<{ cleanup: () => Promise<void>; value: string }> {
  const directory = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
  const transcriptPath = join(directory, TRANSCRIPT_FILE);
  await writeFile(transcriptPath, transcriptFor(input), "utf8");

  const aliasEntries: (readonly [string, unknown])[] = [
    ["agent_type", input.agentName],
    ["hook_event_name", input.hookEventName],
    ["permission_mode", input.mode],
    ["session_id", input.sessionId],
    ["transcript_path", transcriptPath],
    ["transcriptPath", transcriptPath],
  ];
  const payload = Object.assign(
    {},
    input,
    asRecord(aliasEntries),
    asRecord(toolFieldEntries(input)),
    eventSpecificFields(input),
  );

  const release = async (): Promise<void> => {
    await rm(directory, { force: true, recursive: true });
  };
  return { cleanup: release, value: `${JSON.stringify(payload)}\n` };
}

export function resolveHookTimeoutMs(hook: HookConfig, defaultTimeoutMs: number): number {
  return resolveWorkspaceHookTimeoutMs(hook, defaultTimeoutMs);
}

/** 执行时注入子进程的环境覆盖（调用方按 `set` 整体使用，不是增量 patch）。 */
export function createPluginEnvOverlay(
  plugin: HookPluginContext | undefined,
  input: HookInput,
  workingDirectory: string,
): { set: Record<string, string> } {
  const set = baseEnvironment(input, workingDirectory);
  const merged = plugin === undefined ? set : { ...set, ...pluginEnvironment(plugin) };
  return { set: merged };
}

function replacementTable(
  plugin: HookPluginContext | undefined,
  input: HookInput,
  workingDirectory: string,
): Record<string, string> {
  const table = baseEnvironment(input, workingDirectory);
  if (plugin === undefined) return table;
  return Object.assign(table, pluginEnvironment(plugin));
}

/**
 * 展开命令/参数里的 `${VAR}`。skill 变量在 hook 运行时没有语义，
 * 展开成空串会把「缺少上下文」变成一条错误命令，因此这里显式抛配置错误。
 */
export function expandPluginVariables(
  value: string,
  plugin: HookPluginContext | undefined,
  input: HookInput,
  workingDirectory: string,
): string {
  const table = replacementTable(plugin, input, workingDirectory);
  const expand = (match: string, key: string): string => {
    if (SKILL_VARIABLES.includes(key)) {
      const context = { hookEventName: input.hookEventName, variable: key };
      throw createCoreError(
        CoreErrorType.ConfigurationError,
        `Hook variable requires a skill context: ${key}`,
        { context, recoverable: true },
      );
    }
    const replacement = table[key];
    return replacement === undefined ? match : replacement;
  };
  return value.replace(VARIABLE_PATTERN, expand);
}
