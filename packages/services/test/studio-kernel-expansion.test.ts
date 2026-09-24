import assert from "node:assert/strict";
import test from "node:test";
import { Event } from "@knorvia/rpc";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { isStudioKernelId } from "../src/studio-runtime/domain/kernelIdentity.js";
import {
  routeStudioGroupMembers,
  validateStudioGroup,
} from "../src/studio-runtime/domain/groupPolicy.js";
import { validModel, validateStudioCommand } from "../src/studio-runtime/domain/validation.js";
import { validateStudioWorkflow } from "../src/studio-runtime/domain/workflowGraph.js";
import { workflow, group } from "./studio-orchestration-support.js";

test("official ACP and safe custom IDs work across groups and workflows", () => {
  for (const id of [
    "opencode",
    "qoder",
    "qoder-cn",
    "gemini-cli",
    "antigravity",
    "goose",
    "kimi-cli",
    "copilot",
    "hermes",
    "qwen-code",
    "mistral-vibe",
    "deepseek-harness",
    "acp:local-agent",
  ])
    assert.equal(isStudioKernelId(id), true, id);
  for (const id of [
    "acp:",
    "acp:-bad",
    "acp:bad-",
    "acp:bad/path",
    "acp:Bad",
    "acp:tool\nX",
    "other-agent",
  ])
    assert.equal(isStudioKernelId(id), false, id);
  const members = {
    ...group,
    members: ["knorvia", "opencode", "qoder-cn", "acp:local-agent"],
    host: "knorvia",
  } as const;
  assert.deepEqual(validateStudioGroup(members), []);
  assert.deepEqual(routeStudioGroupMembers(members, "@acp:local-agent please check"), [
    "acp:local-agent",
  ]);
  assert.deepEqual(routeStudioGroupMembers(members, "@OpenCode please check"), ["opencode"]);
  assert.deepEqual(routeStudioGroupMembers(members, "@Qoder CN please check"), ["qoder-cn"]);
  const agyGroup = { ...group, members: ["knorvia", "antigravity"], host: "knorvia" } as const;
  assert.deepEqual(routeStudioGroupMembers(agyGroup, "@Google Antigravity please check"), ["antigravity"]);
  assert.throws(() => routeStudioGroupMembers(members, "@qoder please check"));
  const largerGroup = {
    ...group,
    members: [
      "knorvia",
      "codex",
      "claude-code",
      "grok-build",
      "opencode",
      "qoder",
      "gemini-cli",
      "goose",
      "kimi-cli",
      "copilot",
    ],
    host: "knorvia",
  } as const;
  assert.deepEqual(validateStudioGroup(largerGroup), []);
  assert.doesNotThrow(() =>
    validateStudioCommand({ commandId: "large-group", type: "save-group", group: largerGroup }),
  );
  const graph = workflow(
    ["start", "agent", "end"],
    [
      [0, 1],
      [1, 2],
    ],
  );
  graph.nodes[1]!.data.kernel = "acp:local-agent";
  assert.deepEqual(validateStudioWorkflow(graph), []);
  graph.nodes[1]!.data.kernel = "acp:bad/path";
  assert.match(validateStudioWorkflow(graph).join(" "), /Invalid node configuration/);
});

test("model selection rejects control characters before reaching a native CLI", () => {
  assert.doesNotThrow(() => validModel("native-model-v1"));
  assert.throws(() => validModel("native\nmodel"), /无效模型标识/);
  assert.throws(() => validModel("x".repeat(257)), /无效模型标识/);
});

test("custom ACP configuration is persisted and appears in overview", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "knorvia-kernel-expansion-")), "runtime.sqlite");
  const open = () =>
    new StudioRuntimeService({
      db: new StudioDatabase(path),
      clock: { now: () => 1, id: () => "test-id", delay: async () => {} },
      kernels: {
        adapter: () => ({
          run: async () => ({ status: "succeeded", text: "", resultKnown: true }),
        }),
        inspect: async () => [],
        manage: async () => {
          throw new Error("unused");
        },
        dispose: async () => {},
      },
      workspaces: {
        prepare: async ({ sourcePath }) => sourcePath,
        changes: async () => [],
        apply: async () => {},
      },
      onDidChange: Event.None,
      notify: () => {},
    });
  const first = open();
  await first.command({
    commandId: "cfg-1",
    type: "configure",
    kernel: "acp:local-agent",
    config: { executablePath: "", permission: "ask" },
  });
  await first.disposeAllAndWait();
  const reopened = open();
  assert.deepEqual((await reopened.overview()).configs["acp:local-agent"], {
    executablePath: "",
    permission: "ask",
  });
  await reopened.disposeAllAndWait();
});
