import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runKernelProtocol } from "../src/studio-runtime/adapters/kernels/kernelRun.js";
import { startCodex, codexMessage } from "../src/studio-runtime/adapters/kernels/codexProtocol.js";
import {
  startClaude,
  claudeMessage,
} from "../src/studio-runtime/adapters/kernels/claudeProtocol.js";
import { startAcp, acpMessage } from "../src/studio-runtime/adapters/kernels/acpProtocol.js";
import { startGrok, grokMessage } from "../src/studio-runtime/adapters/kernels/grokProtocol.js";
import type {
  StudioKernelEvent,
  StudioKernelInteraction,
} from "../src/studio-runtime/kernelTypes.js";

export async function protocolCase(kind: "codex" | "claude" | "acp" | "grok", scenario: string) {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-state-rebuild-"));
  const events: StudioKernelEvent[] = [];
  const interactions: StudioKernelInteraction[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const [start, message] =
    kind === "codex"
      ? [startCodex, codexMessage]
      : kind === "claude"
        ? [startClaude, claudeMessage]
        : kind === "grok"
          ? [startGrok, grokMessage]
          : [startAcp, acpMessage];
  try {
    const result = await runKernelProtocol({
      kernel:
        kind === "claude"
          ? "claude-code"
          : kind === "grok"
            ? "grok-build"
            : kind === "acp"
              ? "opencode"
              : "codex",
      mode: kind === "grok" ? "acp" : kind,
      turn: {
        kernel: "codex",
        runId: "run",
        turnId: "studio-turn",
        conversationId: "conversation",
        workspacePath: directory,
        permission: "ask",
        text: "fixture",
      },
      executable: async () => ({ command: process.execPath, path: process.execPath, args: [] }),
      args: [
        fileURLToPath(new URL("./fixtures/external-state-rebuild.cjs", import.meta.url)),
        kind,
        scenario,
      ],
      start,
      message,
      signal: controller.signal,
      sink: {
        async emit(event) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          events.push(event);
        },
        async ask(interaction) {
          interactions.push(interaction);
          if (scenario === "same-id-old") await new Promise((resolve) => setTimeout(resolve, 20));
          if (scenario === "cancel") controller.abort();
          return {
            decision: "allow-once",
            answers: Object.fromEntries((interaction.questions ?? []).map((q) => [q.id, ["Blue"]])),
          };
        },
      },
    });
    const wire = (await readFile(join(directory, "wire.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    return { result, events, interactions, wire };
  } finally {
    clearTimeout(timer);
    await rm(directory, { recursive: true, force: true });
  }
}
