// Constant-space batch verdict; compatibility rules are specified in the Lane C spec.
import { resolve } from "node:path";

export type FileWatcherBatch =
  | { readonly kind: "empty" }
  | { readonly kind: "exact"; readonly path: string }
  | { readonly kind: "ambiguous" };

export const emptyFileWatcherBatch: FileWatcherBatch = { kind: "empty" };
const ambiguous: FileWatcherBatch = { kind: "ambiguous" };

export function mergeFileWatcherSignal(
  batch: FileWatcherBatch,
  directory: string,
  filename: string | Buffer | null,
): FileWatcherBatch {
  const name = filename === null ? "" : filename.toString().trim();
  if (!name || batch.kind === "ambiguous") return ambiguous;
  const path = resolve(directory, name);
  if (batch.kind === "empty") return { kind: "exact", path };
  return batch.path === path ? batch : ambiguous;
}
