import { resolve } from "node:path";
import { validateStudioWorkflow, type IStudioRuntimeService } from "@knorvia/services";
import type { KnorviaAutomation } from "@knorvia/shared";

const projectKey = (path: string) => {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};

/** The stored automation, not a scheduler message, chooses the Studio destination. */
export async function submitScheduledStudioWorkflow(params: {
  service: Pick<IStudioRuntimeService, "overview" | "command">;
  automation: KnorviaAutomation;
  runId: string;
  workspacePath: string;
  prompt: string;
}): Promise<string> {
  const { service, automation, runId, workspacePath, prompt } = params;
  if (!automation.studioWorkflowId) throw new Error("计划任务没有 Studio 工作流目标");
  if (automation.targetTaskId || automation.modelSelection || automation.mode)
    throw new Error("Studio 工作流计划与聊天会话配置冲突");
  if (projectKey(automation.workspacePath) !== projectKey(workspacePath))
    throw new Error("计划任务的目标项目已改变");
  const workflow = (await service.overview()).workflows.find(
    (item) => item.id === automation.studioWorkflowId,
  );
  if (!workflow) throw new Error("计划运行的 Studio 工作流已不存在");
  if (!workflow.workspacePath || projectKey(workflow.workspacePath) !== projectKey(workspacePath))
    throw new Error("Studio 工作流的项目与计划任务不一致");
  const issues = validateStudioWorkflow(workflow);
  if (issues.length) throw new Error(`Studio 工作流尚不能运行：${issues[0]}`);
  const result = await service.command({
    commandId: `automation:${runId}`,
    type: "send",
    kind: "workflow",
    targetId: workflow.id,
    text: prompt,
  });
  return result.id;
}
