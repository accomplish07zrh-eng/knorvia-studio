import { useEffect, useMemo, useRef, useState } from "react";
import { useSelectDirectory } from "../../hooks/usePlatform.js";
import { useStudioWorkflowStore } from "../../store/studioWorkflowStore.js";
import { useStudioWorkflows } from "./useStudioWorkflows.js";
import { workflowFingerprint } from "./workflowDrafts.js";
import { workflowNodeStates } from "./workflowRuntimeState.js";
import type { StudioWorkflow } from "./types.js";
import { validateWorkflowGraph } from "./graph.js";
import { submitWorkflowRun } from "./workflowSubmission.js";

export function useWorkflowExecution(workflow: StudioWorkflow) {
  const runtime = useStudioWorkflows(workflow.id);
  const selectDirectory = useSelectDirectory();
  const store = useStudioWorkflowStore();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [stopping, setStopping] = useState(false);
  const stopInFlight = useRef(false);
  const stopAttempt = useRef(0);
  const stoppedRun = useRef<string | null>(null);
  const [error, setError] = useState("");
  const ready = runtime.ready && store.hydrated && store.storageProblem !== "corrupt";
  const running =
    runtime.timeline?.runs.find((run) => ["running", "waiting"].includes(run.state)) ??
    runtime.timeline?.runs.find((run) => run.state === "queued");
  const states = useMemo(
    () => workflowNodeStates(workflow, runtime.timeline),
    [workflow, runtime.timeline],
  );
  useEffect(() => {
    if (stoppedRun.current && stoppedRun.current !== running?.id) {
      stoppedRun.current = null;
      stopAttempt.current++;
      stopInFlight.current = false;
      setStopping(false);
    }
  }, [running?.id]);
  const action = async (operation: () => Promise<void | boolean>) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      return (await operation()) !== false;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return {
    ...runtime,
    ready,
    busy,
    stopping,
    editingDisabled:
      busy || Boolean(running) || !store.hydrated || store.storageProblem === "corrupt",
    error: error || runtime.error || runtime.importError,
    states,
    running,
    saved: store.backendVersions[workflow.id] === workflowFingerprint(workflow),
    saveCurrent: () => (ready ? action(() => runtime.save(workflow)) : Promise.resolve(false)),
    selectProject: () =>
      action(async () => {
        const path = await selectDirectory();
        if (path) store.setWorkspace(workflow.id, path);
      }),
    stop: async () => {
      if (!running || stopInFlight.current) return;
      // 保存与目录选择等待时仍须允许停止，不能让两个动作争用一个锁。
      stoppedRun.current = running.id;
      const attempt = ++stopAttempt.current;
      stopInFlight.current = true;
      setStopping(true);
      setError("");
      try {
        await runtime.command({ type: "cancel", runId: running.id });
      } catch (cause) {
        // 停止回执失败时结果仍可能已生效；保留运行冻结，按钮可安全重试。
        if (attempt === stopAttempt.current) {
          setStopping(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (attempt === stopAttempt.current) stopInFlight.current = false;
      }
    },
    run: (text: string, params?: Record<string, string>) => {
      if (
        running ||
        stoppedRun.current ||
        !ready ||
        !workflow.workspacePath ||
        validateWorkflowGraph(workflow).length
      )
        return Promise.resolve(false);
      const stopEpoch = stopAttempt.current;
      return action(() =>
        submitWorkflowRun({
          save: () => runtime.save(workflow),
          // 参数随同提交一起送到 Host，由服务端做校验并在写运行记录前冻结；
          // 这里只是编辑态草稿，不代表后端事实。
          send: () =>
            runtime.command({
              type: "send",
              kind: "workflow",
              targetId: workflow.id,
              text,
              ...(params && Object.keys(params).length ? { params } : {}),
            }),
          canSubmit: () => stopEpoch === stopAttempt.current && !stoppedRun.current,
        }),
      );
    },
  };
}
