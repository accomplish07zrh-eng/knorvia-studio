import { parseArgs } from "node:util";
import { extractToolRuleArguments } from "./argument-tool-rules.js";

export const parseGlobalArgs = (argv: string[]) =>
  parseArgs({
    allowPositionals: true,
    args: argv,
    options: {
      help: {
        short: "h",
        type: "boolean",
      },
      json: {
        type: "boolean",
      },
      "output-format": {
        type: "string",
      },
      "no-color": {
        type: "boolean",
      },
      "browser-use": {
        type: "string",
      },
      "browser-executable": {
        type: "string",
      },
      prompt: {
        short: "p",
        type: "string",
      },
      "memory-bench": {
        type: "boolean",
      },
      attach: {
        multiple: true,
        type: "string",
      },
      cwd: {
        type: "string",
      },
      locale: {
        type: "string",
      },
      resume: {
        type: "string",
      },
      target: {
        type: "string",
      },
      "target-replace": {
        type: "boolean",
      },
      continue: {
        short: "c",
        type: "boolean",
      },
      force: {
        short: "f",
        type: "boolean",
      },
      "force-mcs": {
        type: "boolean",
      },
      mode: {
        type: "string",
      },
      verbose: {
        type: "boolean",
      },
      version: {
        short: "v",
        type: "boolean",
      },
      "prepare-storage": { type: "boolean" },
      stdio: {
        type: "boolean",
      },
      surface: {
        type: "string",
      },

      // 在全局注册，run.ts 收集后透传给 plugins-command，不污染其他命令的选项语义。
      all: {
        short: "a",
        type: "boolean",
      },
      available: {
        type: "boolean",
      },
      "keep-data": {
        type: "boolean",
      },
      scope: {
        short: "s",
        type: "string",
      },
      sparse: {
        multiple: true,
        type: "string",
      },
    },
    strict: true,
  });

const PROTOCOL_COMMANDS = new Set(["app-server", "agent-server"]);
const STORAGE_PREPARATION_FLAG = "--prepare-storage";
const STORAGE_PREPARATION_OPTIONS = new Set(["prepare-storage", "stdio", "cwd"]);

/** 先完整解析再判首 positional，防止把 prompt/cwd 的参数值当作协议命令。 */
export function isProtocolServerInvocation(argv: string[]): boolean {
  try {
    const { values, positionals } = parseGlobalArgs(argv);
    if (values.prompt !== undefined || values.target !== undefined || values.help || values.version) {
      return false;
    }
    return PROTOCOL_COMMANDS.has(positionals[0] ?? "");
  } catch {
    // 无效参数仍由 run 报错；raw 首项确定协议入口时继续保护 stdout。
    return PROTOCOL_COMMANDS.has(argv[0] ?? "");
  }
}

/** 仅内部标准存储调用走窄入口；其它选项仍由原命令路由负责校验与优先级。 */
export function isStoragePreparationInvocation(argv: string[]): boolean {
  if (!argv.includes(STORAGE_PREPARATION_FLAG)) return false;
  try {
    const { values, positionals } = parseGlobalArgs(argv);
    if (values["prepare-storage"] !== true || values.stdio !== true) return false;
    if (positionals.length !== 1 || !PROTOCOL_COMMANDS.has(positionals[0] ?? "")) return false;
    for (const name of Object.keys(values)) {
      if (!STORAGE_PREPARATION_OPTIONS.has(name)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export const extractDisallowedToolsArgs = (
  argv: readonly string[],
): { args: string[]; toolDisallowlist?: readonly string[] } => extractToolRuleArguments(argv);
