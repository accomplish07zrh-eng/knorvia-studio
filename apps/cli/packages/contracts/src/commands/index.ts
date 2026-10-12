// Custom Command Contracts - user-defined slash prompt commands

import type { HookPluginContext } from "../hooks/index.js";
import type { ExecutionContext, TraceContext } from "../tracing/tracer.js";

export type CustomCommandScope = "project" | "user" | "system" | "admin";

export type CustomCommandSource = "agents" | "knorvia" | "plugin";

export type CustomCommandDiagnosticSeverity = "warning" | "error";

export type CustomCommandDiagnosticCode =
  | "custom_command_duplicate_name"
  | "custom_command_invalid_frontmatter"
  | "custom_command_invalid_name"
  | "custom_command_read_failed"
  | "custom_command_root_not_found"
  | "custom_command_scan_failed"
  | "custom_command_too_large"
  | "custom_command_unknown_frontmatter"
  | "custom_command_unsupported_dynamic_syntax";

export interface CustomCommandRoot {
  path: string;
  plugin?: HookPluginContext;
  scope: CustomCommandScope;
  source: CustomCommandSource;
  priority: number;
}

export interface CustomCommandMetadata {
  allowedTools: string[];
  argumentHint?: string;
  description: string;
  disableNonInteractive: boolean;
  frontmatterKeys: string[];
  model?: string;
  name: string;
  path: string;
  plugin?: HookPluginContext;
  rootPath: string;
  scope: CustomCommandScope;
  skills: string[];
  source: CustomCommandSource;
}

export interface CustomCommandDiagnostic {
  code: CustomCommandDiagnosticCode;
  severity: CustomCommandDiagnosticSeverity;
  message: string;
  path?: string;
  commandName?: string;
}

export interface CustomCommandLoadOutcome {
  commands: CustomCommandMetadata[];
  diagnostics: CustomCommandDiagnostic[];
  totalDiscovered: number;
}

export interface CustomCommandContent {
  metadata: CustomCommandMetadata;
  content: string;
  bytesRead: number;
  sizeBytes: number;
  truncated: boolean;
}

export interface CustomCommandDiscoverRequest {
  roots?: CustomCommandRoot[];
  trace?: TraceContext;
  workingDirectory: string;
}

export interface CustomCommandLoadRequest {
  maxBytes?: number;
  name: string;
  roots?: CustomCommandRoot[];
  trace?: TraceContext;
  workingDirectory: string;
}

export interface CustomCommandOperationOptions {
  context?: ExecutionContext;
  signal?: AbortSignal;
}

export interface CustomCommandPort {
  discoverCommands(
    request: CustomCommandDiscoverRequest,
    options?: CustomCommandOperationOptions,
  ): Promise<CustomCommandLoadOutcome>;
  loadCommand(
    request: CustomCommandLoadRequest,
    options?: CustomCommandOperationOptions,
  ): Promise<CustomCommandContent>;
}

export interface CustomCommandExpansion {
  argumentCount: number;
  prompt: string;
  usedArgumentsPlaceholder: boolean;
}

export interface CustomCommandTemplateExpansion {
  argumentCount: number;
  body: string;
  usedArgumentsPlaceholder: boolean;
}

const POSITIONAL_ARGUMENT_PATTERN = /\$(\d+)/g;
const ALL_ARGUMENTS_TOKEN = "$ARGUMENTS";
/** 动态语法的两种写法：行内 `` !`…` `` 与围栏 ` ```! `。 */
const DYNAMIC_SYNTAX_PATTERNS: ReadonlyArray<readonly ["shell", RegExp]> = [
  ["shell", /!`[^`]*`/],
  ["shell", /```!\s*[\s\S]*?```/],
];

export function expandCustomCommandPrompt(input: {
  args: string;
  command: CustomCommandContent;
}): CustomCommandExpansion {
  const expanded = expandCustomCommandTemplate(input);
  const dynamicSyntax = detectUnsupportedDynamicSyntax(expanded.body);
  if (dynamicSyntax !== undefined) {
    throw new Error(unsupportedDynamicSyntaxMessage(input.command.metadata.name, dynamicSyntax));
  }

  return formatCustomCommandPrompt({
    body: expanded.body,
    command: input.command,
    argumentCount: expanded.argumentCount,
    usedArgumentsPlaceholder: expanded.usedArgumentsPlaceholder,
  });
}

/** 未支持语法的报错文案；命令名与语法类别是两处外部可见的变量，整句必须逐字保持。 */
function unsupportedDynamicSyntaxMessage(commandName: string, syntax: string): string {
  return `Custom command /${commandName} uses unsupported ${syntax} expansion. Dynamic expansion is not available yet.`;
}

export function expandCustomCommandTemplate(input: {
  args: string;
  command: CustomCommandContent;
}): CustomCommandTemplateExpansion {
  const trimmedArgs = input.args.trim();
  const positional = splitCustomCommandArguments(trimmedArgs);
  const template = input.command.content;

  // 两种占位符都会把「用过占位符」置真：$ARGUMENTS 只要出现即算，$n 在替换回调里置真。
  let usedArgumentsPlaceholder = template.includes(ALL_ARGUMENTS_TOKEN);
  let body = template.replaceAll(ALL_ARGUMENTS_TOKEN, trimmedArgs);
  body = body.replace(POSITIONAL_ARGUMENT_PATTERN, (_match, index: string) => {
    usedArgumentsPlaceholder = true;
    const offset = Number(index) - 1;
    return positional[offset] ?? "";
  });

  // 有实参但没用占位符时补一段「User arguments」；用占位符时正文里已经带了实参。
  const appendsUserArguments = trimmedArgs.length > 0 && !usedArgumentsPlaceholder;
  if (appendsUserArguments) {
    body = `${body.trimEnd()}\n\nUser arguments:\n${trimmedArgs}`;
  }

  const expansion: CustomCommandTemplateExpansion = {
    argumentCount: positional.length,
    body,
    usedArgumentsPlaceholder,
  };
  return expansion;
}

export function formatCustomCommandPrompt(input: {
  argumentCount: number;
  body: string;
  command: CustomCommandContent;
  usedArgumentsPlaceholder: boolean;
}): CustomCommandExpansion {
  const { name, scope, source, skills } = input.command.metadata;
  const segments = [
    `Run custom command /${name}.`,
    `Command source: ${scope}/${source}.`,
    ...skillInstructionLines(skills ?? []),
    "",
    input.body.trim(),
  ];
  return {
    argumentCount: input.argumentCount,
    prompt: segments.join("\n"),
    usedArgumentsPlaceholder: input.usedArgumentsPlaceholder,
  };
}

/** 技能指令两行；没有技能时整段不出现（不是空行占位）。 */
function skillInstructionLines(skills: readonly string[]): string[] {
  if (skills.length === 0) return [];
  const quoted = skills.map((skill) => `\`${skill}\``).join(", ");
  const lines: string[] = [];
  lines.push(`Required skills: ${quoted}.`);
  lines.push(`Before following the command body, call the Skill tool for ${quoted}.`);
  return lines;
}

/** 分词状态：引号内不切分，引号本身不保留。 */
type ArgumentTokenState = "plain" | "singleQuoted" | "doubleQuoted";

/** 字符类：一次判定，再按状态决定「追加、置转义、开/闭引号、切分」。 */
type ArgumentCharClass = "escape" | "quoteSingle" | "quoteDouble" | "space" | "text";

function classifyArgumentChar(char: string): ArgumentCharClass {
  if (char === "\\") return "escape";
  if (char === "'") return "quoteSingle";
  if (char === '"') return "quoteDouble";
  return /\s/u.test(char) ? "space" : "text";
}

/** 引号切换：闭合当前引号或从普通状态进入该引号；另一种引号在引号内按普通字符处理。 */
function nextQuoteState(
  state: ArgumentTokenState,
  target: "singleQuoted" | "doubleQuoted",
): ArgumentTokenState | undefined {
  if (state === target) return "plain";
  return state === "plain" ? target : undefined;
}

export function splitCustomCommandArguments(input: string): string[] {
  const tokens: string[] = [];
  let buffer = "";
  let state: ArgumentTokenState = "plain";
  let escaping = false;

  const flush = (): void => {
    if (buffer.length === 0) return;
    tokens.push(buffer);
    buffer = "";
  };

  for (const char of input) {
    if (escaping) {
      // 转义只作用于下一个字符：引号与空白都按字面追加。
      buffer += char;
      escaping = false;
    } else {
      const charClass = classifyArgumentChar(char);
      if (charClass === "escape") {
        escaping = true;
      } else if (charClass === "space") {
        if (state === "plain") flush();
        else buffer += char;
      } else if (charClass === "quoteSingle" || charClass === "quoteDouble") {
        const target = char === "'" ? "singleQuoted" : "doubleQuoted";
        const next = nextQuoteState(state, target);
        if (next === undefined) buffer += char;
        else state = next;
      } else {
        buffer += char;
      }
    }
  }

  // 末尾孤立的反斜杠按字面 `\` 追加，而不是丢掉。
  if (escaping) buffer += "\\";
  flush();
  return tokens;
}

export function detectUnsupportedDynamicSyntax(content: string): "shell" | undefined {
  const matched = DYNAMIC_SYNTAX_PATTERNS.find(([, pattern]) => pattern.test(content));
  return matched?.[0];
}
