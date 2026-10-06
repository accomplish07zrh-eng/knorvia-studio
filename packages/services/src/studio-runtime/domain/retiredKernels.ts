import type { StudioConversation } from "../types.js";
import type { StudioGroupDefinition, StudioWorkflowDefinition } from "../workflowTypes.js";
import { assertKernelNotRetired } from "./kernelPolicy.js";

/**
 * 发送前确认目标引用的内核都仍在目录中（specs/knorvia-cli-catalog-20261006.md）。
 * 修复依据：已移除内核没有适配器，若先入队再派发会被记成"中断/结果未知"且没有改选提示。
 */
export function assertTargetKernelsActive(
  kind: "chat" | "group" | "workflow",
  definition: StudioConversation | StudioGroupDefinition | StudioWorkflowDefinition,
): void {
  if (kind === "chat") assertKernelNotRetired((definition as StudioConversation).kernel);
  else if (kind === "group") {
    const group = definition as StudioGroupDefinition;
    [group.host, ...group.members].forEach(assertKernelNotRetired);
  } else
    for (const node of (definition as StudioWorkflowDefinition).nodes)
      if (node.data.kind === "agent") assertKernelNotRetired(node.data.kernel);
}
