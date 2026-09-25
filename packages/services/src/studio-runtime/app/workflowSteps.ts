import type { StudioExecutionPort } from "./ports.js";
import type { StudioStepResult, StudioWorkflowNode } from "../workflowTypes.js";
import { evaluateStudioCondition } from "../domain/condition.js";
import {
  decodeStepOutputs,
  StudioOutputRefError,
  StudioUnsupportedCheckpointVersionError,
  type StudioStepOutputsVerdict as StepOutputsVerdict,
} from "../domain/outputRef.js";
import { StudioInteractionCancelledError } from "./runtimeInteractions.js";

export interface WorkflowOutcome extends StudioStepResult {
  branch?: "yes" | "no";
}
const CONTEXT_LIMIT = 64_000;
/** 汇合只生成有界上下文；完整成员输出仍由 owner 的消息与 step 记录保存。 */
export function workflowContext(parts: string[]): string {
  let remaining = CONTEXT_LIMIT;
  const bounded: string[] = [];
  for (const part of parts) {
    if (part.length <= remaining) {
      bounded.push(part);
      remaining -= part.length;
      continue;
    }
    bounded.push(
      part.slice(0, remaining),
      "[Additional upstream output omitted; inspect the original step output.]",
    );
    break;
  }
  return bounded.join("\n\n");
}
export const workflowValueKey = (id: string) => JSON.stringify(["workflow-node", id]);
export function workflowStopped(signal: AbortSignal): WorkflowOutcome {
  return {
    status: "cancelled",
    text: "",
    resultKnown: true,
    error: signal.reason instanceof Error ? signal.reason.message : "Workflow cancelled.",
  };
}
export function workflowFailed(error: unknown): WorkflowOutcome {
  return {
    status: "failed",
    text: "",
    resultKnown: true,
    error: error instanceof Error ? error.message : String(error),
  };
}
export function workflowUnknown(error: unknown): WorkflowOutcome {
  return {
    status: "interrupted",
    text: "",
    resultKnown: false,
    error: error instanceof Error ? error.message : String(error),
  };
}
/**
 * 读取上一次 attempt 的节点结果。
 *
 * 失败模式刻意分为两类，便于上层区分"记录坏了"与"记录比本进程新"：
 * - `Invalid workflow checkpoint for <id>`：字段或输出契约非法；
 * - `Unsupported workflow checkpoint version for <id>`：契约版本高于本进程。
 *
 * 两类都只影响读取，**都不会改写磁盘上的原始记录**；高版本记录按原字节保留，
 * 只有显式的新 attempt 才会写入新结构。
 */
export function workflowCached(port: StudioExecutionPort, id: string): WorkflowOutcome | undefined {
  const raw = port.checkpoint.values[workflowValueKey(id)];
  if (raw === undefined) return undefined;
  let result: unknown;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid workflow checkpoint for ${id}.`);
  }
  if (
    !result ||
    typeof result !== "object" ||
    !("status" in result) ||
    !["succeeded", "skipped", "failed", "cancelled", "interrupted"].includes(
      String(result.status),
    ) ||
    !("text" in result) ||
    typeof result.text !== "string" ||
    !("resultKnown" in result) ||
    typeof result.resultKnown !== "boolean" ||
    (["succeeded", "skipped"].includes(String(result.status)) && result.resultKnown !== true) ||
    ("error" in result && typeof result.error !== "string") ||
    ("branch" in result && !["yes", "no"].includes(String(result.branch)))
  )
    throw new Error(`Invalid workflow checkpoint for ${id}.`);
  // 输出契约先判定再抛错：版本高于本进程是单独的可测错误，其余非法字段沿用既有报告。
  let outputs: StepOutputsVerdict;
  try {
    outputs = decodeStepOutputs(result);
  } catch (error) {
    if (error instanceof StudioOutputRefError)
      throw new Error(`Invalid workflow checkpoint for ${id}.`);
    throw error;
  }
  if (outputs.kind === "unsupported")
    throw new StudioUnsupportedCheckpointVersionError(
      outputs.version,
      `Unsupported workflow checkpoint version for ${id}.`,
    );
  // 终态留作历史展示；失败、中断与取消不能成为下一次显式 attempt 的已完成缓存。
  if (!["succeeded", "skipped"].includes(String(result.status))) return undefined;
  return result as WorkflowOutcome;
}
export function workflowText(
  prompt: string,
  input: string,
  output: string,
  outcomes: ReadonlyMap<string, WorkflowOutcome>,
): string {
  let expandedLength = prompt.length;
  return prompt.replace(/\{\{([^{}]+)\}\}/g, (whole: string, raw: string) => {
    const name = raw.trim();
    const result = outcomes.get(name);
    if (name !== "input" && name !== "output" && (!result || result.status !== "succeeded"))
      throw new Error(`Prompt references unavailable node: ${name}.`);
    const value = name === "input" ? input : name === "output" ? output : result!.text;
    expandedLength += value.length - whole.length;
    if (expandedLength > 256_000)
      throw new Error("Expanded workflow prompt exceeds the context limit.");
    return value;
  });
}
async function agentNode(
  node: StudioWorkflowNode,
  prompt: string,
  port: StudioExecutionPort,
  signal: AbortSignal,
): Promise<WorkflowOutcome> {
  for (let attempt = 0; attempt <= node.data.retryCount; attempt++) {
    if (signal.aborted) return workflowStopped(signal);
    let result: StudioStepResult;
    try {
      result = await port.agent({
        id: `workflow:${node.id}:attempt:${attempt}`,
        kernel: node.data.kernel,
        memberId: `workflow:${node.id}`,
        prompt,
        signal,
      });
    } catch (error) {
      // 调用已派发后异常退出不能证明副作用是否完成；即使同时收到取消也必须保留未知结果。
      return workflowUnknown(error);
    }
    if (!result.resultKnown || result.status === "interrupted")
      return { ...result, status: "interrupted", resultKnown: false };
    if (signal.aborted) return workflowStopped(signal);
    if (
      result.status !== "failed" ||
      attempt === node.data.retryCount ||
      ("retryable" in result && result.retryable === false)
    )
      return result;
    // 重试截止时刻先持久化；重启不能把同一次退避重新延长，也不能重置尝试次数。
    const key = JSON.stringify(["workflow-retry", node.id, attempt]);
    const saved = port.checkpoint.values[key];
    const deadline = saved === undefined ? port.now() + node.data.retryDelay * 1000 : Number(saved);
    if (!Number.isFinite(deadline)) return workflowFailed("Invalid persisted retry deadline.");
    if (saved === undefined) await port.saveCheckpoint({ values: { [key]: String(deadline) } });
    await port.progress(
      `${node.data.label || node.id}: retry ${attempt + 1}/${node.data.retryCount}`,
    );
    try {
      await port.delay(Math.max(0, deadline - port.now()), signal);
    } catch (error) {
      return signal.aborted ? workflowStopped(signal) : workflowFailed(error);
    }
  }
  return workflowFailed("Workflow retry budget exhausted.");
}

export async function executeWorkflowNode(
  node: StudioWorkflowNode,
  input: string,
  output: string,
  outcomes: ReadonlyMap<string, WorkflowOutcome>,
  port: StudioExecutionPort,
  signal: AbortSignal,
): Promise<WorkflowOutcome> {
  if (signal.aborted) return workflowStopped(signal);
  const cached = workflowCached(port, node.id);
  if (cached) return cached;
  const ok = (text: string): WorkflowOutcome => ({ status: "succeeded", text, resultKnown: true });
  switch (node.data.kind) {
    case "start":
      return ok(input);
    case "parallel":
    case "join":
    case "end":
      return ok(output);
    case "condition": {
      const nodes = Object.fromEntries(
        [...outcomes]
          .filter(([, value]) => value.status === "succeeded")
          .map(([id, value]) => [id, value.text]),
      );
      return {
        ...ok(output),
        branch: evaluateStudioCondition(node.data.condition, { input, output, nodes })
          ? "yes"
          : "no",
      };
    }
    case "approval": {
      const title = workflowText(node.data.prompt, input, output, outcomes);
      let allowed: boolean;
      try {
        allowed = await port.confirm(`workflow:${node.id}:approval`, title, signal);
      } catch (error) {
        if (error instanceof StudioInteractionCancelledError)
          return { ...workflowStopped(signal), error: error.message };
        return signal.aborted ? workflowStopped(signal) : workflowUnknown(error);
      }
      if (signal.aborted) return workflowStopped(signal);
      return allowed ? ok(output) : workflowFailed("Human approval was denied.");
    }
    case "agent":
      return agentNode(
        node,
        `${workflowText(node.data.prompt, input, output, outcomes)}\n\nWorkflow input:\n${input}\n\nActive upstream results:\n${output}`,
        port,
        signal,
      );
    case "creation": {
      if (!port.createMedia || !node.data.creationModelId)
        return workflowFailed("创作服务或模型不可用");
      const prompt = workflowText(node.data.prompt, input, output, outcomes);
      try {
        return await port.createMedia({
          nodeId: node.id,
          modelId: node.data.creationModelId,
          prompt,
          ...(node.data.creationReferencePath?.trim()
            ? {
                referencePath: workflowText(
                  node.data.creationReferencePath,
                  input,
                  output,
                  outcomes,
                ),
              }
            : {}),
          signal,
        });
      } catch (error) {
        // 提交请求发出后异常，不能当作可安全重复的普通失败。
        return workflowUnknown(error);
      }
    }
  }
}
