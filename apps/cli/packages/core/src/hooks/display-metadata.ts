// SPDX-License-Identifier: Apache-2.0
// 展示层元数据：把 HookConfig 变成客户端可见的执行描述，并对所有要展示/记录的文本做秘密遮蔽。
import type { HookConfig, HookExecutionDescriptor } from "@knorvia/contracts";

const INTERNAL_SOURCE_KIND = "internal" as const;
const MASK = "••••";
const SAFE_COMMAND_PART = /^[A-Za-z0-9_./:@%+=,-]+$/u;
/** 只在凭据位置出现的关键词；用前缀/后缀允许 `my-api-key`、`token_backup` 这类命名。 */
const SECRET_WORD = "(?:access[_-]?token|api[_-]?key|credential|password|private[_-]?key|secret|token)";
const SECRET_NAME = `(?:[A-Za-z0-9]+[_-])*${SECRET_WORD}(?:[_-][A-Za-z0-9]+)*`;

const QUOTED_OR_BARE = "(?:\"[^\"]*\"|'[^']*'|[^\\s,\"']+)";

type DisplayExpander = (value: string) => string;

function joinCommandParts(command: string, args: readonly string[], expand: DisplayExpander): string {
  return [command, ...args]
    .map(expand)
    .map((part) => (SAFE_COMMAND_PART.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

/**
 * 生成执行描述。展示用途的变量展开失败不得成为新的执行失败来源：由调用方兜底
 * （`configured-runner` 在 descriptor 里捕获展开异常并回退原值）。
 */
export function createHookExecutionDescriptor(
  hook: HookConfig,
  timeoutMs: number,
  expandDisplayValue: DisplayExpander = (value) => value,
): HookExecutionDescriptor {
  const commandDisplay =
    hook.type === "process"
      ? joinCommandParts(hook.command, hook.args ?? [], expandDisplayValue)
      : expandDisplayValue(hook.command);

  const plugin = hook.plugin;
  const sourceKind = plugin ? "plugin" : (hook.source?.kind ?? INTERNAL_SOURCE_KIND);
  const sourcePath = plugin?.sourcePath ?? hook.source?.path;

  return {
    clientVisible: sourceKind !== INTERNAL_SOURCE_KIND,
    commandDisplay: sanitizeHookDisplayText(commandDisplay),
    executionMode: hook.type === "command" && hook.async === true ? "background" : "foreground",
    executionType: hook.type,
    ...(plugin?.id ? { pluginId: plugin.id } : {}),
    ...(plugin?.name ? { pluginName: plugin.name } : {}),
    sourceKind,
    ...(sourcePath ? { sourcePath } : {}),
    ...(hook.statusMessage ? { statusMessage: hook.statusMessage } : {}),
    timeoutMs,
  };
}

/**
 * 遮蔽展示文本里的凭据。规则按「越具体的形态越先处理」排序：URL 凭据 → authorization 头 →
 * 查询串/键值 → 命令行风格 `--key value`。只替换秘密本身，其余文本原样保留。
 */
export function sanitizeHookDisplayText(value: string): string {
  if (!value) return value;

  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/giu, `$1${MASK}:${MASK}@`)
    .replace(
      /(authorization\s*:\s*(?:basic|bearer)\s+)(?:"[^"]*"|'[^']*'|[^\s,;"']+)/giu,
      `$1${MASK}`,
    )
    .replace(new RegExp(`([?&](?:authorization|${SECRET_NAME})=)[^&\\s"']+`, "giu"), `$1${MASK}`)
    .replace(/(\bauthorization\b\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s,"']+)/giu, `$1${MASK}`)
    .replace(
      new RegExp(`((?:"${SECRET_NAME}"|'${SECRET_NAME}')\\s*[:=]\\s*)${QUOTED_OR_BARE}`, "giu"),
      `$1${MASK}`,
    )
    .replace(
      new RegExp(
        `(^|[^A-Za-z0-9_])(${SECRET_NAME}\\s*[:=]\\s*)${QUOTED_OR_BARE}`,
        "gimu",
      ),
      `$1$2${MASK}`,
    )
    .replace(
      new RegExp(`((?:--)?${SECRET_NAME})(\\s+)${QUOTED_OR_BARE}`, "giu"),
      `$1$2${MASK}`,
    );
}
