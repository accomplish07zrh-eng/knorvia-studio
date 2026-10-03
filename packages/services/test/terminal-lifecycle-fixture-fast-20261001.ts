// Owned virtual ports only. No real PTY, profile, command, filesystem or permission operations.
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { after, beforeEach, mock } from "node:test";
import * as rpc from "@knorvia/rpc";
import type { ISettingService } from "../src/setting/setting.js";

export async function lifecycleFixture(instrumentEmitters = true) {
  const emitted = process.env.KNORVIA_TERMINAL_LIFECYCLE_TARGET === "dist";
  const root = resolve("synthetic-terminal-lifecycle-owned");
  const shell = join(root, "owned-shell");
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const parentEnv = process.env;
  const marker = parentEnv.NODE_TEST_CONTEXT
    ? { NODE_TEST_CONTEXT: parentEnv.NODE_TEST_CONTEXT }
    : {};
  const url = (name: string) =>
    new URL(`../${emitted ? "dist" : "src"}/${name}.${emitted ? "js" : "ts"}`, import.meta.url)
      .href;
  const state = {
    trace: [] as string[],
    ptys: [] as FakePty[],
    emitters: [] as TracedEmitter<unknown>[],
    configure: (_pty: FakePty) => {},
    spawnError: undefined as unknown,
    profileError: undefined as unknown,
    releaseError: undefined as unknown,
    emitterFailure: 0,
    shellAvailable: true,
  };
  class TracedEmitter<T> extends rpc.Emitter<T> {
    readonly index: number;
    disposals = 0;
    constructor() {
      super();
      this.index = state.emitters.length;
      state.trace.push(`emitter:${this.index}`);
      if (state.emitterFailure === this.index + 1) throw new Error(`emitter failure ${this.index}`);
      state.emitters.push(this as TracedEmitter<unknown>);
    }
    override fire(event: T) {
      state.trace.push(`fire:${this.index}:${String(event)}`);
      super.fire(event);
    }
    override dispose() {
      this.disposals++;
      state.trace.push(`dispose:${this.index}`);
      super.dispose();
    }
  }
  class FakePty {
    data: (data: string) => void = () => assert.fail("data not attached");
    exit: (event: { exitCode: number }) => void = () => assert.fail("exit not attached");
    onDataAction = () => {};
    onExitAction = () => {};
    killAction = () => {};
    writeAction = (_data: string) => {};
    resizeAction = (_cols: number, _rows: number) => {};
    kills = 0;
    nativeDisposals = 0;
    writes: string[] = [];
    sizes: number[][] = [];
    onData(listener: (data: string) => void) {
      state.trace.push("onData");
      this.data = listener;
      this.onDataAction();
      return {
        dispose: () => {
          this.nativeDisposals++;
        },
      };
    }
    onExit(listener: (event: { exitCode: number }) => void) {
      state.trace.push("onExit");
      this.exit = listener;
      this.onExitAction();
      return {
        dispose: () => {
          this.nativeDisposals++;
        },
      };
    }
    kill() {
      state.trace.push("kill");
      this.kills++;
      this.killAction();
      return "ignored kill result";
    }
    write(data: string) {
      state.trace.push(`write:${data}`);
      this.writes.push(data);
      this.writeAction(data);
      return "ignored write result";
    }
    resize(cols: number, rows: number) {
      state.trace.push(`resize:${cols}:${rows}`);
      this.sizes.push([cols, rows]);
      this.resizeAction(cols, rows);
      return "ignored resize result";
    }
  }
  beforeEach(() => {
    Object.defineProperty(process, "platform", { ...platform, value: "linux" });
    process.env = {
      ...marker,
      HOME: root,
      SHELL: shell,
      PATH: root,
      KNORVIA_ENV: "test",
      KNORVIA_DATA_BASE_DIR: root,
    };
    state.trace = [];
    state.ptys = [];
    state.emitters = [];
    state.configure = () => {};
    state.spawnError = state.profileError = state.releaseError = undefined;
    state.emitterFailure = 0;
    state.shellAvailable = true;
  });
  after(() => {
    process.env = parentEnv;
    Object.defineProperty(process, "platform", platform);
  });
  mock.module("node:fs", {
    namedExports: {
      constants,
      accessSync: (path: string, mode: number) => {
        state.trace.push("access");
        assert.equal(mode, constants.X_OK);
        if (path !== shell || !state.shellAvailable) throw new Error("owned executable denied");
      },
      statSync: (path: string) => {
        assert.equal(path, root);
        state.trace.push("stat");
        return { isDirectory: () => true };
      },
      existsSync: () => assert.fail("no helper/profile filesystem probes"),
      readFileSync: () => assert.fail("no user profile reads"),
      chmodSync: () => assert.fail("no permission changes"),
    },
  });
  mock.module("node:os", {
    namedExports: {
      homedir: () => {
        state.trace.push("home");
        return root;
      },
      release: () => {
        state.trace.push("release");
        if (state.releaseError !== undefined) throw state.releaseError;
        return "owned release";
      },
    },
  });
  mock.module("node:module", {
    namedExports: {
      createRequire: () =>
        Object.assign(() => assert.fail("no native helper loading"), {
          resolve: () => assert.fail("no native helper resolving"),
        }),
    },
  });
  mock.module("node:child_process", {
    namedExports: {
      execFileSync: () => assert.fail("no commands"),
      spawn: () => assert.fail("no processes"),
    },
  });
  mock.module("node-pty", {
    namedExports: {
      spawn: () => {
        state.trace.push("spawn");
        if (state.spawnError !== undefined) throw state.spawnError;
        const pty = new FakePty();
        state.ptys.push(pty);
        state.configure(pty);
        return pty;
      },
    },
  });
  const theme = { background: "#010203", foreground: "#fefdfc" };
  mock.module(url("terminal/terminalProfile"), {
    namedExports: {
      resolveTerminalFontProfile: () => {
        state.trace.push("profile");
        if (state.profileError !== undefined) throw state.profileError;
        return { fontFamily: "Owned monospace", fontSize: 17, theme, source: "fallback" };
      },
    },
  });
  if (instrumentEmitters)
    mock.module("@knorvia/rpc", { namedExports: { ...rpc, Emitter: TracedEmitter } });
  const { createTerminalService }: typeof import("../src/terminal/terminalService.js") =
    await import(url("terminal/terminalService"));
  const { collectServiceMemoryDiagnostics } = await import(url("memoryDiagnostics"));
  type Service = ReturnType<typeof createTerminalService> & { disposeAll(): void };
  const services: Service[] = [];
  function service(t: { after(fn: () => void): void }, get?: () => Promise<unknown>) {
    const s = createTerminalService({
      settingService: {
        get:
          get ??
          (async () => {
            state.trace.push("settings");
            return { terminalInheritSystemProfile: false };
          }),
      } as ISettingService,
    }) as Service;
    services.push(s);
    t.after(() => {
      for (const pty of state.ptys) pty.killAction = () => {};
      s.disposeAll();
    });
    return s;
  }
  const create = (s: Service) => s.create({ cols: 81, rows: 27, cwd: root });
  const open = () => collectServiceMemoryDiagnostics()["terminal.open"];
  const pair = (index = 0) => state.emitters.slice(index * 2, index * 2 + 2);
  return { state, service, create, open, pair, root, shell, theme, rpc, url };
}
