import { createHash } from "node:crypto";
import { isFileSystemPortError } from "../deps.js";
export function contentHash(content) {
    return content === null ? "missing" : createHash("sha256").update(content).digest("hex");
}
export function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export async function readCurrentState(runtime, path, trace, signal) {
    try {
        const result = await runtime.fileSystemPort.readTextFile({ path, trace }, { signal });
        return { content: result.content, exists: true, hash: contentHash(result.content) };
    }
    catch (error) {
        if (isFileSystemPortError(error) && error.code === "not_found") {
            return { content: null, exists: false, hash: "missing" };
        }
        return { reason: "file_read_failed", message: errorMessage(error) };
    }
}
export async function compensate(runtime, journal, trace) {
    for (let index = journal.length - 1; index >= 0; index -= 1) {
        const { path, state } = journal[index];
        if (!state.exists || state.content === null) {
            await runtime.fileSystemPort.removeFile({ path, missingOk: true, trace });
        }
        else {
            await runtime.fileSystemPort.writeTextFile({
                path, content: state.content, createParents: true, atomic: true, trace,
            });
        }
    }
}
