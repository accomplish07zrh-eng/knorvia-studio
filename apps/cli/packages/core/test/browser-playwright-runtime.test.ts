// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BrowserCommand, BrowserCommandResult } from "@knorvia/contracts/browser-control";
import {
  createPlaywrightAPI,
  configurePlaywrightObjectWrapper,
  PlaywrightDownload,
  PlaywrightFileChooser,
} from "../src/browser-client/playwright.js";
import { BrowserCommandError } from "../src/browser-client/result.js";

const clean = (value: unknown) => JSON.parse(JSON.stringify(value));
function fixture(value: unknown = null) {
  const commands: BrowserCommand[] = [];
  const result: BrowserCommandResult = { ok: true, elapsedMs: 0, value };
  const run = async (command: BrowserCommand) => {
    commands.push(command);
    return result;
  };
  return { api: createPlaywrightAPI(run), run, commands, result };
}

test("wait methods only forward their specific protocol fields", async () => {
  const f = fixture();
  await f.api.waitForURL("https://example.test/", { timeoutMs: 37, waitUntil: "commit" });
  await f.api.waitForLoadState({ timeoutMs: 38, state: "domcontentloaded" });
  await f.api.waitForTimeout(39);
  assert.deepEqual(clean(f.commands), [
    {
      method: "playwright",
      action: {
        name: "waitForURL",
        url: "https://example.test/",
        timeoutMs: 37,
        waitUntil: "commit",
      },
    },
    {
      method: "playwright",
      action: { name: "waitForLoadState", timeoutMs: 38, state: "domcontentloaded" },
    },
    { method: "playwrightWaitForTimeout", timeoutMs: 39 },
  ]);
});

test("navigation starts the action and waiting together and returns the action value", async () => {
  const events: string[] = [];
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const api = createPlaywrightAPI(async (command) => {
    events.push("wait");
    assert.equal(command.method, "playwright");
    finish();
    return { ok: true, elapsedMs: 0 };
  });
  const value = { done: true };
  const returned = await api.expectNavigation(async () => {
    events.push("action");
    await pending;
    events.push("action-finished");
    return value;
  });
  assert.equal(returned, value);
  assert.deepEqual(events, ["wait", "action", "action-finished"]);
});

test("navigation wait selection preserves URL and load-state options", async () => {
  const f = fixture();
  await f.api.expectNavigation(async () => 42, { timeoutMs: 37, waitUntil: "domcontentloaded" });
  await f.api.expectNavigation(async () => 42, {
    url: "https://example.test/",
    timeoutMs: 38,
    waitUntil: "load",
  });
  assert.deepEqual(clean(f.commands), [
    {
      method: "playwright",
      action: { name: "waitForLoadState", timeoutMs: 37, state: "domcontentloaded" },
    },
    {
      method: "playwright",
      action: {
        name: "waitForURL",
        url: "https://example.test/",
        timeoutMs: 38,
        waitUntil: "load",
      },
    },
  ]);
});

test("a wait failure does not cancel or replay the caller action", async () => {
  let calls = 0,
    completed = false,
    finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const api = createPlaywrightAPI(async () => ({
    ok: false,
    elapsedMs: 0,
    error: { code: "execution_error", message: "wait failed" },
  }));
  await assert.rejects(
    api.expectNavigation(async () => {
      calls++;
      await pending;
      completed = true;
    }),
    BrowserCommandError,
  );
  assert.equal(calls, 1);
  assert.equal(completed, false);
  finish();
  await pending;
  await Promise.resolve();
  assert.equal(completed, true);
  assert.equal(calls, 1);
});

test("a synchronous navigation action failure still observes later wait rejection", async () => {
  const moduleUrl = new URL("../src/browser-client/playwright.ts", import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import {setImmediate} from 'node:timers/promises';
    import {createPlaywrightAPI} from ${JSON.stringify(moduleUrl)};
    let rejectWait;
    const api = createPlaywrightAPI(() => new Promise((_, reject) => { rejectWait = reject; }));
    await assert.rejects(api.expectNavigation(() => { throw new Error('action failed'); }), /action failed/);
    rejectWait(new Error('wait failed'));
    await setImmediate();
    await setImmediate();
    process.stdout.write('wait observed');
  `;
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ["--unhandled-rejections=strict", "--import", "tsx", "--input-type=module", "-e", script],
    { timeout: 15_000 },
  );
  assert.equal(stdout, "wait observed");
});

test("download and file chooser events bind their IDs to subsequent operations", async () => {
  const f = fixture({ id: "download-1" });
  const download = await f.api.waitForEvent("download", { timeoutMs: 37 });
  f.result.value = "fixture/download.bin";
  assert.equal(await download.path({ timeoutMs: 38 }), "fixture/download.bin");
  f.result.value = { id: "chooser-1", isMultiple: true };
  const chooser = await f.api.waitForEvent("filechooser");
  assert.equal(chooser.isMultiple(), true);
  await chooser.setFiles("fixture.txt", { timeoutMs: 39 });
  assert.deepEqual(clean(f.commands), [
    { method: "playwright", action: { name: "waitForEvent", event: "download", timeoutMs: 37 } },
    {
      method: "playwright",
      action: { name: "downloadPath", downloadId: "download-1", timeoutMs: 38 },
    },
    { method: "playwright", action: { name: "waitForEvent", event: "filechooser" } },
    {
      method: "playwright",
      action: {
        name: "fileChooserSetFiles",
        fileChooserId: "chooser-1",
        files: ["fixture.txt"],
        timeoutMs: 39,
      },
    },
  ]);
});

test("direct event handles preserve null paths, array file inputs and false multiple state", async () => {
  const f = fixture();
  const download = new PlaywrightDownload(f.run, "download-1");
  assert.equal(await download.path(), null);
  const chooser = new PlaywrightFileChooser(f.run, "chooser-1", false);
  assert.equal(chooser.isMultiple(), false);
  await chooser.setFiles(["first.txt", "second.txt"]);
  assert.deepEqual(clean(f.commands.at(-1)), {
    method: "playwright",
    action: {
      name: "fileChooserSetFiles",
      fileChooserId: "chooser-1",
      files: ["first.txt", "second.txt"],
    },
  });
  const count = f.commands.length;
  await assert.rejects(chooser.setFiles([]), /fileChooser.setFiles requires at least one file/);
  await assert.rejects(
    chooser.setFiles(undefined as unknown as string),
    /fileChooser.setFiles requires files/,
  );
  assert.equal(f.commands.length, count);
});

test("event handles expose operations without enumerable implementation state", async () => {
  const f = fixture({ id: "fixture", isMultiple: true });
  const download = await f.api.waitForEvent("download");
  const chooser = await f.api.waitForEvent("filechooser");
  assert.deepEqual(Object.keys(download), []);
  assert.deepEqual(Object.keys(chooser), []);
  assert.equal("downloadId" in download, false);
  assert.equal("fileChooserId" in chooser, false);
  assert.equal(typeof download.path, "function");
  assert.equal(typeof chooser.setFiles, "function");
  assert.equal(chooser.isMultiple(), true);
});

test("file chooser failures preserve cause and add the operation name", async () => {
  const f = fixture();
  f.result.ok = false;
  f.result.error = { code: "execution_error", message: "fixture failed" };
  await assert.rejects(new PlaywrightFileChooser(f.run, "id", false).setFiles("file"), (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "fixture failed\nfileChooser.setFiles failed");
    assert.ok(error.cause instanceof BrowserCommandError);
    return true;
  });
});

test("unsupported event names fail without dispatch", async () => {
  const f = fixture();
  await assert.rejects(
    f.api.waitForEvent("other" as "download"),
    /only supports 'download' and 'filechooser'/,
  );
  assert.equal(f.commands.length, 0);
});

test("object policy injection wraps the API and every subsequently created handle", async () => {
  const f = fixture({ id: "fixture", isMultiple: true });
  const wrappers: string[] = [];
  const api = configurePlaywrightObjectWrapper(f.api, (value, name) => {
    wrappers.push(name);
    return new Proxy(value, {});
  });
  assert.notEqual(api, f.api);
  const first = api.locator("x");
  first.first();
  api.frameLocator("frame").getByText("hello");
  await api.waitForEvent("download");
  await api.waitForEvent("filechooser");
  assert.deepEqual(wrappers, [
    "PlaywrightAPI",
    "PlaywrightLocator",
    "PlaywrightLocator",
    "PlaywrightFrameLocator",
    "PlaywrightLocator",
    "PlaywrightDownload",
    "PlaywrightFileChooser",
  ]);
  assert.doesNotThrow(() => first.and(api.locator("y")));
});
