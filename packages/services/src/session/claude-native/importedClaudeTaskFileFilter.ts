// Modified by Knorvia Studio: see packages/services/specs/claude-leaf-contract-fast-2057.md.
// Prior upstream source exposure; existing Apache-2.0/NOTICE obligations remain.
import { isObjectRecord } from "#src/session/claude-native/jsonLineRecord.js";

const ARRAY_WILDCARD_SUFFIX = "[]";

export const DEFAULT_IMPORTED_CLAUDE_TASK_FILTER_PATHS = [
  "meta.mode",
  "meta.model",
  "meta.provider",
  "messages[].model",
] as const;

function removeSelectedField(value: unknown, segments: readonly string[], offset: number): void {
  const segment = segments[offset];
  if (!segment || !isObjectRecord(value)) return;

  if (segment.endsWith(ARRAY_WILDCARD_SUFFIX)) {
    const key = segment.slice(0, -ARRAY_WILDCARD_SUFFIX.length);
    if (Array.isArray(value[key])) {
      for (const item of value[key]) {
        removeSelectedField(item, segments, offset + 1);
      }
    }
    return;
  }

  if (offset + 1 === segments.length) {
    delete value[segment];
  } else {
    removeSelectedField(value[segment], segments, offset + 1);
  }
}

export function filterImportedClaudeTaskFilePaths<T>(input: T, filterPaths: readonly string[]): T {
  const cloned = structuredClone(input) as T;
  for (const path of filterPaths) {
    removeSelectedField(cloned, path.split("."), 0);
  }
  return cloned;
}
