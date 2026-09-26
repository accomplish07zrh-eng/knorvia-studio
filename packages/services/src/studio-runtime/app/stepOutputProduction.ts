import { redactDiagnosticText } from "@knorvia/shared";
import { buildStudioStepOutputs } from "../domain/outputBuild.js";
import type { StudioOutputRef } from "../domain/outputRef.js";
import type { StudioStepResult } from "../workflowTypes.js";
import type { StudioAgentStep, StudioWorkspacePort } from "./ports.js";

/**
 * 命名输出的生产（见 `specs/knorvia-output-contract.md`「命名输出的生产规则」）。
 *
 * 从 `turnExecutor.ts` 拆出来只为让它留在架构策略的行数上限内；所有者与失败语义不变：
 * 生产者是拥有该步骤的 turn，构造失败就把步骤判为失败并给出可读错误，
 * **不写半成品引用**，下游因此不会拿到缺失或重复的引用。
 *
 * - `text` 来源：节点文本本身就是该输出；
 * - `json` 来源：节点文本是按名建键的 JSON 对象，该名字取对应字段；
 * - `file` 来源：该字段是可移植相对路径，由 Host（`referenceVersion`）核对真实文件与哈希后
 *   产出 `workspace-file` 引用；缺文件、读不到或宿主不支持都失败关闭，不退化成普通字符串。
 */
export async function produceStudioStepOutputs(params: {
  step: StudioAgentStep;
  outcome: StudioStepResult;
  workspaces: StudioWorkspacePort;
  workspaceRunId: string;
  workspaceStepId: string;
}): Promise<void> {
  const { outcome, step } = params;
  const declared = step.outputNames ?? [];
  if (!declared.length || outcome.status !== "succeeded" || !outcome.resultKnown) return;

  const built = buildStudioStepOutputs({
    names: declared,
    ...(step.outputSources ? { sources: step.outputSources } : {}),
    text: outcome.text,
  });
  if (!built.ok) {
    outcome.status = "failed";
    outcome.error = redactDiagnosticText(built.error);
    // 这是**后处理失败**：工具副作用可能已经执行，重跑整个节点会把它们再做一遍。
    // 因此显式标记不可自动重试——要修的是输出表达，不是重放工具。
    outcome.retryable = false;
    return;
  }
  if (!built.outputs.length) return;

  const refs: StudioOutputRef[] = [];
  let failure: string | undefined;
  for (const entry of built.outputs) {
    if (entry.kind === "ref") {
      refs.push(entry.ref);
      continue;
    }
    if (!params.workspaces.referenceVersion) {
      failure = "宿主不支持核对工作区文件，无法产出文件输出。";
      break;
    }
    const version = await params.workspaces.referenceVersion(
      params.workspaceRunId,
      params.workspaceStepId,
      entry.relativePath,
    );
    if (!version.hash) {
      failure = `Workflow output ${entry.name} points at a file that does not exist: ${entry.relativePath}.`;
      break;
    }
    refs.push({
      kind: "workspace-file",
      name: entry.name,
      runId: params.workspaceRunId,
      stepId: params.workspaceStepId,
      relativePath: entry.relativePath,
      sha256: version.hash,
    });
  }
  if (failure) {
    outcome.status = "failed";
    outcome.error = redactDiagnosticText(failure);
    // 同上：文件核对失败属于后处理失败，不自动重跑已经执行过的工具。
    outcome.retryable = false;
    return;
  }
  outcome.outputs = refs;
}
