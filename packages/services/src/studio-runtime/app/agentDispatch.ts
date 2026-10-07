import { redactDiagnosticText } from "@knorvia/shared";
import type { z } from "zod";
import type { StudioAgentTask } from "../agentToolTypes.js";
import type { StudioKernelConfig, StudioKernelId } from "../kernelTypes.js";
import { validActiveKernel } from "../domain/validation.js";
import { stricterStudioPermission } from "../domain/workflowGraph.js";
import { studioAgentToolSchemas } from "../domain/agentToolPolicy.js";
import { applyStudioCommand } from "./commandAdmission.js";
import { admitStudioCommandReceipt } from "./commandReceipts.js";
import { agentCallerKey } from "./agentOutbox.js";
import { inspectStudioKernels } from "./kernelOperations.js";
import { studioKernelConfigs } from "./runtimeProjections.js";
import type { StoredRun } from "./storePort.js";
import {
  assertStudioAgentCaller,
  ownedStudioAgentTask,
  studioAgentChain,
  type StudioAgentCaller,
  type StudioAgentToolDependencies,
} from "./agentToolContext.js";

type Dispatch = z.infer<typeof studioAgentToolSchemas.dispatch_task>;
type Message = z.infer<typeof studioAgentToolSchemas.message_task>;

export async function studioAgentKernelCatalog(
  deps: StudioAgentToolDependencies,
  caller: StudioAgentCaller,
) {
  assertStudioAgentCaller(deps, caller);
  // 修复：生产探测不持久化本机 kernel-status；复用现有探测 owner，并阻断 await 期间配置变更。
  const signature = JSON.stringify(studioKernelConfigs(deps.db));
  const statuses = await inspectStudioKernels(deps);
  const recheck = () => {
    assertStudioAgentCaller(deps, caller);
    if (JSON.stringify(studioKernelConfigs(deps.db)) !== signature)
      throw new Error("内核配置已变更，请重新检查后重试");
  };
  recheck();
  const entries = [];
  for (const status of statuses) {
    const config = deps.db.read<StudioKernelConfig>("config", status.id);
    if (!config || !status.installed || status.error || status.id.startsWith("ssh:")) continue;
    const options = await deps.kernels.options?.({
      kernel: status.id,
      workspacePath: caller.turn.workspacePath,
      config,
    });
    recheck();
    entries.push({
      kernel: status.id,
      capabilities: status.capabilities,
      permission: config.permission,
      models: options?.models ?? [],
      optionsError: options?.error ? "此内核的模型目录暂不可用" : undefined,
    });
  }
  return entries;
}

function assertCurrentAgentConfig(
  deps: StudioAgentToolDependencies,
  caller: StudioAgentCaller,
  kernel: StudioKernelId,
  config: StudioKernelConfig,
) {
  assertStudioAgentCaller(deps, caller);
  if (JSON.stringify(deps.db.read("config", kernel)) !== JSON.stringify(config))
    throw new Error("内核配置已变更，请重新检查后重试");
}

export async function dispatchStudioAgent(
  deps: StudioAgentToolDependencies,
  caller: StudioAgentCaller,
  input: Dispatch,
  complete: (result: unknown) => unknown,
) {
  const parent = assertStudioAgentCaller(deps, caller);
  validActiveKernel(input.kernel);
  const kernel: StudioKernelId = input.kernel;
  const config = deps.db.read<StudioKernelConfig>("config", kernel);
  if (!config) throw new Error("请选择已配置、已安装的本机 Studio 内核");
  const selected = (await studioAgentKernelCatalog(deps, caller)).find(
    (entry) => entry.kernel === kernel,
  );
  assertCurrentAgentConfig(deps, caller, kernel, config);
  if (!selected) throw new Error("请选择已配置、已安装的本机 Studio 内核");
  const permission = stricterStudioPermission(
    caller.turn.permission,
    stricterStudioPermission(config.permission, input.permission ?? config.permission),
  );
  if (permission === "read-only" && !selected.capabilities.readOnly)
    throw new Error("此内核不能强制执行只读审查");
  if (permission === "ask" && !selected.capabilities.approval)
    throw new Error("此内核不能执行人工审批权限");
  if (permission === "full-access" && !selected.capabilities.fullAccess)
    throw new Error("此内核不能执行完整访问权限");
  const model = input.model ?? config.model;
  const reasoningEffort = input.reasoningEffort ?? config.reasoningEffort;
  const option = selected.models.find((entry) => entry.id === model);
  if (model && (!option || selected.optionsError))
    throw new Error("所选模型未在此内核的模型目录中核验");
  if (reasoningEffort && !option?.reasoning.some((entry) => entry.id === reasoningEffort))
    throw new Error("此模型不支持所选思考档位");
  const chain = studioAgentChain(deps, parent);
  assertLimits(deps, chain.rootRunId, chain.depth + 1);
  if (caller.turn.permission === "ask") {
    const answer = await caller.sink.ask(
      {
        id: `agent-dispatch:${input.commandId}`,
        kind: "approval",
        title: "允许 Agent 派发 Studio 子任务？",
        detail: `${kernel}\n${redactDiagnosticText(input.task)}`,
        choices: ["allow-once", "deny"],
      },
      caller.signal,
    );
    if (answer.decision !== "allow-once") throw new Error("用户未批准此次派发");
  }
  // 修复：人工审批或隔离准备期间配置收紧，不能按旧配置继续创建子任务。
  assertCurrentAgentConfig(deps, caller, kernel, config);
  const taskId = deps.clock.id();
  const targetId = deps.clock.id();
  const workspacePath = await deps.workspaces.prepare({
    runId: `agent-${taskId}`,
    stepId: "reply",
    sourcePath: caller.turn.workspacePath,
    mode: "isolated",
  });
  assertCurrentAgentConfig(deps, caller, kernel, config);
  return deps.db.transaction(() => {
    assertCurrentAgentConfig(deps, caller, kernel, config);
    assertLimits(deps, chain.rootRunId, chain.depth + 1);
    admitStudioCommandReceipt(
      deps.db,
      deps.clock,
      {
        commandId: `ac:${taskId}`,
        type: "create-conversation",
        id: targetId,
        kernel,
        workspacePath,
      },
      applyStudioCommand,
    );
    const sent = admitStudioCommandReceipt(
      deps.db,
      deps.clock,
      {
        commandId: `as:${taskId}`,
        type: "send",
        kind: "chat",
        targetId,
        text: taskBrief(input),
        kernelConfig: { ...config, permission, model, reasoningEffort },
      },
      applyStudioCommand,
    );
    const task: StudioAgentTask = {
      id: taskId,
      parentRunId: parent.id,
      parentCallerId: caller.turn.conversationId,
      parentAttempt: parent.attempt,
      rootRunId: chain.rootRunId,
      depth: chain.depth + 1,
      targetId,
      runId: sent.id,
      kernel,
      permission,
      model,
      reasoningEffort,
      rounds: 1,
      createdAt: deps.clock.now(),
      workspace: {
        runId: `agent-${taskId}`,
        stepId: "reply",
        path: workspacePath,
        sourcePath: caller.turn.workspacePath,
      },
    };
    deps.db.write("agent-task", task.id, task, agentCallerKey(task.parentCallerId));
    deps.db.write(
      "agent-run-link",
      sent.id,
      { taskId, deadlineAt: deps.clock.now() + deps.policy.timeoutMs },
      task.id,
    );
    return complete({ taskId, runId: sent.id, state: "accepted" });
  });
}

export async function messageStudioAgent(
  deps: StudioAgentToolDependencies,
  caller: StudioAgentCaller,
  input: Message,
  complete: (result: unknown) => unknown,
) {
  const task = ownedStudioAgentTask(deps, caller, input.taskId);
  if (task.rounds >= deps.policy.maxRounds) throw new Error("Studio Agent 消息轮次已达到上限");
  const config = deps.db.read<StudioKernelConfig>("config", task.kernel);
  if (!config) throw new Error("子任务的内核配置已移除");
  const selected = (await studioAgentKernelCatalog(deps, caller)).find(
    (entry) => entry.kernel === task.kernel,
  );
  assertCurrentAgentConfig(deps, caller, task.kernel, config);
  if (!selected) throw new Error("子任务的内核已不可用");
  const permission = stricterStudioPermission(
    task.permission,
    stricterStudioPermission(config.permission, caller.turn.permission),
  );
  if (
    (permission === "read-only" && !selected.capabilities.readOnly) ||
    (permission === "ask" && !selected.capabilities.approval) ||
    (permission === "full-access" && !selected.capabilities.fullAccess)
  )
    throw new Error("子任务的权限能力已不可用");
  const model = selected.models.find((entry) => entry.id === task.model);
  if (task.model && (!model || selected.optionsError)) throw new Error("子任务的模型已不可用");
  if (task.reasoningEffort && !model?.reasoning.some((entry) => entry.id === task.reasoningEffort))
    throw new Error("子任务的思考档位已不可用");
  return deps.db.transaction(() => {
    ownedStudioAgentTask(deps, caller, task.id);
    assertCurrentAgentConfig(deps, caller, task.kernel, config);
    assertLimits(deps, task.rootRunId, task.depth, false);
    const id = deps.clock.id();
    const sent = admitStudioCommandReceipt(
      deps.db,
      deps.clock,
      {
        commandId: `am:${id}`,
        type: "send",
        kind: "chat",
        targetId: task.targetId,
        text: taskBrief(input),
        kernelConfig: {
          ...config,
          permission,
          model: task.model,
          reasoningEffort: task.reasoningEffort,
        },
      },
      applyStudioCommand,
    );
    task.runId = sent.id;
    task.rounds += 1;
    deps.db.write("agent-task", task.id, task, agentCallerKey(task.parentCallerId));
    deps.db.write(
      "agent-run-link",
      sent.id,
      { taskId: task.id, deadlineAt: deps.clock.now() + deps.policy.timeoutMs },
      task.id,
    );
    return complete({ taskId: task.id, runId: sent.id, state: "accepted" });
  });
}

function taskBrief(input: { task: string; context: string }) {
  return redactDiagnosticText(`Task:\n${input.task}\n\nContext:\n${input.context}`);
}
function assertLimits(
  deps: StudioAgentToolDependencies,
  rootRunId: string,
  depth: number,
  creating = true,
): void {
  const tasks = deps.db
    .list<StudioAgentTask>("agent-task", { all: true })
    .filter((task) => task.rootRunId === rootRunId);
  if (depth > deps.policy.maxDepth || (creating && tasks.length >= deps.policy.maxTasks))
    throw new Error("Studio Agent 创建数量或深度已达到上限");
  const active = deps.db
    .list<StoredRun>("run", { all: true })
    .filter(
      (run) =>
        ["queued", "running", "waiting"].includes(run.state) &&
        tasks.some((task) => task.targetId === run.targetId),
    );
  if (creating && new Set(active.map((run) => run.targetId)).size >= deps.policy.maxActive)
    throw new Error("Studio Agent 并发派发已达到上限");
}
