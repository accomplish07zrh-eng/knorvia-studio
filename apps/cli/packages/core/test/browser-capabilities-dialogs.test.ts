// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type {
  BrowserCommand,
  BrowserCommandResult,
  BrowserDialog,
} from "@knorvia/contracts/browser-control";
import {
  BrowserCapabilityCollection,
  BrowserRecordingAPI,
  Tab,
} from "../src/browser-client/facade.js";
import { BrowserCommandError } from "../src/browser-client/result.js";
const clean = (value: unknown) => JSON.parse(JSON.stringify(value));

test("tab capability descriptors do not expose browser-global visibility control", async () => {
  const calls: BrowserCommand[] = [];
  const tab = new Tab(
    async (command) => {
      calls.push(command);
      return { ok: true, elapsedMs: 0, value: true };
    },
    "tab",
    undefined,
    [{ id: "visibility", description: "Documentation only" }],
  );
  const capability = await tab.capabilities.get("visibility");
  assert.equal(typeof capability.get, "undefined");
  assert.equal(typeof capability.set, "undefined");
  assert.equal(calls.length, 0);
});

test("capability list returns copies, get follows live declarations and documents the selected id", async () => {
  let allowed = true;
  let descriptors = [{ id: "fixture", description: "Fixture" }];
  const docs: string[] = [];
  const caps = new BrowserCapabilityCollection(
    () => descriptors,
    (name) => {
      docs.push(name!);
      return "Documentation";
    },
    undefined,
    () => {
      if (!allowed) throw new Error("unavailable");
    },
  );
  const list = await caps.list();
  list[0]!.description = "Changed";
  assert.equal(descriptors[0]!.description, "Fixture");
  const cap = await caps.get("fixture");
  assert.equal(cap.id, "fixture");
  assert.equal(cap.description, "Fixture");
  assert.equal(await cap.documentation(), "Documentation");
  assert.deepEqual(docs, ["fixture"]);
  descriptors = [];
  await assert.rejects(caps.get("fixture"), /Browser capability 'fixture' is unavailable/);
  allowed = false;
  await assert.rejects(caps.list(), /unavailable/);
  await assert.rejects(caps.get("fixture"), /unavailable/);
});

test("visibility capability requires a transport and a boolean reply", async () => {
  const descriptors = [{ id: "visibility", description: "Visibility" }];
  const generic = await new BrowserCapabilityCollection(
    () => descriptors,
    () => "",
  ).get("visibility");
  assert.equal(typeof generic.get, "undefined");
  const calls: BrowserCommand[] = [];
  const result: BrowserCommandResult = { ok: true, elapsedMs: 0, value: false };
  const caps = new BrowserCapabilityCollection(
    () => descriptors,
    () => "",
    async (command) => {
      calls.push(command);
      return result;
    },
  );
  const visibility = await caps.get("visibility");
  assert.equal(await visibility.get(), false);
  result.value = true;
  assert.equal(await visibility.get(), true);
  await visibility.set(false);
  assert.deepEqual(calls, [
    { method: "browserVisibilityGet" },
    { method: "browserVisibilityGet" },
    { method: "browserVisibilitySet", visible: false },
  ]);
  result.value = { visible: true };
  await assert.rejects(visibility.get(), /missing a boolean value/);
  result.ok = false;
  await assert.rejects(visibility.get(), BrowserCommandError);
});

test("recording APIs preserve options, require ids and require recording payloads", async () => {
  const calls: BrowserCommand[] = [];
  const result: BrowserCommandResult = {
    ok: true,
    elapsedMs: 0,
    recording: {
      id: "fixture",
      status: "running",
      phase: "capturing",
      progress: 0,
      startedAt: 1,
      updatedAt: 1,
    },
  };
  const recording = new BrowserRecordingAPI(async (command) => {
    calls.push(command);
    return result;
  });
  assert.equal(await recording.start({ fps: 24, showCursor: true }), result.recording);
  assert.equal(await recording.status(" id ", { outputPath: "fixture.webm" }), result.recording);
  assert.equal(await recording.cancel(" id "), result.recording);
  assert.deepEqual(calls, [
    { method: "recordingStart", options: { fps: 24, showCursor: true } },
    { method: "recordingStatus", recordingId: " id ", outputPath: "fixture.webm" },
    { method: "recordingCancel", recordingId: " id " },
  ]);
  await assert.rejects(recording.status(""), /recording.status requires a recording id/);
  await assert.rejects(recording.cancel(""), /recording.cancel requires a recording id/);
  assert.equal(calls.length, 3);
  delete result.recording;
  await assert.rejects(recording.start(), /Browser result missing recording/);
});

test("dialog objects expose only responses available for their dialog kind", async () => {
  const calls: BrowserCommand[] = [];
  const result: BrowserCommandResult = { ok: true, elapsedMs: 0 };
  const tab = new Tab(async (command) => {
    calls.push(command);
    return result;
  }, "tab");
  assert.equal(await tab.getJsDialog(), undefined);
  for (const type of ["alert", "confirm", "prompt", "beforeunload"] as const) {
    result.dialog = { type, message: "Fixture", defaultPrompt: "value" };
    const dialog = await tab.getJsDialog();
    assert.ok(dialog);
    assert.equal(dialog.type, type);
    await dialog.dismiss();
    assert.deepEqual(clean(calls.at(-1)), { method: "handleDialog", accept: false, tabId: "tab" });
    if (dialog.type === "confirm") await dialog.accept();
    if (dialog.type === "prompt") await dialog.accept("answer");
    if (type === "alert" || type === "beforeunload") assert.equal("accept" in dialog, false);
  }
  const responses = calls.filter((command) => command.method === "handleDialog");
  assert.equal(responses.length, 6);
  assert.ok(responses.some((command) => command.accept && command.promptText === "answer"));
  for (const type of ["unknown", "constructor", "toString", "__proto__"]) {
    result.dialog = { type: type as BrowserDialog["type"], message: "Fixture" };
    assert.equal((await tab.getJsDialog())!.type, "alert");
  }
});
