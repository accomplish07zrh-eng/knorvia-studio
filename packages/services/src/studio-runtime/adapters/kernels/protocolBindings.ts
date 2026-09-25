import type { StudioKernelTurn } from "../../kernelTypes.js";
import type { KernelDescriptor } from "./acpCatalog.js";
import type { KernelRun } from "./kernelRun.js";
import { codexArgs, codexMessage, startCodex } from "./codexProtocol.js";
import { claudeArgs, claudeMessage, startClaude } from "./claudeProtocol.js";
import { grokArgs, grokMessage, startGrok } from "./grokProtocol.js";
import { antigravityArgs, antigravityMessage, startAntigravity } from "./antigravityProtocol.js";
import { acpMessage, startAcp } from "./acpProtocol.js";

export interface KernelProtocolBinding {
  mode: "codex" | "claude" | "acp" | "antigravity";
  args: string[];
  message: (run: KernelRun, message: Record<string, unknown>) => void | Promise<void>;
  start: (run: KernelRun) => Promise<void>;
  environment?: NodeJS.ProcessEnv;
}

/** 按内核描述的协议选择启动参数、消息处理与启动序列；Grok 复用 ACP 的进程模式。 */
export function kernelProtocolBinding(
  info: KernelDescriptor,
  turn: StudioKernelTurn,
): KernelProtocolBinding {
  switch (info.protocol) {
    case "codex":
      return { mode: "codex", args: codexArgs(), message: codexMessage, start: startCodex };
    case "claude":
      return {
        mode: "claude",
        args: claudeArgs(turn),
        message: claudeMessage,
        start: startClaude,
        environment: { DISABLE_AUTOUPDATER: "1" },
      };
    case "grok":
      return { mode: "acp", args: grokArgs(turn), message: grokMessage, start: startGrok };
    case "antigravity":
      return {
        mode: "antigravity",
        args: antigravityArgs(turn),
        message: antigravityMessage,
        start: startAntigravity,
        environment: { AGY_CLI_DISABLE_AUTO_UPDATE: "true" },
      };
    case "acp":
      return { mode: "acp", args: info.args, message: acpMessage, start: startAcp };
  }
}
