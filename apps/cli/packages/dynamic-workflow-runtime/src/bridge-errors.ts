// SPDX-License-Identifier: Apache-2.0
// 子进程 → 引擎的错误搬运：引擎抛出的 WorkflowError 要变成沙箱脚本认得的线形态。
// 单独成文件，是因为它同时服务「响应拒绝」与「脚本抛错」两条路径，形状又必须与
// protocol.ts 的 WireError 一致。
import { WorkflowError } from "@knorvia/dynamic-workflow";
import type { WireError } from "./protocol.js";

/** 任意抛出值 → WorkflowError（保留原始 cause）。 */
export function asWorkflowError(cause: unknown): WorkflowError {
  if (cause instanceof WorkflowError) return cause;
  return new WorkflowError("DriverError", cause instanceof Error ? cause.message : String(cause), {
    cause,
  });
}

/**
 * WorkflowError → 线形态。name 与 message 总有；code、violations、finalText 是「引擎给了才有」
 * 的结构化补充，缺席时整个键都不出现（脚本用 `"code" in error` 判断）。
 */
export function toWireError(error: WorkflowError | undefined): WireError {
  if (error === undefined) return { name: "Error", message: "unknown error" };
  const wire = new Map<string, unknown>([
    ["name", error.name],
    ["message", error.message],
  ]);
  if (error.code !== undefined) wire.set("code", error.code);
  if (error.violations !== undefined) wire.set("violations", error.violations);
  if (error.finalText !== undefined) wire.set("finalText", error.finalText);
  // Map 的顺序给的是「name、message 在前，可选槽位按出现顺序」，与逐字段赋值的产物一致。
  return Object.fromEntries(wire) as unknown as WireError;
}

/** 句柄未登记：错误码与文案是兼容面（脚本可能按它分支）。 */
export function unknownActor(actor: string | undefined): WorkflowError {
  return new WorkflowError("UnknownActor", `Unknown subagent handle: ${actor}`);
}

/** 缺 artifactOp：错误码与文案是兼容面。 */
export function missingArtifactOp(siteId: string): WorkflowError {
  return new WorkflowError(
    "DriverError",
    `publish-artifact request is missing artifactOp (site ${siteId})`,
  );
}
