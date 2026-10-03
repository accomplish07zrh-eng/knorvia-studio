import { isSubagentDispatchToolName } from "../compat.js";
import { backgroundTaskOutputMetadata } from "./background-task-output.js";
import { isDynamicWorkflowRunDispatchToolName } from "./background-task-registry.js";
import { isRecord } from "./utils.js";
function resolveProvider(deps, name) {
    if (isSubagentDispatchToolName(name)) {
        const method = deps.subagentPort?.getTask;
        return {
            snapshot: method ? (id) => method.call(deps.subagentPort, id) : undefined,
            cancellable: Boolean(deps.subagentPort?.stopTask),
        };
    }
    if (isDynamicWorkflowRunDispatchToolName(name)) {
        const port = deps.dynamicWorkflowRunPort;
        return {
            snapshot: port !== undefined ? (id) => port.getTask(id) : undefined,
            wait: port !== undefined && typeof port.waitForTask === "function"
                ? (id) => port.waitForTask(id)
                : undefined,
            cancellable: port !== undefined && typeof port.cancel === "function",
        };
    }
    if (name === "Workflow") {
        const method = deps.workflowPort?.getTask;
        const candidate = deps.workflowPort;
        return {
            snapshot: method ? (id) => method.call(deps.workflowPort, id) : undefined,
            wait: candidate && typeof candidate.waitForTask === "function"
                ? (id) => candidate.waitForTask(id)
                : undefined,
            cancellable: false,
        };
    }
    const candidate = name === "Bash" ? deps.executionPort : undefined;
    const wait = typeof candidate?.waitForBackgroundTask === "function"
        ? (id) => candidate.waitForBackgroundTask(id)
        : undefined;
    const method = deps.executionPort?.getBackgroundTask;
    return {
        snapshot: method ? (id) => method.call(deps.executionPort, id) : undefined,
        wait,
        cancellable: Boolean(deps.executionPort?.cancelBackgroundTask),
    };
}
export function hasSnapshotProvider(deps, name) {
    return Boolean(resolveProvider(deps, name).snapshot);
}
export function hasDirectWaiter(deps, name) {
    return Boolean(resolveProvider(deps, name).wait);
}
export async function readTaskSnapshot(deps, name, taskId) {
    return resolveProvider(deps, name).snapshot?.(taskId);
}
export async function waitForTaskSnapshot(deps, name, taskId) {
    return resolveProvider(deps, name).wait?.(taskId);
}
export function field(snapshot, key) {
    return snapshot && key in snapshot ? snapshot[key] : undefined;
}
export function stringField(value, key) {
    const result = value?.[key];
    return typeof result === "string" ? result : undefined;
}
export function snapshotString(snapshot, key) {
    const value = field(snapshot, key);
    return typeof value === "string" ? value : undefined;
}
export function workflowSubject(call, taskId, snapshot, launch) {
    const input = isRecord(call.input) ? call.input : undefined;
    return (stringField(input, "description") ??
        snapshotString(snapshot, "description") ??
        snapshotString(snapshot, "name") ??
        stringField(launch, "name") ??
        stringField(input, "name") ??
        stringField(input, "scriptPath") ??
        taskId);
}
export function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export function runningSignature(snapshot) {
    return JSON.stringify({
        pid: field(snapshot, "pid"),
        stderrBytes: field(snapshot, "stderrBytes"),
        stderrTail: field(snapshot, "stderrTail"),
        stdoutBytes: field(snapshot, "stdoutBytes"),
        stdoutTail: field(snapshot, "stdoutTail"),
    });
}
export function taskPayload(deps, call, taskId, status, launch, snapshot) {
    const input = isRecord(call.input) ? call.input : {};
    const metadata = backgroundTaskOutputMetadata(snapshot, launch);
    return {
        taskId,
        toolCallId: call.id,
        toolName: call.name,
        taskKind: isSubagentDispatchToolName(call.name)
            ? "subagent"
            : isDynamicWorkflowRunDispatchToolName(call.name)
                ? "workflow"
                : "bash",
        childSessionId: metadata.childSessionId,
        cancellable: status === "running" ? resolveProvider(deps, call.name).cancellable : false,
        command: typeof input.command === "string" ? input.command : undefined,
        description: isDynamicWorkflowRunDispatchToolName(call.name)
            ? workflowSubject(call, taskId, snapshot, launch)
            : typeof input.description === "string"
                ? input.description
                : field(snapshot, "description"),
        status,
        pid: field(snapshot, "pid"),
        startedAt: snapshot?.startedAt,
        completedAt: snapshot?.completedAt,
        outputPath: metadata.outputFile,
        stderrPersistedOutputPath: metadata.stderrFile,
        stdoutPersistedOutputPath: metadata.stdoutFile,
        outputBytes: metadata.outputBytes,
        outputTruncated: metadata.outputTruncated,
        outputTail: metadata.outputTail,
        stderrBytes: metadata.stderrBytes,
        stderrTail: metadata.stderrTail,
        stdoutBytes: metadata.stdoutBytes,
        stdoutTail: metadata.stdoutTail,
        terminalId: taskId,
    };
}
export async function emitBackgroundTaskEvent(deps, type, payload, traceContext, turnId) {
    await deps.emitEvent({
        id: crypto.randomUUID(),
        sessionId: deps.sessionId,
        turnId,
        type,
        timestamp: new Date(),
        traceId: traceContext.traceId,
        sequenceNumber: 0,
        payload,
    });
}
