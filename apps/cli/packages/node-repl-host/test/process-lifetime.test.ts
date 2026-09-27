// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  installNodeReplProcessGuards,
  installNodeReplShutdownTriggers,
  isDirectMcpEntrypoint,
} from "../src/process-lifecycle.js";

function processFixture(write?: (text: string) => void) {
  const events = new EventEmitter(),
    messages: string[] = [],
    closed: Error[] = [];
  const input = {
    process: events as unknown as Pick<NodeJS.Process, "on">,
    onOutputClosed: (error: Error) => {
      closed.push(error);
    },
    writeStderr:
      write ??
      ((text: string) => {
        messages.push(text);
      }),
  };
  installNodeReplProcessGuards(input);
  return { events, messages, closed, input };
}

test("REPL process guards install once per process and ordinary errors keep reporting", () => {
  const fixture = processFixture();
  installNodeReplProcessGuards({
    ...fixture.input,
    onOutputClosed: () => assert.fail("Second owner"),
    writeStderr: () => assert.fail("Second writer"),
  });
  assert.equal(fixture.events.listenerCount("uncaughtException"), 1);
  assert.equal(fixture.events.listenerCount("unhandledRejection"), 1);
  fixture.events.emit("uncaughtException", new Error("first"));
  fixture.events.emit("unhandledRejection", "second");
  assert.equal(fixture.closed.length, 0);
  assert.equal(fixture.messages.length, 2);
  assert.match(fixture.messages[0], /^Knorvia execution host: .*first/s);
  assert.match(fixture.messages[1], /second/);
  const another = processFixture();
  another.events.emit("uncaughtException", new Error("independent"));
  assert.equal(another.messages.length, 1);
});

test("REPL process output failure codes close once and preserve the original error", () => {
  for (const code of ["EPIPE", "EIO", "ENXIO", "EBADF", "ERR_STREAM_DESTROYED"]) {
    const fixture = processFixture(),
      error = Object.assign(new Error("output failed"), { code });
    fixture.events.emit("uncaughtException", error);
    fixture.events.emit("unhandledRejection", error);
    fixture.events.emit("uncaughtException", new Error("later"));
    assert.deepEqual(fixture.closed, [error]);
    assert.deepEqual(fixture.messages, []);
  }
});

test("REPL stderr failures close exactly once and ordinary code values are diagnostic only", () => {
  const reason = new Error("stderr unavailable"),
    fixture = processFixture(() => {
      throw reason;
    });
  fixture.events.emit("uncaughtException", new Error("trigger"));
  fixture.events.emit("unhandledRejection", new Error("late"));
  assert.deepEqual(fixture.closed, [reason]);
  const ordinary = processFixture();
  ordinary.events.emit("uncaughtException", Object.assign(new Error("other"), { code: "ENOENT" }));
  assert.equal(ordinary.messages.length, 1);
  assert.equal(ordinary.closed.length, 0);
});

test("REPL process guards contain unprintable rejection reasons", () => {
  const fixture = processFixture();
  assert.doesNotThrow(() => fixture.events.emit("unhandledRejection", Object.create(null)));
  assert.equal(fixture.messages.length, 1);
  assert.equal(fixture.closed.length, 0);
});

test("REPL process guards contain unprintable stderr failures and still close", () => {
  const fixture = processFixture(() => {
    throw Object.create(null);
  });
  assert.doesNotThrow(() => fixture.events.emit("uncaughtException", new Error("fixture")));
  assert.equal(fixture.closed.length, 1);
  assert.ok(fixture.closed[0] instanceof Error);
});

test("REPL shutdown triggers share one callback across signals and stream closure", () => {
  for (const first of ["SIGINT", "SIGTERM", "end", "close"]) {
    const host = new EventEmitter(),
      stdin = new EventEmitter();
    let calls = 0;
    installNodeReplShutdownTriggers({
      process: host as unknown as Pick<NodeJS.Process, "once">,
      stdin: stdin as unknown as Pick<NodeJS.ReadStream, "once">,
      shutdown: () => {
        calls++;
      },
    });
    (first.startsWith("SIG") ? host : stdin).emit(first);
    host.emit("SIGINT");
    host.emit("SIGTERM");
    stdin.emit("end");
    stdin.emit("close");
    assert.equal(calls, 1);
  }
});

test("REPL direct entry detection accepts the same real path and rejects absent or invalid paths", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-entry-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = join(directory, "first.mjs"),
    other = join(directory, "other.mjs");
  await Promise.all([writeFile(first, "export {};\n"), writeFile(other, "export {};\n")]);
  const url = pathToFileURL(first).href;
  assert.equal(await isDirectMcpEntrypoint(url, first), true);
  assert.equal(await isDirectMcpEntrypoint(url, other), false);
  assert.equal(await isDirectMcpEntrypoint(url, undefined), false);
  assert.equal(await isDirectMcpEntrypoint(url, join(directory, "absent.mjs")), false);
  assert.equal(await isDirectMcpEntrypoint("invalid URL", first), false);
});
