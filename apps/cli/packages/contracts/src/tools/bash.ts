// SPDX-License-Identifier: Apache-2.0
// Bash 工具的声明面：前台/后台执行 shell 命令的输入、输出与错误码形状。
// 输入侧的语义化数字/布尔处理与输出侧的字段说明分开摆放，方便对照合同逐项核对。

import { z } from "zod";
import { ToolCallId, TraceId } from "../interfaces/shared.js";
import { toToolJsonSchema } from "./json-schema.js";
import { ToolExecutionTelemetrySchema } from "./performance.js";

// 单次命令的超时上限：与 describe 文案里给模型看的数字同源，改这里就改那里。
const BASH_TIMEOUT_CEILING_MS = 600_000;
// 两个词表决定哪些字符串算真、哪些算假；不在表里的字符串一律按非法值处理。
const TRUE_BOOLEAN_STRINGS = new Set(["true", "1", "yes", "y", "on"]);
const FALSE_BOOLEAN_STRINGS = new Set(["false", "0", "no", "n", "off"]);
// description 字段的用法说明（模型可见）：第一段讲写什么、怎么保持简短并给简单命令的例子，
// 第二段讲难一眼看懂的命令（管道、冷门 flag）要多给一点上下文。段落内部逐行拼接、
// 段落之间空一行，最终文本与合同冻结的那份逐字一致。
const BASH_DESCRIPTION_PARAGRAPHS = [
  [
    'Clear, concise description of what this command does in active voice. Never use words like "complex" or "risk" in the description - just describe what it does.',
  ],
  [
    "For simple commands (git, npm, standard CLI tools), keep it brief (5-10 words):",
    '- ls → "List files in current directory"',
    '- git status → "Show working tree status"',
    '- npm install → "Install package dependencies"',
  ],
  [
    "For commands that are harder to parse at a glance (piped commands, obscure flags, etc.), add enough context to clarify what it does:",
    '- find . -name "*.tmp" -exec rm {} \\; → "Find and delete all .tmp files recursively"',
    '- git reset --hard origin/main → "Discard all local changes and match remote main"',
    "- curl -s url | jq '.data[]' → \"Fetch JSON from URL and extract data array elements\"",
  ],
];
const BASH_DESCRIPTION_HINT = BASH_DESCRIPTION_PARAGRAPHS.map((paragraph) =>
  paragraph.join("\n"),
).join("\n\n");

// 输入 schema：command 必填；timeout / description / 后台与沙箱开关都可选，
// 数字与布尔先经下方两个预处理函数接受常见字符串写法。
export const BashInputSchema = z
  .object({
    command: z.string().describe("The command to execute"),
    /**
     * Optional timeout in milliseconds (max 600000)
     */
    timeout: semanticNumber(z.number())
      .optional()
      .describe(`Optional timeout in milliseconds (max ${BASH_TIMEOUT_CEILING_MS})`),
    /**
     * Clear, concise description of what this command does in active voice.
     * Never use words like "complex" or "risk" in the description - just describe what it does.
     *
     * For simple commands (git, npm, standard CLI tools), keep it brief (5-10 words):
     * - ls → "List files in current directory"
     * - git status → "Show working tree status"
     * - npm install → "Install package dependencies"
     *
     * For commands that are harder to parse at a glance (piped commands, obscure flags, etc.),
     * add enough context to clarify what it does:
     * - find . -name "*.tmp" -exec rm {} \; → "Find and delete all .tmp files recursively"
     * - git reset --hard origin/main → "Discard all local changes and match remote main"
     * - curl -s url | jq '.data[]' → "Fetch JSON from URL and extract data array elements"
     */
    description: z.string().optional().describe(BASH_DESCRIPTION_HINT),
    /**
     * Set to true to run this command in the background. Use Read to read the output later.
     */
    run_in_background: semanticBoolean()
      .optional()
      .describe("Set to true to run this command in the background."),
    /**
     * Set this to true to dangerously override sandbox mode and run commands without sandboxing.
     */
    dangerouslyDisableSandbox: semanticBoolean()
      .optional()
      .describe(
        "Set this to true to dangerously override sandbox mode and run commands without sandboxing.",
      ),
  })
  .strict();

export type BashInput = z.infer<typeof BashInputSchema>;

export const BashInputJsonSchema = toToolJsonSchema(BashInputSchema);

// 数字参数接受 JSON 里常见的字符串写法（例如 "15000"）：能安全转成有限数就转，
// 转不动就把原值交给 zod，由它按原类型报错，不做静默兜底。
function semanticNumber(schema: z.ZodNumber): z.ZodEffects<z.ZodNumber, number, unknown> {
  return z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed.length === 0) return value;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }, schema);
}

// 布尔参数同理：接受 true/false 与 1/0，也接受 yes/no、on/off 这类常见词；
// 不认识的值原样交给 zod 报错。
function semanticBoolean(): z.ZodEffects<z.ZodBoolean, boolean, unknown> {
  return z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
      return value;
    }
    if (typeof value !== "string") return value;

    const normalized = value.trim().toLowerCase();
    if (TRUE_BOOLEAN_STRINGS.has(normalized)) return true;
    if (FALSE_BOOLEAN_STRINGS.has(normalized)) return false;
    return value;
  }, z.boolean());
}

// 输出形状：运行结果（stdout/stderr、状态、退出码与信号、截断情况、落盘路径）加上追加给模型的提示。

export interface BashOutput {
  /**
   * The standard output of the command
   */
  stdout: string;
  /**
   * The standard error output of the command
   */
  stderr: string;
  /**
   * Structured execution status
   */
  status?: "completed" | "failed" | "timed_out" | "cancelled" | "spawn_error" | "backgrounded";
  /**
   * Process exit code. Non-zero exits are represented here instead of thrown.
   */
  exitCode?: number;
  /**
   * Process exit signal, when available
   */
  signal?: string;
  /**
   * Whether timeout policy stopped the command
   */
  timedOut?: boolean;
  /**
   * Whether cancellation stopped the command
   */
  cancelled?: boolean;
  /**
   * Whether stdout was truncated for inline return
   */
  stdoutTruncated?: boolean;
  /**
   * Whether stderr was truncated for inline return
   */
  stderrTruncated?: boolean;
  /**
   * Total stdout bytes observed
   */
  stdoutBytes?: number;
  /**
   * Total stderr bytes observed
   */
  stderrBytes?: number;
  /**
   * Path to raw output file for large MCP tool outputs
   */
  rawOutputPath?: string;
  /**
   * Whether the command was interrupted
   */
  interrupted: boolean;
  /**
   * Flag to indicate if stdout contains image data
   */
  isImage?: boolean;
  /**
   * ID of the background task if command is running in background
   */
  backgroundTaskId?: string;
  /**
   * True if the user manually backgrounded the command with Ctrl+B
   */
  backgroundedByUser?: boolean;
  /**
   * True if assistant-mode auto-backgrounded a long-running blocking command
   */
  assistantAutoBackgrounded?: boolean;
  /**
   * Flag to indicate if sandbox mode was overridden
   */
  dangerouslyDisableSandbox?: boolean;
  /**
   * Semantic interpretation for non-error exit codes with special meaning
   */
  returnCodeInterpretation?: string;
  /**
   * Whether the command is expected to produce no output on success
   */
  noOutputExpected?: boolean;
  /**
   * Structured content blocks
   */
  structuredContent?: unknown[];
  /**
   * Path to the persisted full output in tool-results dir (set when output is too large for inline)
   */
  persistedOutputPath?: string;
  /**
   * Path to the persisted stdout stream, when stdout was written to an execution artifact.
   */
  stdoutPersistedOutputPath?: string;
  /**
   * Path to the persisted stderr stream, when stderr was written to an execution artifact.
   */
  stderrPersistedOutputPath?: string;
  /**
   * Total size of the output in bytes (set when output is too large for inline)
   */
  persistedOutputSize?: number;
  /**
   * Persisted stdout artifact bytes, when stdout was written to an execution artifact.
   */
  stdoutPersistedOutputSize?: number;
  /**
   * Persisted stderr artifact bytes, when stderr was written to an execution artifact.
   */
  stderrPersistedOutputSize?: number;
  /**
   * Model-facing note listing readFileState entries whose mtime bumped during this command
   */
  staleReadFileStateHint?: string;
  /**
   * gh 命令触发 GitHub API rate limit 时，追加给模型的 system-reminder。
   */
  ghRateLimitHint?: string;
}

export const BashOutputSchema = z
  .object({
    stdout: z.string(),
    stderr: z.string(),
    status: z
      .enum(["completed", "failed", "timed_out", "cancelled", "spawn_error", "backgrounded"])
      .optional(),
    exitCode: z.number().int().optional(),
    signal: z.string().optional(),
    timedOut: z.boolean().optional(),
    cancelled: z.boolean().optional(),
    stdoutTruncated: z.boolean().optional(),
    stderrTruncated: z.boolean().optional(),
    stdoutBytes: z.number().int().nonnegative().optional(),
    stderrBytes: z.number().int().nonnegative().optional(),
    rawOutputPath: z.string().optional(),
    interrupted: z.boolean(),
    isImage: z.boolean().optional(),
    backgroundTaskId: z.string().optional(),
    backgroundedByUser: z.boolean().optional(),
    assistantAutoBackgrounded: z.boolean().optional(),
    dangerouslyDisableSandbox: z.boolean().optional(),
    returnCodeInterpretation: z.string().optional(),
    noOutputExpected: z.boolean().optional(),
    structuredContent: z.array(z.unknown()).optional(),
    persistedOutputPath: z.string().optional(),
    stdoutPersistedOutputPath: z.string().optional(),
    stderrPersistedOutputPath: z.string().optional(),
    persistedOutputSize: z.number().int().nonnegative().optional(),
    stdoutPersistedOutputSize: z.number().int().nonnegative().optional(),
    stderrPersistedOutputSize: z.number().int().nonnegative().optional(),
    staleReadFileStateHint: z.string().optional(),
    ghRateLimitHint: z.string().optional(),
    perf: ToolExecutionTelemetrySchema.optional(),
  })
  .strict();

export const BashOutputJsonSchema = toToolJsonSchema(BashOutputSchema);

// 一次工具调用的记录形状：入参、trace 归属与开始时刻。

export interface BashToolCall {
  id: ToolCallId;
  name: "Bash";
  input: BashInput;
  traceId: TraceId;
  startedAt: Date;
}

export interface BashToolResult {
  toolCallId: ToolCallId;
  output: BashOutput;
  traceId: TraceId;
  durationMs: number;
}

// 后台任务的记录形状：有自己的 id、命令与状态，与前台的一次调用分开管理。

export interface BackgroundTask {
  id: string;
  command: string;
  description?: string;
  startedAt: Date;
  status: "running" | "completed" | "failed" | "cancelled";
  exitCode?: number;
  outputPath?: string;
  stderrPersistedOutputPath?: string;
  stdoutPersistedOutputPath?: string;
  completedAt?: Date;
}

// 错误码：每个码都是稳定字符串常量，上层按码把失败翻译成用户可读的提示。

export const BashErrorCode = {
  COMMAND_NOT_PARSABLE: "bash_command_not_parsable",
  COMMAND_TOO_COMPLEX: "bash_command_too_complex",
  COMMAND_INJECTION_RISK: "bash_command_injection_risk",
  READONLY_CHECK_FAILED: "bash_readonly_check_failed",
  UNC_PATH_BLOCKED: "bash_unc_path_blocked",
  HIGH_RISK_COMBINATION: "bash_high_risk_combination",
  SANDBOX_VIOLATION: "bash_sandbox_violation",
  TIMEOUT: "bash_timeout",
  USER_INTERRUPTED: "bash_user_interrupted",
  PROCESS_START_FAILED: "bash_process_start_failed",
  NON_ZERO_EXIT: "bash_non_zero_exit",
  OUTPUT_TOO_LARGE: "bash_output_too_large",
  PERMISSION_DENIED: "bash_permission_denied",
} as const;

export type BashErrorCode = (typeof BashErrorCode)[keyof typeof BashErrorCode];

// shell 权限策略：allow/deny 规则加模式串，另有只读放行、沙箱与危险开关三个布尔。

export type ShellPermissionRule = {
  type: "allow" | "deny";
  pattern: string;
  description?: string;
};

export interface ShellPermissionPolicy {
  rules: ShellPermissionRule[];
  allowReadonly: boolean;
  sandboxEnabled: boolean;
  dangerousDisableSandboxAllowed: boolean;
}
