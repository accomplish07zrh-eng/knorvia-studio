// SPDX-License-Identifier: Apache-2.0
// 命令 span 遥测：命令执行的性能/状态 span 的开启、收尾与分类。
// 结束态优先级：超时 > 取消 > spawn 失败 > 结构化执行失败 > 完成。
import type {
  BashInput,
  CommandCategory,
  CommandExecutionSpanWriter,
  CommandShellKind,
  ExecutionResult,
} from "@knorvia/contracts";
import type { ToolExecutionContext } from "../../types.js";
import { classifyCommand, classifySafeCommandIdentity } from "../tool-perf.js";

// span 分类标签的映射：classifyCommand 的产物折算成遥测侧的命令类别。
const SPAN_CATEGORY_BY_LABEL: Readonly<Record<string, CommandCategory>> = {
  git: "git",
  package: "package_manager",
  build: "build",
  test: "test",
  network: "network",
};

export function openCommandSpan(
  spec: BashInput,
  ctx: ToolExecutionContext,
): CommandExecutionSpanWriter | undefined {
  const handle = classifySafeCommandIdentity(spec.command);
  return ctx.telemetry?.startCommand({
    category: SPAN_CATEGORY_BY_LABEL[classifyCommand(spec.command)] ?? "shell",
    commandCount: handle.count ?? 0,
    safeName: handle.name ?? "other",
    sandboxed: spec.dangerouslyDisableSandbox !== true,
    shellKind: shellKindOf(ctx.bashShellSelection),
  });
}

export function closeCommandSpan(span: CommandExecutionSpanWriter, outcome: ExecutionResult): void {
  publishExitFacts(span, outcome);

  if (outcome.timedOut) {
    span.markTerminationRequested("timeout");
    span.finishFailed("timeout", "timeout", outcome.error);
    return;
  }
  if (outcome.cancelled) {
    span.markTerminationRequested("cancelled");
    span.finishCancelled("abort_signal");
    return;
  }
  if (outcome.status === "spawn_error") {
    span.finishFailed("spawn", "configuration", outcome.error);
    return;
  }
  const structuredFailure = outcome.status === "failed" && outcome.error !== undefined;
  if (structuredFailure) {
    // 非零退出码是命令事实（grep 未匹配之类），只有结构化 failure 才计入失败率。
    span.finishFailed("execute", "internal", outcome.error);
    return;
  }
  span.finishCompleted();
}

function publishExitFacts(span: CommandExecutionSpanWriter, outcome: ExecutionResult): void {
  const exitCode = outcome.exitCode;
  if (exitCode !== undefined) span.setExitCode(exitCode);
  const terminationSignal = outcome.signal;
  if (terminationSignal) span.setSignal(terminationSignal);
  span.setOutputBytes(outcome.stdout.bytes + outcome.stderr.bytes);
  span.setTimedOut(outcome.timedOut);
}

function shellKindOf(
  selection: ToolExecutionContext["bashShellSelection"],
): CommandShellKind | undefined {
  const productLabel = selection?.display.name.toLowerCase() ?? "";
  if (productLabel.includes("powershell")) return "powershell";
  if (productLabel.includes("zsh")) return "zsh";
  if (productLabel.includes("bash")) return "bash";
  const dialect = selection?.dialect;
  if (dialect === "cmd") return "cmd";
  if (dialect === "posix") return "sh";
  return selection ? "other" : undefined;
}
