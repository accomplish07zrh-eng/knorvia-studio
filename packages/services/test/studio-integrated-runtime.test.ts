// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  HANDOFF_FIELD_KEYS,
  editHandoffRecord,
  handoffScopeKey,
  type HandoffFieldKey,
} from "@knorvia/shared";
import type { IKnorviaTaskService, StudioMessage } from "../src/index.js";
import { createStudioRuntimeService } from "../src/studio-runtime/node.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { createStudioAgentStore } from "../../ui/src/store/studioAgentStore.js";
import { emptyStudioAgentData } from "../../ui/src/studio/agents/agentDrafts.js";
import { captureHandoffGoal } from "../../ui/src/studio/agents/taskHandoff.js";
import {
  buildStudioHandoffDraft,
  performStudioHandoff,
} from "../../ui/src/studio/agents/sessionHandoff.js";

async function waitFor<T>(read: () => Promise<T>, ready: (value: T) => boolean): Promise<T> {
  for (let i = 0; i < 300; i++) {
    const value = await read();
    if (ready(value)) return value;
    await delay(25);
  }
  throw new Error("Integrated runtime did not reach the expected state");
}

test(
  "production discovery, reloaded handoff, MCP dispatch, workspace service and durable ACK compose",
  { timeout: 30000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "knorvia-integrated-runtime-"));
    let teardown = async () => {};
    t.after(async () => {
      try {
        await teardown();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
    const source = join(root, "source");
    await mkdir(source);
    await writeSource(source);
    const executablePath = join(root, "provider-fixture.cjs");
    await copyFile(
      new URL("studio-integrated-provider.fixture.cjs", import.meta.url),
      executablePath,
    );
    const { configs, drafts } = emptyStudioAgentData();
    let stored = JSON.stringify({ version: 1, data: { configs, drafts } });
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };
    const scope = { sessionId: "source", kernelId: "claude-code", workspacePath: source };
    const message: StudioMessage = {
      id: "original",
      targetId: "source",
      runId: "source-run",
      sender: "user",
      kind: "text",
      text: "Preserve the original goal and customer data. OPENAI_API_KEY=sk-synthetic-review-key-long-enough",
      createdAt: 1,
      updatedAt: 1,
    };
    const owner = createStudioAgentStore(storage);
    owner.getState().saveDraft("legacy-draft", "codex", "Keep the existing composer draft");
    const captured = captureHandoffGoal({ scope, historyStartKnown: true }, [message]);
    const fields = Object.fromEntries(
      HANDOFF_FIELD_KEYS.map((key) => [key, captured.fields[key]?.text ?? ""]),
    ) as Record<HandoffFieldKey, string>;
    fields.constraints = "Keep approvals and source files intact";
    fields.decisions = "Use an isolated workspace";
    fields.progress = "Original goal reviewed";
    fields.failedAttempts = "Previous attempt did not retain the goal";
    fields.remainingSteps = "Create a report and verify its service";
    fields.acceptanceCriteria = "Report, source continuity and loopback readiness";
    fields.uncertainty = "No real model acceptance performed";
    assert.equal(owner.getState().saveHandoff(editHandoffRecord(captured, fields, [])), true);
    const reloaded = createStudioAgentStore(storage).getState();
    assert.equal(reloaded.drafts["legacy-draft"]?.text, "Keep the existing composer draft");
    const record = reloaded.handoffs[handoffScopeKey(scope)]!;
    const draft = buildStudioHandoffDraft([], "Claude", false, {
      scope,
      record,
      historyStartKnown: false,
    });
    assert.match(draft.text, /Preserve the original goal and customer data/);
    assert.match(draft.text, /omitted count unknown/);
    assert(!stored.includes("sk-synthetic-review-key-long-enough"));
    assert(!draft.text.includes("sk-synthetic-review-key-long-enough"));

    const dataDir = join(root, "data");
    const service = createStudioRuntimeService({
      dataDir,
      taskService: {} as IKnorviaTaskService,
      skillsService: {
        list: async () => ({
          skills: [],
          diagnostics: [],
          capability: { userScopeAvailable: true },
        }),
        buildPromptContext: async ({ prompt }) => ({ prompt, activatedSkillNames: [] }),
      },
      mcpSyncService: { loadMcpFromUserDirectory: async () => ({ servers: [] }) },
      pluginManagementService: { listPlugins: async () => ({ plugins: [], diagnostics: [] }) },
    });
    let disposed = false;
    teardown = async () => {
      if (!disposed) await service.disposeAllAndWait();
    };
    await service.command({
      commandId: "configure",
      type: "configure",
      kernel: "codex",
      config: { executablePath, model: "integration-model", permission: "full-access" },
    });
    const discovered = await service.inspectKernels();
    assert(discovered.some((status) => status.id === "codex" && status.installed && !status.error));
    const sent = await performStudioHandoff(service, {
      targetId: "integration-parent",
      sourceKernel: "claude-code",
      targetKernel: "codex",
      workspacePath: source,
      text: draft.text,
    });
    const completed = await waitFor(
      () => service.overview(),
      (view) =>
        ["succeeded", "failed", "waiting"].includes(
          view.runs.find((run) => run.id === sent.id)?.state ?? "",
        ),
    );
    const parent = completed.runs.find((run) => run.id === sent.id)!;
    assert.equal(parent.state, "succeeded", parent.error);
    const observed = JSON.parse(
      await readFile(join(source, "integration-observation.json"), "utf8"),
    );
    assert.equal(observed.ack.delivery, "acked");
    assert.equal(observed.result.results[0].result.text, "integration child completed");
    assert.equal(observed.result.artifacts.length, 1);
    assert.equal(observed.result.artifacts[0].path, "report.txt");
    const childWorkspace = observed.result.workspaces[0];
    assert.notEqual(childWorkspace.path, source);
    assert.equal(
      await readFile(join(childWorkspace.path, "report.txt"), "utf8"),
      "isolated child report\n",
    );
    await assert.rejects(readFile(join(source, "report.txt")), { code: "ENOENT" });
    await assert.rejects(readFile(join(childWorkspace.path, ".env")), { code: "ENOENT" });

    const request = (control?: Parameters<typeof service.workspaceRuntime>[0]["control"]) =>
      service.workspaceRuntime({
        runId: observed.accepted.runId,
        stepId: "reply",
        ...(control ? { control } : {}),
      });
    const names = [
      "GH_TOKEN",
      "OPENAI_API_KEY",
      "AWS_SECRET_ACCESS_KEY",
      "KNORVIA_TOOL_ENV_PASSTHROUGH_JSON",
    ];
    const previous = names.map((name) => [name, process.env[name]] as const);
    for (const name of names) process.env[name] = "synthetic-integration-env";
    t.after(() => {
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    });
    const report = `JSON.stringify(Object.fromEntries(${JSON.stringify(names)}.map(k=>[k,process.env[k]!==undefined])))`;
    await request({
      action: "prepare",
      approved: true,
      command: {
        executable: process.execPath,
        args: ["-e", `require('fs').writeFileSync('setup-env.json',${report})`],
      },
    });
    await waitFor(
      () => request(),
      (state) => state.phase === "prepared",
    );
    await request({
      action: "start",
      approved: true,
      command: {
        executable: process.execPath,
        args: [
          "-e",
          `require('fs').writeFileSync('service-env.json',${report});require('http').createServer((q,r)=>r.end('integration ready')).listen(Number(process.env.PORT),process.env.HOST)`,
        ],
      },
      timeoutMs: 5000,
    });
    const ready = await waitFor(
      () => request(),
      (state) => state.phase === "ready",
    );
    assert.equal(await (await fetch(ready.previewUrl!)).text(), "integration ready");
    for (const name of ["setup-env.json", "service-env.json"])
      assert.deepEqual(
        JSON.parse(await readFile(join(childWorkspace.path, name), "utf8")),
        Object.fromEntries(names.map((key) => [key, false])),
      );
    await request({ action: "stop" });
    assert.equal((await request()).phase, "stopped");
    assert.equal(await readFile(join(source, "README.txt"), "utf8"), "Preserve the source\n");
    const timeline = await service.timeline("integration-parent");
    assert.equal(timeline.messages.filter((message) => message.id === observed.event.id).length, 1);
    assert(!JSON.stringify(observed).includes("sk-synthetic-review-key-long-enough"));
    await service.disposeAllAndWait();
    disposed = true;
    const reopened = new StudioDatabase(join(dataDir, "studio", "studio.sqlite"));
    try {
      assert.equal(reopened.list("agent-task", { all: true }).length, 1);
      assert.equal(
        reopened.list<{ delivery: string }>("agent-event", { all: true })[0]?.delivery,
        "acked",
      );
      assert.equal(reopened.list("run", { all: true }).length, 2);
    } finally {
      reopened.close();
    }
  },
);

async function writeSource(source: string) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(source, "README.txt"), "Preserve the source\n");
  await writeFile(join(source, ".env"), "SYNTHETIC_SECRET=never-copy\n");
}
