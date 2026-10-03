import { SessionEventType } from "@knorvia/contracts";
import { isSubagentDispatchToolName } from "../compat.js";
import { registerRuntimeBackgroundTask, removeRuntimeBackgroundTask, updateRuntimeBackgroundTask, } from "./background-task-registry.js";
import { enqueueTerminalNotification } from "./background-tracker-notification.js";
import { emitBackgroundTaskEvent, errorMessage, field, hasDirectWaiter, hasSnapshotProvider, readTaskSnapshot, runningSignature, taskLogFacts, waitForTaskSnapshot, } from "./background-tracker-projection.js";
import { isRecord } from "./utils.js";
export class BackgroundTaskTracker {
    deps;
    trackedTaskIds = new Set();
    constructor(deps) {
        this.deps = deps;
    }
    async trackBackgroundTask(toolCall, output, traceContext, turnId) {
        if (!isRecord(output))
            return;
        if (output.status !== "backgrounded"
            && !(output.status === "async_launched" && isSubagentDispatchToolName(toolCall.name)))
            return;
        const taskId = typeof output.backgroundTaskId === "string" ? output.backgroundTaskId
            : typeof output.agentId === "string" ? output.agentId : undefined;
        if (!taskId || this.trackedTaskIds.has(taskId))
            return;
        this.trackedTaskIds.add(taskId);
        registerRuntimeBackgroundTask(this.deps, toolCall, taskId, output, turnId);
        try {
            await emitBackgroundTaskEvent(this.deps, toolCall, taskId, SessionEventType.BackgroundTaskStarted, "running", traceContext, turnId, output);
        }
        catch (error) {
            this.trackedTaskIds.delete(taskId);
            removeRuntimeBackgroundTask(this.deps, toolCall, taskId);
            throw error;
        }
        const hasSnapshot = hasSnapshotProvider(this.deps, toolCall.name);
        const hasWaiter = hasDirectWaiter(this.deps, toolCall.name);
        this.deps.logger?.info("Background task tracking started", {
            ...taskLogFacts(traceContext, taskId, toolCall.name),
            event: "background_task.tracking.started",
            hasDirectWaiter: hasWaiter,
            hasSnapshotProvider: hasSnapshot,
        });
        if (!hasSnapshot && !hasWaiter) {
            this.deps.logger?.info("Background task tracking lost without snapshot source", {
                ...taskLogFacts(traceContext, taskId, toolCall.name),
                event: "background_task.tracking.lost", reason: "missing_snapshot_source",
            });
            updateRuntimeBackgroundTask(this.deps, toolCall, taskId, "lost");
            enqueueTerminalNotification(this.deps, toolCall, taskId, "lost", traceContext, undefined, output);
            await emitBackgroundTaskEvent(this.deps, toolCall, taskId, SessionEventType.BackgroundTaskCompleted, "lost", traceContext, turnId, output);
            this.trackedTaskIds.delete(taskId);
            return;
        }
        let stopped = false;
        let pollInFlight = false;
        let terminalPublishing = false;
        let lastRunningSignature = "";
        let interval;
        let maxRuntimeTimeout;
        const cleanup = () => {
            if (interval)
                clearInterval(interval);
            if (maxRuntimeTimeout)
                clearTimeout(maxRuntimeTimeout);
            interval = undefined;
            maxRuntimeTimeout = undefined;
            this.trackedTaskIds.delete(taskId);
        };
        const publishRunning = async (snapshot) => {
            const signature = runningSignature(snapshot);
            if (signature === lastRunningSignature)
                return;
            lastRunningSignature = signature;
            updateRuntimeBackgroundTask(this.deps, toolCall, taskId, "running", snapshot);
            await emitBackgroundTaskEvent(this.deps, toolCall, taskId, SessionEventType.BackgroundTaskUpdated, "running", traceContext, turnId, output, snapshot);
        };
        const publishTerminal = async (snapshot) => {
            if (stopped || terminalPublishing)
                return;
            terminalPublishing = true;
            try {
                if (snapshot === undefined) {
                    this.deps.logger?.info("Background task terminal snapshot missing", {
                        ...taskLogFacts(traceContext, taskId, toolCall.name),
                        event: "background_task.tracking.lost", reason: "snapshot_missing",
                    });
                    updateRuntimeBackgroundTask(this.deps, toolCall, taskId, "lost");
                    enqueueTerminalNotification(this.deps, toolCall, taskId, "lost", traceContext, undefined, output);
                    await emitBackgroundTaskEvent(this.deps, toolCall, taskId, SessionEventType.BackgroundTaskCompleted, "lost", traceContext, turnId, output);
                    stopped = true;
                    cleanup();
                    return;
                }
                if (snapshot.status === "running") {
                    updateRuntimeBackgroundTask(this.deps, toolCall, taskId, "running", snapshot);
                    await publishRunning(snapshot);
                    if (!hasSnapshot) {
                        stopped = true;
                        cleanup();
                    }
                    return;
                }
                if (isSubagentDispatchToolName(toolCall.name)
                    && field(snapshot, "type") === "local_agent" && field(snapshot, "notified") === true) {
                    this.deps.logger?.debug("Background task terminal notification already handled by subagent", {
                        ...taskLogFacts(traceContext, taskId, toolCall.name),
                        event: "background_task.tracking.notification_already_handled",
                    });
                    stopped = true;
                    cleanup();
                    return;
                }
                this.deps.logger?.info("Background task terminal snapshot observed", {
                    ...taskLogFacts(traceContext, taskId, toolCall.name),
                    event: "background_task.tracking.terminal", taskStatus: snapshot.status,
                });
                updateRuntimeBackgroundTask(this.deps, toolCall, taskId, snapshot.status, snapshot);
                enqueueTerminalNotification(this.deps, toolCall, taskId, snapshot.status, traceContext, snapshot);
                await emitBackgroundTaskEvent(this.deps, toolCall, taskId, SessionEventType.BackgroundTaskCompleted, snapshot.status, traceContext, turnId, output, snapshot);
                stopped = true;
                cleanup();
            }
            finally {
                terminalPublishing = false;
            }
        };
        const poll = async () => {
            if (pollInFlight || stopped || !hasSnapshot)
                return;
            pollInFlight = true;
            try {
                const snapshot = await readTaskSnapshot(this.deps, toolCall.name, taskId);
                if (snapshot === undefined || snapshot.status !== "running") {
                    await publishTerminal(snapshot);
                }
                else {
                    await publishRunning(snapshot);
                }
            }
            catch (error) {
                this.deps.logger?.warn("Background task polling failed", {
                    ...taskLogFacts(traceContext, taskId), errorMessage: errorMessage(error),
                });
            }
            finally {
                pollInFlight = false;
            }
        };
        if (toolCall.name === "Bash" && this.deps.runtimeScope === "subagent"
            && this.deps.subagentBackgroundBashMaxMs !== undefined
            && this.deps.executionPort?.cancelBackgroundTask) {
            maxRuntimeTimeout = setTimeout(() => {
                this.deps.logger?.warn("Subagent background Bash exceeded max runtime; cancelling", {
                    ...taskLogFacts(traceContext, taskId, toolCall.name),
                    event: "background_task.subagent_bash.max_runtime_exceeded",
                });
                Promise.resolve(this.deps.executionPort?.cancelBackgroundTask?.(taskId)).catch((error) => {
                    this.deps.logger?.warn("Subagent background Bash cancellation failed", {
                        ...taskLogFacts(traceContext, taskId, toolCall.name),
                        event: "background_task.subagent_bash.cancel_failed", errorMessage: errorMessage(error),
                    });
                });
            }, this.deps.subagentBackgroundBashMaxMs);
        }
        if (hasSnapshot) {
            interval = setInterval(() => { void poll(); }, 1000);
            interval.unref?.();
        }
        await poll();
        if (hasWaiter && !stopped) {
            void (async () => {
                try {
                    const snapshot = await waitForTaskSnapshot(this.deps, toolCall.name, taskId);
                    await publishTerminal(snapshot);
                }
                catch (error) {
                    this.deps.logger?.warn("Background task wait failed", {
                        ...taskLogFacts(traceContext, taskId), errorMessage: errorMessage(error),
                    });
                    if (!hasSnapshot) {
                        stopped = true;
                        cleanup();
                    }
                }
            })();
        }
    }
}
