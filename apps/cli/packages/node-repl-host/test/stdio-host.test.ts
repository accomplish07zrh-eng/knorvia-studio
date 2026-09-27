// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import type { Server } from "@modelcontextprotocol/server";

let factory: () => Server;
let settings: unknown;
let closeTransport: () => Promise<void>;
mock.module("@modelcontextprotocol/server/stdio", {
  namedExports: {
    serveStdio: (create: () => Server, options: unknown) => {
      factory = create;
      settings = options;
      return { close: () => closeTransport() };
    },
  },
});
const { startStdioHost } = await import("../src/stdio-host.js");

test("stdio host owns each runtime and waits for all disposals before closing transport", async () => {
  const source = new EventEmitter(),
    stdin = new EventEmitter();
  const gate = Promise.withResolvers<void>(),
    exited = Promise.withResolvers<void>();
  const events: string[] = [],
    servers = [{}, {}];
  let created = 0;
  closeTransport = async () => {
    events.push("transport");
  };
  startStdioHost(
    () => {
      const id = created++;
      return {
        server: servers[id] as Server,
        dispose: async () => {
          events.push(`dispose:${id}`);
          if (id === 0) await gate.promise;
        },
      };
    },
    {
      process: source as NodeJS.Process,
      stdin: stdin as NodeJS.ReadStream,
      writeStderr: () => assert.fail("No diagnostic"),
      exit: () => {
        events.push("exit");
        exited.resolve();
      },
    },
  );
  assert.equal(factory(), servers[0]);
  assert.equal(factory(), servers[1]);
  assert.deepEqual(settings, { legacy: "reject" });
  source.emit("SIGTERM");
  stdin.emit("end");
  source.emit("SIGINT");
  try {
    await setImmediate();
    assert.deepEqual([...events], ["dispose:0", "dispose:1"]);
    assert.throws(() => factory(), /closing/);
  } finally {
    gate.resolve();
    await exited.promise;
  }
  assert.deepEqual(events, ["dispose:0", "dispose:1", "transport", "exit"]);
});

for (const throws of [false, true]) {
  test(`stdio shutdown includes an in-flight constructor (${throws ? "throws" : "returns"})`, async () => {
    const source = new EventEmitter(),
      stdin = new EventEmitter();
    const exited = Promise.withResolvers<void>(),
      events: string[] = [];
    closeTransport = async () => {
      events.push("transport");
    };
    startStdioHost(
      () => {
        source.emit("SIGTERM");
        if (throws) throw new Error("constructor failed");
        return {
          server: {} as Server,
          dispose: async () => {
            events.push("dispose");
          },
        };
      },
      {
        process: source as NodeJS.Process,
        stdin: stdin as NodeJS.ReadStream,
        writeStderr: () => assert.fail("No diagnostic"),
        exit: () => {
          events.push("exit");
          exited.resolve();
        },
      },
    );
    try {
      assert.throws(() => factory(), throws ? /constructor failed/ : /closing/);
    } finally {
      await exited.promise;
    }
    assert.deepEqual(events, throws ? ["transport", "exit"] : ["dispose", "transport", "exit"]);
  });
}

test("stdio host output loss releases every runtime even if one cleanup throws synchronously", async () => {
  const source = new EventEmitter(),
    stdin = new EventEmitter(),
    exited = Promise.withResolvers<void>();
  const events: string[] = [];
  let created = 0;
  closeTransport = async () => {
    events.push("transport");
    throw new Error("transport already closed");
  };
  startStdioHost(
    () => {
      const id = created++;
      return {
        server: {} as Server,
        dispose: () => {
          events.push(`dispose:${id}`);
          if (id === 0) throw new Error("cleanup");
          return Promise.resolve();
        },
      };
    },
    {
      process: source as NodeJS.Process,
      stdin: stdin as NodeJS.ReadStream,
      writeStderr: () => assert.fail("Broken output should close"),
      exit: (code) => {
        assert.equal(code, 0);
        events.push("exit");
        exited.resolve();
      },
    },
  );
  factory();
  factory();
  source.emit("uncaughtException", Object.assign(new Error("closed"), { code: "EPIPE" }));
  stdin.emit("close");
  source.emit("SIGTERM");
  await exited.promise;
  assert.deepEqual(events, ["dispose:0", "dispose:1", "transport", "exit"]);
});
