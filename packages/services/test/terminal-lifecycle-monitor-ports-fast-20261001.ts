// Closed synthetic adapters; the only real reads are installed dependency test-artifact bytes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { win32 } from "node:path";
import { runInNewContext } from "node:vm";
import { Emitter } from "@knorvia/rpc";
import type { IPty } from "node-pty";

const installedRoot = new URL("../../../node_modules/node-pty/", import.meta.url);
const [agentSource, packageSource] = await Promise.all([
  readFile(new URL("lib/windowsPtyAgent.js", installedRoot), "utf8"),
  readFile(new URL("package.json", installedRoot), "utf8"),
]);
export const installedAgentReceipt = {
  version: JSON.parse(packageSource).version as string,
  sha256: createHash("sha256").update(agentSource).digest("hex"),
};

/** Runs actual installed constructor/kill; every require and effectful global is owned fake. */
export function installedWinptyTeardown() {
  const state = { handle: true, nativeKills: 0, selected: "", opens: 0 };
  const native = {
    startProcess: () => ({
      pid: 101,
      innerPid: 102,
      fd: 103,
      pty: 104,
      conin: "owned-conin",
      conout: "owned-conout",
    }),
    getProcessList: () => 0,
    kill: () => {
      state.nativeKills++;
      if (!state.handle) throw new Error("Pty seems to have been killed already");
      state.handle = false;
    },
  };
  class Socket extends EventEmitter {
    setEncoding(value: string) {
      assert.equal(value, "utf8");
      return this;
    }
  }
  class ConoutConnection {
    constructor(pipe: string) {
      assert.equal(pipe, "owned-conout");
    }
    onReady(callback: () => void) {
      callback();
    }
    connectSocket(socket: Socket) {
      socket.emit("connect");
    }
  }
  const modules = new Map<string, unknown>([
    [
      "fs",
      {
        openSync: (pipe: string, mode: string) => {
          assert.equal(pipe, "owned-conin");
          assert.equal(mode, "w");
          state.opens++;
          return 105;
        },
      },
    ],
    ["os", { release: () => "10.0.17763" }],
    ["path", win32],
    ["child_process", { fork: () => assert.fail("no child process") }],
    ["net", { Socket }],
    ["./windowsConoutConnection", { ConoutConnection }],
    [
      "./utils",
      {
        loadNativeModule: (name: string) => {
          state.selected = name;
          assert.equal(name, "pty");
          return { module: native };
        },
      },
    ],
  ]);
  const exports: { WindowsPtyAgent?: new (...args: unknown[]) => { kill(): void } } = {};
  runInNewContext(
    agentSource,
    {
      exports,
      require: (name: string) => {
        assert.ok(modules.has(name), `unexpected require: ${name}`);
        return modules.get(name);
      },
      __dirname: "C:\\owned-synthetic-node-pty",
      process: { kill: () => assert.fail("no process kill") },
      setTimeout: () => assert.fail("no runtime timer"),
      clearTimeout: () => assert.fail("no runtime timer"),
    },
    { filename: "owned-installed-windowsPtyAgent.js" },
  );
  assert.ok(exports.WindowsPtyAgent);
  const agent = new exports.WindowsPtyAgent(
    "owned-shell.exe",
    [],
    [],
    "C:\\owned-synthetic-cwd",
    81,
    27,
    false,
    true,
    true,
  );
  assert.equal(state.selected, "pty");
  assert.equal(state.opens, 1);
  return { state, kill: () => agent.kill() };
}

/** Actual Emitter delivery is gated by acquired-handle disposal, unlike stored-callback fakes. */
export function monitoredPty() {
  const data = new Emitter<string>(),
    exit = new Emitter<{ exitCode: number }>();
  const state = {
    kills: 0,
    dataDisposals: 0,
    monitorDisposals: 0,
    monitorAfterUnsubscribe: false,
    deliveries: 0,
    writes: [] as string[],
    sizes: [] as number[][],
    kill: () => {},
    dataDispose: () => {},
    monitorDispose: () => {},
    registerExit: () => {},
  };
  const onData = (listener: (value: string) => void) => {
    const handle = data.event(listener);
    return {
      dispose: () => {
        state.dataDisposals++;
        state.dataDispose();
        handle.dispose();
      },
    };
  };
  const onExit = (listener: (value: { exitCode: number }) => void) => {
    const handle = exit.event((value) => {
      state.deliveries++;
      listener(value);
    });
    state.registerExit();
    return {
      dispose: () => {
        state.monitorDisposals++;
        if (state.monitorAfterUnsubscribe) handle.dispose();
        state.monitorDispose();
        handle.dispose();
      },
    };
  };
  const pty = {
    onData,
    onExit,
    kill: () => {
      state.kills++;
      state.kill();
    },
    write: (value: string) => state.writes.push(value),
    resize: (cols: number, rows: number) => state.sizes.push([cols, rows]),
  } as unknown as IPty;
  return {
    pty,
    state,
    onData,
    onExit,
    data: (value: string) => data.fire(value),
    exit: (exitCode: number) => exit.fire({ exitCode }),
  };
}
