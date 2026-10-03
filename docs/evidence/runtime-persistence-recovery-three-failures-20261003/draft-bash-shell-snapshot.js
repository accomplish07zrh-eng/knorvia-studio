import { accessSync, constants as fsConstants } from "node:fs";
import { SESSION_ENTRY_BASH_SHELL_SELECTION, traceContextToLogContext, } from "../deps.js";
export async function persistBashShellSelectionSnapshot(options) {
    const { logger, selection, sessionId, sessionStore, traceContext } = options;
    if (!selection || !sessionStore?.saveSessionEntry)
        return;
    try {
        const timestamp = Date.now();
        await sessionStore.saveSessionEntry({
            id: sessionId + ":runtime:bash_shell_selection",
            sessionID: sessionId,
            type: SESSION_ENTRY_BASH_SHELL_SELECTION,
            time: { created: timestamp, updated: timestamp },
            data: { ...selection, display: { ...selection.display } },
        });
    }
    catch (error) {
        logger?.warn("Failed to persist Bash shell selection snapshot", {
            ...traceContextToLogContext(traceContext),
            errorMessage: error instanceof Error ? error.message : String(error),
            event: "session_entry.bash_shell_selection.persist_failed",
            module: "core.runtime",
            status: "failed",
        });
    }
}
function decodeSelection(data) {
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
        return undefined;
    }
    const record = data;
    const display = record.display;
    if (display === null || typeof display !== "object" || Array.isArray(display)) {
        return undefined;
    }
    const name = display.name;
    const dialect = record.dialect;
    const source = record.source;
    if (typeof name !== "string" ||
        (dialect !== "cmd" &&
            dialect !== "posix" &&
            dialect !== "git-bash" &&
            dialect !== "legacy-shell") ||
        (source !== "auto-detected" &&
            source !== "user-config" &&
            source !== "legacy-fallback")) {
        return undefined;
    }
    const selection = {
        dialect,
        display: { name },
        source,
    };
    const id = record.id;
    if (typeof id === "string")
        selection.id = id;
    const label = record.label;
    if (typeof label === "string")
        selection.label = label;
    const path = record.path;
    if (typeof path === "string")
        selection.path = path;
    return selection;
}
export async function readPersistedBashShellSelectionSnapshot(options) {
    const { logger, sessionId, sessionStore, traceContext } = options;
    if (!sessionStore?.sessionEntries)
        return { status: "missing" };
    try {
        const entries = await sessionStore.sessionEntries({
            sessionID: sessionId,
            type: SESSION_ENTRY_BASH_SHELL_SELECTION,
        });
        if (entries.length === 0)
            return { status: "missing" };
        const selection = decodeSelection(entries[entries.length - 1].data);
        if (selection)
            return { selection, status: "restored" };
        logger?.warn("Ignored invalid persisted Bash shell selection snapshot", {
            ...traceContextToLogContext(traceContext),
            event: "session_entry.bash_shell_selection.invalid",
            module: "core.runtime",
        });
        return { status: "invalid" };
    }
    catch (error) {
        logger?.warn("Failed to read persisted Bash shell selection snapshot", {
            ...traceContextToLogContext(traceContext),
            errorMessage: error instanceof Error ? error.message : String(error),
            event: "session_entry.bash_shell_selection.read_failed",
            module: "core.runtime",
            status: "failed",
        });
        return { status: "read_failed" };
    }
}
function isUsableSelection(selection) {
    const { dialect, path } = selection;
    if (dialect === "legacy-shell") {
        return path === undefined || path.trim() === "";
    }
    if (!path)
        return false;
    if (dialect === "cmd" &&
        path.toLowerCase() === "cmd.exe" &&
        !path.includes("/") &&
        !path.includes("\\")) {
        return true;
    }
    try {
        accessSync(path, fsConstants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
export function resolveBashShellSnapshotForResume(options) {
    const { currentSelection, logger, restore, traceContext } = options;
    if (restore.status !== "restored")
        return restore;
    const selection = restore.selection;
    if (isUsableSelection(selection))
        return restore;
    logger?.warn("Ignored stale persisted Bash shell selection snapshot", {
        ...traceContextToLogContext(traceContext),
        event: "session_entry.bash_shell_selection.stale",
        module: "core.runtime",
        persistedShellName: restore.selection.display.name,
        persistedShellPath: restore.selection.path,
    });
    if (currentSelection) {
        return {
            reason: "stale_snapshot",
            selection: currentSelection,
            staleSelection: selection,
            status: "fallback",
        };
    }
    return { staleSelection: selection, status: "stale" };
}
