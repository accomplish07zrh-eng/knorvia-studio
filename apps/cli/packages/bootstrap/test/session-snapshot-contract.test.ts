import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { KnorviaApp } from "../src/app/types.js";
import { appFixture, filePart, goal, message, projection } from "./session-projection-fixture.js";

let slashRead: (options: unknown) => Promise<unknown[]> = async () => [];
mock.module(new URL("../src/protocol/slash-commands.ts", import.meta.url).href, {
  namedExports: { listProtocolSlashCommands: (options: unknown) => slashRead(options) },
});
const { buildSessionSnapshot } = await import("../src/protocol/session-mapper.js");
const checkpoint = () => new Promise<void>((resolve) => setImmediate(resolve));

test("snapshot awaits image hydration and settings before slash discovery and late goal stats", async () => {
  const target = goal();
  const f = appFixture(projection({ target }));
  let releaseImage!: (value: Awaited<ReturnType<KnorviaApp["readToolResultArtifact"]>>) => void;
  f.app.readToolResultArtifact = () => {
    f.calls.push("artifact");
    return new Promise((resolve) => { releaseImage = resolve; });
  };
  let releaseSlash!: () => void;
  let slashOptions: unknown;
  slashRead = async (options) => {
    f.calls.push("slash");
    slashOptions = options;
    await new Promise<void>((resolve) => { releaseSlash = resolve; });
    return [];
  };
  const input = {
    app: f.app, messages: [message("assistant", 200, [filePart()])],
    eventSeq: 5, stateRevision: 6, workspace: { workspacePath: "fixture-workspace" },
    slashCommandOptions: { workingDirectory: "must-be-overridden" },
  };
  const pending = buildSessionSnapshot(input);
  await checkpoint();
  assert.deepEqual(f.calls, ["projection", "active", "artifact"]);
  releaseImage({ uri: "knorvia-artifact://fixture-session/image", content: "AA==", contentType: "image/png", bytes: 4 });
  await checkpoint();
  assert.ok(f.calls.indexOf("levels") > f.calls.indexOf("artifact"));
  assert.ok(f.calls.indexOf("slash") > f.calls.indexOf("selection"));
  assert.equal((slashOptions as Record<string, unknown>).workingDirectory, "fixture-workspace");
  target.tokensUsed = 70;
  releaseSlash();
  const output = await pending;
  assert.equal(output.goalStats?.tokensUsed, 70);
  assert.equal(output.projection.target?.tokensUsed, 0);
  assert.deepEqual(Object.keys(output), ["messages", "projection", "protocol", "runtime", "session", "settings", "slashCommands", "goalStats", "todos", "todoGroups"]);
});

test("snapshot DB target null overrides stale runtime target and avoids stale active turn fallback", async () => {
  const f = appFixture(projection({ target: goal(), currentTurnId: "stale-turn" as NonNullable<ReturnType<typeof projection>["currentTurnId"]> }));
  slashRead = async () => [];
  const result = await buildSessionSnapshot({
    app: f.app, messages: [], eventSeq: 0, stateRevision: 1, target: null,
    fallbackCreatedAt: 2, fallbackUpdatedAt: 3, workspace: { workspacePath: "fixture-workspace" },
  });
  assert.equal(result.projection.target, null);
  assert.equal(result.session.target, null);
  assert.equal(result.goalStats, undefined);
  assert.equal(result.runtime.activeTurnId, undefined);
  assert.equal(result.session.createdAt, 2);
  assert.equal(result.session.updatedAt, 3);
  assert.ok(f.state.target);
});
