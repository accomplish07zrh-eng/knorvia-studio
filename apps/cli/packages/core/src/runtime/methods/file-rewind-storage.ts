import { createHash } from "node:crypto";
import { isFileSystemPortError } from "../deps.js";
import type { TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";

export type FileState = { content: string | null; exists: boolean; hash: string };
export type ReadFailure = { reason: "file_read_failed"; message: string };
export type JournalRecord = { path: string; state: FileState };

export function contentHash(content: string | null): string {
  return content === null ? "missing" : createHash("sha256").update(content).digest("hex");
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readCurrentState(
  runtime: AgentRuntimeInternal,
  path: string,
  trace: TraceContext,
  signal?: AbortSignal,
): Promise<FileState | ReadFailure> {
  try {
    const result = await runtime.fileSystemPort!.readTextFile({ path, trace }, { signal });
    return { content: result.content, exists: true, hash: contentHash(result.content) };
  } catch (error) {
    if (isFileSystemPortError(error) && error.code === "not_found") {
      return { content: null, exists: false, hash: "missing" };
    }
    return { reason: "file_read_failed", message: errorMessage(error) };
  }
}

export async function compensate(
  runtime: AgentRuntimeInternal,
  journal: JournalRecord[],
  trace: TraceContext,
): Promise<void> {
  for (let index = journal.length - 1; index >= 0; index -= 1) {
    const { path, state } = journal[index]!;
    if (!state.exists || state.content === null) {
      await runtime.fileSystemPort!.removeFile({ path, missingOk: true, trace });
    } else {
      await runtime.fileSystemPort!.writeTextFile({
        path,
        content: state.content,
        createParents: true,
        atomic: true,
        trace,
      });
    }
  }
}
