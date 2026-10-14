// SPDX-License-Identifier: Apache-2.0
// 展示元数据：把 HookConfig 变成客户端可读的执行描述，并把要展示/记录的文本做秘密遮蔽。
// 命令展示由"片段规范化 + 拼接规则"两段组成；遮蔽由一张有序规则表驱动。
import type { HookConfig, HookExecutionDescriptor } from "@knorvia/contracts";

const INTERNAL_LABEL = "internal";
const REDACTION = "••••";
const BARE_SAFE = /^[A-Za-z0-9_./:@%+=,-]+$/u;
const SECRET_WORD =
  "(?:access[_-]?token|api[_-]?key|credential|password|private[_-]?key|secret|token)";
const SECRET_NAME = `(?:[A-Za-z0-9]+[_-])*${SECRET_WORD}(?:[_-][A-Za-z0-9]+)*`;
const VALUE = "(?:\"[^\"]*\"|'[^']*'|[^\\s,\"']+)";
const VARIABLE = "${...} 形态的占位符，交给调用方注入";

type DisplayExpander = (value: string) => string;
void VARIABLE;

function quoteFragment(fragment: string): string {
  return BARE_SAFE.test(fragment) ? fragment : JSON.stringify(fragment);
}

function renderCommandLine(parts: readonly string[], expand: DisplayExpander): string {
  const fragments = parts.map((part) => quoteFragment(expand(part)));
  return fragments.join(" ");
}

function sourceKindOf(hook: HookConfig): "plugin" | "internal" | "user" | "project" {
  if (hook.plugin) return "plugin";
  return hook.source?.kind ?? INTERNAL_LABEL;
}

/**
 * 生成执行描述。展示用的变量展开失败不影响执行：调用方包一层 try/catch 并回退原值，
 * 因此这里假定 `expandDisplayValue` 不会抛（抛了也由调用方兜底）。
 */
export function createHookExecutionDescriptor(
  hook: HookConfig,
  timeoutMs: number,
  expandDisplayValue: DisplayExpander = (value) => value,
): HookExecutionDescriptor {
  const sourceKind = sourceKindOf(hook);
  const isProcess = hook.type === "process";
  const display = isProcess
    ? renderCommandLine([hook.command, ...(hook.args ?? [])], expandDisplayValue)
    : expandDisplayValue(hook.command);
  const sourcePath = hook.plugin?.sourcePath ?? hook.source?.path;
  const background = hook.type === "command" && hook.async === true;

  const optional: (readonly [string, unknown])[] = [
    ["pluginId", hook.plugin?.id],
    ["pluginName", hook.plugin?.name],
    ["sourcePath", sourcePath],
    ["statusMessage", hook.statusMessage],
  ];

  const base: (readonly [string, unknown])[] = [
    ["clientVisible", sourceKind !== INTERNAL_LABEL],
    ["commandDisplay", sanitizeHookDisplayText(display)],
    ["executionMode", background ? "background" : "foreground"],
    ["executionType", hook.type],
    ["sourceKind", sourceKind],
    ["timeoutMs", timeoutMs],
  ];

  const entries = [...base, ...optional.filter(([, value]) => value !== undefined)];
  return Object.fromEntries(entries) as unknown as HookExecutionDescriptor;
}

type RedactionRule = readonly [source: string, replacement: string, flags: string];

/** 规则顺序：越具体的凭据形态越先处理，避免泛化规则先吃掉上下文。 */
const REDACTION_RULES: readonly RedactionRule[] = [
  ["([a-z][a-z0-9+.-]*:\\/\\/)[^\\s/:@]+:[^\\s/@]+@", `$1${REDACTION}:${REDACTION}@`, "giu"],
  [
    "(authorization\\s*:\\s*(?:basic|bearer)\\s+)(?:\"[^\"]*\"|'[^']*'|[^\\s,;\"']+)",
    `$1${REDACTION}`,
    "giu",
  ],
  [`([?&](?:authorization|${SECRET_NAME})=)[^&\\s"']+`, `$1${REDACTION}`, "giu"],
  ["(\\bauthorization\\b\\s*=\\s*)(?:\"[^\"]*\"|'[^']*'|[^\\s,\"']+)", `$1${REDACTION}`, "giu"],
  [`((?:"${SECRET_NAME}"|'${SECRET_NAME}')\\s*[:=]\\s*)${VALUE}`, `$1${REDACTION}`, "giu"],
  [`(^|[^A-Za-z0-9_])(${SECRET_NAME}\\s*[:=]\\s*)${VALUE}`, `$1$2${REDACTION}`, "gimu"],
  [`((?:--)?${SECRET_NAME})(\\s+)${VALUE}`, `$1$2${REDACTION}`, "giu"],
];

const COMPILED = REDACTION_RULES.map(
  ([pattern, replacement, flags]) => [new RegExp(pattern, flags), replacement] as const,
);

/** 遮蔽凭据。命中即替换，其余文本逐字保留；空串直接返回。 */
export function sanitizeHookDisplayText(value: string): string {
  if (value.length === 0) return value;
  return COMPILED.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
}
