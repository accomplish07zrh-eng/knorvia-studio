// Offline Host fixture: real Studio admission, SQLite, run ownership and approvals; synthetic kernel only.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { StudioRuntimeService } from "../packages/services/src/studio-runtime/app/studioRuntimeService.ts";
import { StudioDatabase } from "../packages/services/src/studio-runtime/adapters/studioDatabase.ts";

export async function workbenchHost() {
  const root = await mkdtemp(join(tmpdir(), "knorvia-workbench-host-"));
  const commands = [],
    turns = [];
  const hosts = new Map();
  const statuses = ["knorvia", "codex", "claude-code"].map((id) => ({
    id,
    displayName: id,
    installed: true,
    origin: "external",
    management: "external",
    version: "offline fixture",
    capabilities: {
      resume: true,
      approval: true,
      questions: true,
      readOnly: true,
      fullAccess: true,
    },
  }));
  for (const host of ["a", "b", "reload-a", "reload-b"]) {
    const service = new StudioRuntimeService({
      db: new StudioDatabase(join(root, `${host}.sqlite`)),
      clock: {
        id: randomUUID,
        now: Date.now,
        delay: (ms, signal) => delay(ms, undefined, { signal }),
      },
      kernels: {
        adapter: () => ({
          async run(turn, sink, signal) {
            turns.push({ host, ...turn });
            await sink.emit({ type: "text", text: `Working on ${turn.text}` });
            // 原生媒体产出（specs/knorvia-kernel-native-media-20261010.md）：只给位置，不带字节。
            if (turn.text.startsWith("media")) {
              await sink.emit({
                type: "media",
                items: [
                  { kind: "image", uri: "/test/project/generated.png", name: "generated.png" },
                ],
              });
              return { status: "succeeded", text: `Finished ${turn.text}`, resultKnown: true };
            }
            const answer = await sink.ask(
              turn.text.startsWith("question")
                ? {
                    id: "question",
                    kind: "question",
                    title: `Question ${turn.text}`,
                    questions: [{ id: "choice", title: "Choose a path", options: ["One", "Two"] }],
                  }
                : {
                    id: "approval",
                    kind: "approval",
                    title: `Approve ${turn.text}`,
                    choices: ["allow-once", "deny"],
                  },
              signal,
            );
            await sink.emit({ type: "text", text: `\nFinished ${turn.text}` });
            return {
              status: answer.decision === "deny" ? "cancelled" : "succeeded",
              text: `Finished ${turn.text}`,
              resultKnown: true,
            };
          },
        }),
        inspect: async () => statuses,
        options: async () => ({ models: [] }),
        manage: async () => {
          throw new Error("fixture cannot manage a real kernel");
        },
        dispose: async () => {},
      },
      workspaces: {
        prepare: async ({ sourcePath }) => sourcePath,
        changes: async () => [],
        apply: async () => {},
      },
      onDidChange: () => ({ dispose() {} }),
      notify() {},
    });
    await service.command({
      commandId: randomUUID(),
      type: "create-conversation",
      id: "saved",
      kernel: "codex",
      workspacePath: "/test/project",
    });
    hosts.set(host, service);
  }
  const timer = setInterval(() => {
    for (const service of hosts.values()) service.tick();
  }, 30);
  return {
    root,
    commands,
    turns,
    async request(host, method, args) {
      const service = hosts.get(host);
      if (
        !service ||
        ![
          "overview",
          "timeline",
          "command",
          "kernelOptions",
          "inspectKernels",
          "workspaceChanges",
        ].includes(method)
      )
        throw new Error("Unknown test RPC");
      if (method === "command") commands.push({ host, ...args[0] });
      return service[method](...args);
    },
    async close() {
      clearInterval(timer);
      await Promise.all([...hosts.values()].map((service) => service.disposeAllAndWait()));
      await rm(root, { recursive: true, force: true });
    },
  };
}
