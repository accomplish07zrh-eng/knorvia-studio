import type { StreamablePath } from "./core.js";
import type { ConversationDelta } from "./delta.js";
import type { ConversationRow } from "./rows.js";
import type { ConversationSnapshot } from "./snapshot.js";

export interface MutableConversationSnapshotAccumulator {
  snapshot: ConversationSnapshot;
  rowIndexById: Map<number, number>;
}

function appendToRow(row: ConversationRow, path: StreamablePath, append: string): ConversationRow {
  switch (path) {
    case "text":
      if (row.kind === "assistantText" || row.kind === "reasoning") {
        return { ...row, text: row.text + append };
      }
      return row;
    case "inputText":
      if (row.kind === "toolCall") {
        return { ...row, inputText: row.inputText + append };
      }
      return row;
    case "output.text":
      if (row.kind === "toolCall" && row.output) {
        return {
          ...row,
          output: { ...row.output, text: row.output.text + append },
        };
      }
      return row;
    case "summaryText":
      if (row.kind === "subagent") {
        return { ...row, summaryText: row.summaryText + append };
      }
      return row;
  }
}

export function createMutableConversationSnapshotAccumulator(
  snapshot: ConversationSnapshot,
): MutableConversationSnapshotAccumulator {
  const window = [...snapshot.rows.window];
  const rowIndexById = new Map<number, number>();
  window.forEach((row, index) => rowIndexById.set(row.rowId, index));
  return {
    snapshot: { ...snapshot, rows: { ...snapshot.rows, window } },
    rowIndexById,
  };
}

export function applyConversationDelta(
  snapshot: ConversationSnapshot,
  delta: ConversationDelta,
): ConversationSnapshot {
  switch (delta.op) {
    case "row.appended":
      return {
        ...snapshot,
        rows: {
          ...snapshot.rows,
          window: [...snapshot.rows.window, delta.row],
          totalCount: snapshot.rows.totalCount + 1,
          firstRowId: snapshot.rows.firstRowId ?? delta.row.rowId,
        },
      };
    case "row.upserted": {
      const index = snapshot.rows.window.findIndex((row) => row.rowId === delta.row.rowId);
      if (index < 0) return snapshot;
      const window = [...snapshot.rows.window];
      window[index] = delta.row;
      return { ...snapshot, rows: { ...snapshot.rows, window } };
    }
    case "row.removed": {
      const window = snapshot.rows.window.filter((row) => row.rowId < delta.fromRowId);
      const removedCount = snapshot.rows.window.length - window.length;
      const removesActiveBranch =
        snapshot.rows.firstRowId !== null && delta.fromRowId <= snapshot.rows.firstRowId;
      return {
        ...snapshot,
        rows: {
          ...snapshot.rows,
          window,
          totalCount: removesActiveBranch
            ? 0
            : Math.max(0, snapshot.rows.totalCount - removedCount),
          firstRowId: removesActiveBranch ? null : snapshot.rows.firstRowId,
        },
      };
    }
    case "row.delta": {
      const index = snapshot.rows.window.findIndex((row) => row.rowId === delta.rowId);
      if (index < 0) return snapshot;
      const row = snapshot.rows.window[index];
      if (row === undefined) return snapshot;
      const window = [...snapshot.rows.window];
      window[index] = appendToRow(row, delta.path, delta.append);
      return { ...snapshot, rows: { ...snapshot.rows, window } };
    }
    case "state.updated":
      return { ...snapshot, ...delta.patch };
  }
}

export function applyConversationDeltas(
  snapshot: ConversationSnapshot,
  deltas: readonly ConversationDelta[],
): ConversationSnapshot {
  let current = snapshot;
  for (const delta of deltas) {
    current = applyConversationDelta(current, delta);
  }
  return current;
}

export function applyConversationDeltaMutable(
  accumulator: MutableConversationSnapshotAccumulator,
  delta: ConversationDelta,
): void {
  const snapshot = accumulator.snapshot;
  const rows = snapshot.rows;
  const window = rows.window;
  const rowIndexById = accumulator.rowIndexById;

  switch (delta.op) {
    case "row.appended":
      rowIndexById.set(delta.row.rowId, window.length);
      window.push(delta.row);
      rows.totalCount += 1;
      rows.firstRowId ??= delta.row.rowId;
      return;
    case "row.upserted": {
      const index = rowIndexById.get(delta.row.rowId);
      if (index === undefined) return;
      window[index] = delta.row;
      return;
    }
    case "row.removed": {
      const oldLength = window.length;
      const removesActiveBranch = rows.firstRowId !== null && delta.fromRowId <= rows.firstRowId;
      let retainedCount = 0;
      for (let index = 0; index < oldLength; index += 1) {
        const row = window[index]!;
        if (row.rowId >= delta.fromRowId) continue;
        window[retainedCount] = row;
        retainedCount += 1;
      }
      window.length = retainedCount;
      rows.totalCount = removesActiveBranch
        ? 0
        : Math.max(0, rows.totalCount - (oldLength - retainedCount));
      if (removesActiveBranch) rows.firstRowId = null;
      rowIndexById.clear();
      window.forEach((row, index) => rowIndexById.set(row.rowId, index));
      return;
    }
    case "row.delta": {
      const index = rowIndexById.get(delta.rowId);
      if (index === undefined) return;
      const row = window[index];
      if (row === undefined) return;
      window[index] = appendToRow(row, delta.path, delta.append);
      return;
    }
    case "state.updated":
      Object.assign(snapshot, delta.patch);
      return;
  }
}

export function applyConversationDeltasMutable(
  accumulator: MutableConversationSnapshotAccumulator,
  deltas: readonly ConversationDelta[],
): void {
  for (const delta of deltas) {
    applyConversationDeltaMutable(accumulator, delta);
  }
}
