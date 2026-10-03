import { isAbsolute, resolve } from "node:path";
import { applyPatch } from "diff";
import { getCurrentTraceContext, parseWorkspaceCheckpointArtifact } from "../deps.js";
import { selectCheckpointForRewind, selectCheckpointsForMessages, throwIfTurnAborted } from "../helpers/index.js";
import { contentHash, errorMessage, readCurrentState } from "./file-rewind-storage.js";
export function previewFromPlan(plan) {
    return {
        canApply: plan.canApply,
        ignoredFiles: plan.ignoredFiles,
        safeFiles: plan.safeFiles,
        unsafeFiles: plan.unsafeFiles,
    };
}
export function unavailableFile(path, reason, message) {
    return { operationCount: 1, path, reason, toolNames: [], message };
}
function blocked(unsafeFiles = []) {
    return { canApply: false, ignoredFiles: [], safeFiles: [], unsafeFiles, operations: [] };
}
function isShellTool(toolName) {
    const normalized = toolName.toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalized === "bash" || normalized === "shell" || normalized.includes("terminal") || normalized.endsWith("shell");
}
function expectedContent(file, path) {
    if (typeof file.afterContent === "string")
        return file.afterContent;
    if (!file.existedBefore && file.beforeContent === null && file.structuredPatch.length === 0)
        return undefined;
    const patch = {
        oldFileName: path,
        newFileName: path,
        oldHeader: undefined,
        newHeader: undefined,
        hunks: file.structuredPatch,
    };
    const result = applyPatch(file.beforeContent ?? "", patch, { autoConvertLineEndings: false, fuzzFactor: 0 });
    return typeof result === "string" ? result : undefined;
}
function addUnsafe(rows, path, toolName, reason, details = {}) {
    const existing = rows.get(path);
    if (existing) {
        existing.operationCount += 1;
        existing.toolNames.add(toolName);
        if (details.message != null)
            existing.message = details.message;
        if (details.expectedHash != null)
            existing.expectedHash = details.expectedHash;
        if (details.currentHash != null)
            existing.currentHash = details.currentHash;
    }
    else {
        rows.set(path, { operationCount: 1, reason, toolNames: new Set([toolName]), ...details });
    }
}
export async function planWorkspaceFileRewind(runtime, options = {}) {
    const trace = options.traceContext ?? getCurrentTraceContext() ?? runtime.rootTraceContext;
    if (!runtime.artifactStore)
        return blocked([unavailableFile("workspace", "checkpoint_unreadable", "ArtifactStore is not configured.")]);
    if (!runtime.fileSystemPort)
        return blocked([unavailableFile("workspace", "file_read_failed", "FileSystemPort is not configured.")]);
    const events = await runtime.eventStore.getEvents(runtime.sessionId);
    const ids = options.targetMessageIds?.length
        ? options.targetMessageIds
        : options.targetMessageId ? [options.targetMessageId] : [];
    let checkpoints;
    if (ids.length > 0) {
        checkpoints = selectCheckpointsForMessages(events, ids);
    }
    else {
        const checkpoint = selectCheckpointForRewind(events, options.targetCheckpointId);
        checkpoints = checkpoint === undefined ? [] : [checkpoint];
    }
    if (checkpoints.length === 0)
        return blocked();
    const operations = [];
    const unreadable = [];
    const ignored = new Map();
    const unsafe = new Map();
    for (const checkpoint of checkpoints) {
        throwIfTurnAborted(options.abortSignal);
        let artifact;
        try {
            const result = await runtime.artifactStore.readToolResultArtifact({ uri: checkpoint.snapshotRef, trace }, { signal: options.abortSignal });
            artifact = parseWorkspaceCheckpointArtifact(JSON.parse(result.content));
        }
        catch (error) {
            unreadable.push({
                operationCount: Math.max(1, checkpoint.fileCount ?? 1),
                path: "checkpoint:" + checkpoint.checkpointId,
                reason: "checkpoint_unreadable",
                toolNames: [],
                message: errorMessage(error),
            });
            continue;
        }
        for (const file of artifact.files) {
            const path = isAbsolute(file.path) ? file.path : resolve(runtime.workspaceRoot, file.path);
            if (isShellTool(artifact.toolName)) {
                const entry = ignored.get(path);
                if (entry) {
                    entry.operationCount += 1;
                    entry.toolNames.add(artifact.toolName);
                }
                else {
                    ignored.set(path, { operationCount: 1, toolNames: new Set([artifact.toolName]) });
                }
                continue;
            }
            const afterContent = expectedContent(file, path);
            if (afterContent === undefined) {
                addUnsafe(unsafe, path, artifact.toolName, "unsupported_checkpoint");
                continue;
            }
            operations.push({
                action: file.existedBefore && file.beforeContent !== null ? "restore" : "delete",
                path,
                beforeContent: file.beforeContent,
                afterContent,
                toolName: artifact.toolName,
                checkpoint,
            });
        }
    }
    const summaries = new Map();
    const simulated = new Map();
    const accepted = [];
    for (let index = operations.length - 1; index >= 0; index -= 1) {
        throwIfTurnAborted(options.abortSignal);
        const operation = operations[index];
        const { path, toolName } = operation;
        const summary = summaries.get(path);
        if (summary) {
            summary.operationCount += 1;
            summary.toolNames.add(toolName);
            summary.action = operation.action;
        }
        else {
            summaries.set(path, { action: operation.action, operationCount: 1, toolNames: new Set([toolName]) });
        }
        if (unsafe.has(path))
            continue;
        const current = simulated.get(path) ?? await readCurrentState(runtime, path, trace, options.abortSignal);
        if ("reason" in current) {
            addUnsafe(unsafe, path, toolName, current.reason, { message: current.message });
            continue;
        }
        const expectedHash = contentHash(operation.afterContent);
        if (current.hash !== expectedHash) {
            addUnsafe(unsafe, path, toolName, "external_modified", { expectedHash, currentHash: current.hash ?? "missing" });
            continue;
        }
        simulated.set(path, {
            content: operation.beforeContent,
            exists: operation.beforeContent !== null,
            hash: contentHash(operation.beforeContent),
        });
        accepted.push(operation);
    }
    const safeFiles = [];
    for (const [path, summary] of summaries) {
        const unsafeEntry = unsafe.get(path);
        if (unsafeEntry) {
            unsafeEntry.operationCount = Math.max(unsafeEntry.operationCount, summary.operationCount);
            for (const toolName of summary.toolNames)
                unsafeEntry.toolNames.add(toolName);
        }
        else {
            safeFiles.push({ action: summary.action, operationCount: summary.operationCount, path, toolNames: [...summary.toolNames].sort() });
        }
    }
    const unsafeFiles = [...unreadable];
    for (const [path, entry] of unsafe) {
        unsafeFiles.push({
            operationCount: entry.operationCount,
            path,
            reason: entry.reason,
            toolNames: [...entry.toolNames].sort(),
            ...(entry.message ? { message: entry.message } : {}),
            ...(entry.expectedHash ? { expectedHash: entry.expectedHash } : {}),
            ...(entry.currentHash ? { currentHash: entry.currentHash } : {}),
        });
    }
    const ignoredFiles = [...ignored].map(([path, entry]) => ({
        operationCount: entry.operationCount, path, reason: "bash_ignored", toolNames: [...entry.toolNames].sort(),
    }));
    safeFiles.sort((a, b) => a.path.localeCompare(b.path));
    unsafeFiles.sort((a, b) => a.path.localeCompare(b.path));
    ignoredFiles.sort((a, b) => a.path.localeCompare(b.path));
    const canApply = safeFiles.length > 0 && unsafeFiles.length === 0;
    return { canApply, ignoredFiles, safeFiles, unsafeFiles, operations: unsafeFiles.length ? [] : accepted };
}
