import type { StudioExecutionPort } from "./ports.js";
import type { StudioStepResult, StudioWorkflowDefinition } from "../workflowTypes.js";
import { studioStepReference } from "../domain/stepReference.js";
import {
  studioWorkflowGraph,
  validateStudioWorkflow,
  workflowAnyLosers,
} from "../domain/workflowGraph.js";
import {
  executeWorkflowNode,
  workflowCached,
  workflowContext,
  workflowFailed,
  workflowStopped,
  workflowUnknown,
  workflowValueKey,
  type WorkflowOutcome,
} from "./workflowSteps.js";

interface RunningNode {
  controller: AbortController;
  promise: Promise<void>;
}
const skipped = (): WorkflowOutcome => ({ status: "skipped", text: "", resultKnown: true });

export async function executeStudioWorkflow(
  definition: StudioWorkflowDefinition,
  input: string,
  port: StudioExecutionPort,
): Promise<StudioStepResult> {
  if (port.signal.aborted) return workflowStopped(port.signal);
  const issues = validateStudioWorkflow(definition);
  if (issues.length) return workflowFailed(issues.join("\n"));
  const graph = studioWorkflowGraph(definition);
  const outcomes = new Map<string, WorkflowOutcome>();
  const running = new Map<string, RunningNode>();
  const abandoned = new Set<string>();
  const scope = new AbortController();
  const signal = AbortSignal.any([port.signal, scope.signal]);
  let fatal: WorkflowOutcome | undefined;

  const persist = async (id: string, result: WorkflowOutcome) => {
    // 失败和取消也是画布需要展示的事实；是否可复用由 workflowCached 单独判断。
    await port.saveCheckpoint({ values: { [workflowValueKey(id)]: JSON.stringify(result) } });
  };
  const settle = async (id: string, result: WorkflowOutcome) => {
    // 未知副作用始终优先暴露，即使这个分支刚被 any 汇合选为落败者。
    if (!result.resultKnown || result.status === "interrupted") {
      fatal = { ...result, status: "interrupted", resultKnown: false };
      scope.abort(new Error("A workflow step has an unknown outcome."));
    } else if (result.status === "cancelled" && !abandoned.has(id) && !signal.aborted) {
      fatal ??= result;
      scope.abort(new Error("A workflow step was cancelled."));
    }
    const outcome =
      abandoned.has(id) && result.resultKnown && result.status !== "interrupted"
        ? skipped()
        : result;
    await persist(id, outcome);
    outcomes.set(id, outcome);
  };
  const incoming = (id: string) =>
    graph.incoming.get(id)!.map((edge) => {
      const result = outcomes.get(edge.source);
      if (!result) return { edge, state: "pending" as const };
      const state =
        result.status === "skipped" ||
        (result.branch !== undefined && result.branch !== edge.sourceHandle)
          ? "skipped"
          : result.status === "succeeded"
            ? "active"
            : "failed";
      return { edge, state, result };
    });
  const launch = (id: string, output: string) => {
    const controller = new AbortController();
    const nodeSignal = AbortSignal.any([signal, controller.signal]);
    const promise = Promise.resolve()
      .then(async () => {
        let result: WorkflowOutcome;
        try {
          result = await executeWorkflowNode(
            graph.nodes.get(id)!,
            input,
            output,
            outcomes,
            port,
            nodeSignal,
          );
        } catch (error) {
          result = nodeSignal.aborted ? workflowStopped(nodeSignal) : workflowFailed(error);
        }
        await settle(id, result);
      })
      .catch((error) => {
        fatal = workflowUnknown(error);
        scope.abort(error);
      })
      .finally(() => {
        running.delete(id);
      });
    running.set(id, { controller, promise });
  };
  try {
    for (const id of graph.order) {
      const cached = workflowCached(port, id);
      if (cached) outcomes.set(id, cached);
    }
    while (outcomes.size < graph.nodes.size || running.size) {
      if (signal.aborted) break;
      let advanced = false;
      for (const id of graph.order) {
        if (signal.aborted) break;
        if (outcomes.has(id) || running.has(id)) continue;
        if (abandoned.has(id)) {
          await settle(id, skipped());
          advanced = true;
          continue;
        }
        const node = graph.nodes.get(id)!;
        const edges = incoming(id);
        const active = edges.filter((edge) => edge.state === "active");
        const any = node.data.kind === "join" && node.data.joinPolicy === "any";
        if (any && active.length) {
          const winner = active[0]!.edge.source;
          const losers = workflowAnyLosers(graph, id, winner);
          for (const loser of losers) {
            if (outcomes.has(loser)) continue;
            abandoned.add(loser);
            running
              .get(loser)
              ?.controller.abort(new Error("Another branch completed the any join."));
            if (!running.has(loser)) await settle(loser, skipped());
          }
          // 落败调用退出前不能启动汇合后的写操作；否则未知副作用晚到时下游已经继续修改项目。
          if (signal.aborted || [...losers].some((loser) => running.has(loser))) continue;
        } else if (edges.some((edge) => edge.state === "pending")) continue;
        else if (edges.some((edge) => edge.state === "failed")) {
          const cause = edges.find((edge) => edge.state === "failed")?.result;
          await settle(
            id,
            // 沿实际失败依赖传递根因，不能让末尾 end 的泛化文案掩盖审批拒绝等原始错误。
            workflowFailed(
              cause?.error || `A required predecessor of ${node.data.label || id} failed.`,
            ),
          );
          advanced = true;
          continue;
        } else if (edges.length && !active.length) {
          await settle(id, skipped());
          advanced = true;
          continue;
        }
        const output = workflowContext(
          (any ? active.slice(0, 1) : active).map((edge) => studioStepReference(edge.result)),
        );
        launch(id, output);
        advanced = true;
      }
      if (running.size) await Promise.race([...running.values()].map((node) => node.promise));
      else if (!advanced && outcomes.size < graph.nodes.size)
        throw new Error("Workflow cannot make progress; unresolved graph dependencies.");
    }
  } catch (error) {
    fatal ??= workflowFailed(error);
    scope.abort(error);
  } finally {
    if (signal.aborted) for (const node of running.values()) node.controller.abort(signal.reason);
    // 等真正的调用退出再结算，不能用 Promise.race 把仍在写文件的落败分支遗留后台。
    await Promise.all([...running.values()].map((node) => node.promise));
  }
  if (fatal) return fatal;
  if (port.signal.aborted) return workflowStopped(port.signal);
  const ends = definition.nodes
    .filter((node) => node.data.kind === "end")
    .map((node) => outcomes.get(node.id))
    .filter((value): value is WorkflowOutcome => value !== undefined);
  const failed = ends.find(
    (result) =>
      result.status === "failed" ||
      result.status === "interrupted" ||
      result.status === "cancelled",
  );
  if (failed) return failed;
  return {
    status: "succeeded",
    text: ends
      .filter((result) => result.status === "succeeded")
      .map((result) => result.text)
      .join("\n\n"),
    resultKnown: true,
  };
}
