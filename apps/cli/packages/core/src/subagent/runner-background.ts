// SPDX-License-Identifier: Apache-2.0
// 后台子代理的启动与生命周期。状态机（合同未覆盖项，此处按实现记录）：
//   1. 解析档案 → 建执行上下文 → 注册到 registry（注册即对外可见，先于任何 IO）。
//   2. 写一次 metadata.json 标 running；这一步失败要立刻撤回注册，避免留下没有产物的空任务。
//   3. 建取消控制器与就绪闸门；调用方给的 signal 若已 abort，立刻把原因透传给控制器。
//   4. 后台跑 backgroundWorker：registry 里任务已是终态则直接返回；否则跑子会话，
//      成功走 finishBackground，失败按「就绪前 / 就绪后」分流——就绪前交给 onSetupFailure
//      （调用方把 start 当失败返回），就绪后走 failBackground（任务已可见，只能标失败）。
//   5. onReady 回调里发 SubagentSpawned 事件并放开闸门；start 等闸门，被拒就 abort + 撤回注册。
//   6. 收尾：无论成败都调 onSettled（释放 dispose），成功则返回 backgroundOutput。
import {
  SessionEventType,
  traceContextToLogContext,
  type SubagentPort,
  type SubagentRunOptions,
} from "@knorvia/contracts";
import { isTerminalRuntimeTask } from "../runtime-task/registry.js";
import { runChild } from "./runner-child.js";
import { controllerFor, readinessGate } from "./runner-cancellation.js";
import { writeMetadata } from "./runner-artifacts.js";
import { emit, finishBackground, failBackground } from "./runner-publication.js";
import {
  allowedTools,
  backgroundOutput,
  createExecution,
  registerExecution,
  resolveProfile,
  type Execution,
  type RunnerState,
} from "./runner-state.js";
export async function backgroundWorker(
  state: RunnerState,
  execution: Execution,
  options: SubagentRunOptions,
  onReady: () => Promise<void>,
  onSetupFailure?: (error: unknown) => void,
  onSettled?: () => void,
  resumeFromStore?: boolean,
): Promise<void> {
  let ready = false;
  try /* 失败按就绪与否分流 */ {
    const task = state.registry.get(execution.agentId);
    if (!task || isTerminalRuntimeTask(task)) return;
    const child = await runChild(
      state,
      execution,
      options,
      async () => {
        await onReady();
        ready = true;
      },
      undefined,
      resumeFromStore,
    );
    await finishBackground(state, execution, child.output);
  } catch (error) {
    if (!ready) {
      onSetupFailure?.(error);
      return;
    }
    await failBackground(state, execution, error);
  } finally {
    onSettled?.();
  }
}
export function startMethod(state: RunnerState): NonNullable<SubagentPort["start"]> {
  return async (rawRequest, options) => {
    const { request, profile } = resolveProfile(state, rawRequest);
    const execution = createExecution(state, request, profile);
    const output = backgroundOutput(execution);
    registerExecution(state, execution, true);
    try /* 失败按就绪与否分流 */ {
      await writeMetadata(execution, "running");
    } catch (error) {
      state.registry.remove(execution.agentId);
      throw error;
    }
    const { controller, dispose } = controllerFor(state, execution);
    if (options?.signal?.aborted) controller.abort(options.signal.reason);
    const gate = readinessGate();
    void backgroundWorker(
      state,
      execution,
      { signal: controller.signal, ...(options?.model ? { model: options.model } : {}) },
      async () => {
        await emit(state, execution, SessionEventType.SubagentSpawned, {
          agentId: execution.agentId,
          agentType: request.agentType,
          background: true,
          childSessionId: execution.childSessionId,
          description: request.description,
          prompt: request.prompt,
          parentToolCallId: request.parentToolCallId,
          status: "running",
          allowedTools: [...allowedTools(state, profile)],
          outputFile: execution.outputFile,
          model: profile.modelSelection
            ? `${profile.modelSelection.providerId}/${profile.modelSelection.modelId}`
            : undefined,
        });
        gate.resolve();
      },
      gate.reject,
      dispose,
    );
    try /* 失败按就绪与否分流 */ {
      await gate.promise;
    } catch (error) {
      controller.abort(error);
      state.registry.remove(execution.agentId);
      throw error;
    }
    state.options.logger?.info("Explore subagent background task started", {
      ...traceContextToLogContext(execution.runTrace),
      agentId: execution.agentId,
      agentType: request.agentType,
      event: "subagent.background.started",
      module: "core.subagent",
      parentToolCallId: request.parentToolCallId,
      status: "started",
    });
    return output;
  };
}
