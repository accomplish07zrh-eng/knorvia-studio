import type { ConversationDelta } from "./delta.js";

export function coalesceConversationDeltas(
  deltas: readonly ConversationDelta[],
): ConversationDelta[] {
  const output: ConversationDelta[] = [];

  for (const incoming of deltas) {
    if (incoming.op === "row.upserted") {
      for (let position = output.length - 1; position >= 0; position -= 1) {
        const earlier = output[position];
        if (!earlier || earlier.op === "row.removed") {
          break;
        }

        if (earlier.op === "row.delta" && earlier.rowId === incoming.row.rowId) {
          output.splice(position, 1);
          continue;
        }

        if (
          (earlier.op === "row.upserted" || earlier.op === "row.appended") &&
          earlier.row.rowId === incoming.row.rowId
        ) {
          break;
        }
      }
    }

    const last = output[output.length - 1];
    if (
      incoming.op === "row.delta" &&
      last?.op === "row.delta" &&
      last.rowId === incoming.rowId &&
      last.path === incoming.path
    ) {
      output[output.length - 1] = {
        op: "row.delta",
        rowId: incoming.rowId,
        path: incoming.path,
        append: last.append + incoming.append,
      };
    } else if (incoming.op === "state.updated" && last?.op === "state.updated") {
      output[output.length - 1] = {
        op: "state.updated",
        patch: { ...last.patch, ...incoming.patch },
      };
    } else if (
      incoming.op === "row.upserted" &&
      last?.op === "row.upserted" &&
      last.row.rowId === incoming.row.rowId
    ) {
      output[output.length - 1] = incoming;
    } else {
      output.push(incoming);
    }
  }

  return output;
}

export function conflateByKey<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const lastIndex = new Map<string, number>();
  items.forEach((item, index) => {
    lastIndex.set(keyOf(item), index);
  });
  return items.filter((item, index) => lastIndex.get(keyOf(item)) === index);
}
