// SPDX-License-Identifier: Apache-2.0
// 运行时上下文的查询入口：解析目标运行快照、按相位名取定义、统一时间戳。
import type { ExpertWorkflowRunSnapshot, WorkflowPhaseDefinition } from "@knorvia/contracts";
import type { ExpertWorkflowLookupOptions, ExpertWorkflowRuntimeDeps } from "./types.js";

/** 查询所需的最小上下文：定义标识、相位表与存储端口。 */
export interface LookupContext {
  definition: { kind: string; title: string };
  phaseDefinitions: Map<string, WorkflowPhaseDefinition>;
  store: ExpertWorkflowRuntimeDeps["store"];
}

/** 解析目标快照：给了 runId 就按 id 读，否则读该工作区最新一次运行。 */
export async function resolveSnapshot(
  runtime: LookupContext,
  input: ExpertWorkflowLookupOptions,
): Promise<ExpertWorkflowRunSnapshot | null> {
  const cancel = input.abortSignal;
  if (input.runId !== undefined) {
    return await runtime.store.readRun(input.runId, { signal: cancel });
  }
  const scope = { cwd: input.cwd, kind: runtime.definition.kind };
  return await runtime.store.readLatestRun(scope, { signal: cancel });
}

/** 取相位定义：缺失时抛错，错误文案保留定义标题与相位名。 */
export function getPhaseDefinition(
  runtime: LookupContext,
  phaseName: string,
): WorkflowPhaseDefinition {
  const found = runtime.phaseDefinitions.get(phaseName);
  if (found !== undefined) return found;
  throw new Error(`${runtime.definition.title} definition is missing phase: ${phaseName}`);
}

/** 统一时间戳：由注入时钟生成 ISO 字符串。 */
export const timestampOf = (now: () => Date): string => now().toISOString();
