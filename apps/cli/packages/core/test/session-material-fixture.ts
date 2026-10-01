// Synthetic public-builder corpus; frozen digests describe behavior, not authorship.
import type { MessageWithParts, ReadSessionContextInput, SessionInfo } from "@knorvia/contracts";
const emitted = process.env.KNORVIA_SESSION_MATERIAL_TARGET === "dist";
export const materialUrl = new URL(
  emitted
    ? "../dist/session-context/read-session-context.js"
    : "../src/session-context/read-session-context.ts",
  import.meta.url,
).href;
export const api = await import(materialUrl);
export const session = {
  id: "sess_owned",
  title: "Owned history",
  directory: "/synthetic/project",
  path: "owned-path",
} as SessionInfo;
export function message(
  index: number,
  text: string,
  extra: Record<string, unknown> = {},
): MessageWithParts {
  return {
    info: {
      id: `msg_${index}`,
      role: index % 3 ? "assistant" : "user",
      time: { created: index * 1000 },
      ...extra,
    },
    parts: [{ id: `part_${index}`, type: "text", text }],
  } as unknown as MessageWithParts;
}
export function corpus() {
  const scenarios: {
    label: string;
    messages: MessageWithParts[];
    query: string;
    strategy: ReadSessionContextInput["strategy"];
    outputCharBudget?: number;
  }[] = [];
  const histories = [
    [],
    [message(0, "fixed query evidence")],
    Array.from({ length: 20 }, (_, i) =>
      message(i, i % 2 ? "alpha beta alpha /src/file.ts" : "中文路径 项目进展 项目"),
    ),
    Array.from({ length: 30 }, (_, i) => message(i, `row ${i} ` + "x".repeat(2990))),
    Array.from({ length: 80 }, (_, i) =>
      message(i, (i % 7 ? "owned padding " : "alpha 中文路径 ") + "x".repeat(2950)),
    ),
  ];
  for (let h = 0; h < histories.length; h++)
    for (const strategy of ["relevant", "handoff"] as const) {
      for (const query of [
        "alpha",
        "中文路径",
        "absent term",
        "A /src/file.ts",
        "",
        "alpha alpha",
      ]) {
        for (const outputCharBudget of [undefined, 0, 4000, 4050, 48000, Infinity, NaN]) {
          scenarios.push({
            label: `${h}/${strategy}/${query}/${String(outputCharBudget)}`,
            messages: histories[h],
            query,
            strategy,
            outputCharBudget,
          });
        }
      }
    }
  return scenarios;
}
