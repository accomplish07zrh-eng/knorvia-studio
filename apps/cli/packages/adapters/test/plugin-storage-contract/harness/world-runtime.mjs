// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import nativeProcess from "node:process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { record, setWorld } from "../seams/state.mjs";

export async function installWorld({ runRoot, config = {} }) {
  const world = setWorld({
    config,
    counters: { io: {}, timer: 0, uuid: 0 },
    events: [],
    observations: [],
    runRoot,
    scripts: {
      clock: [...(config.clock ?? ["2025-01-02T03:04:05.000Z"])],
      git: [...(config.git ?? [])],
      http: [...(config.http ?? [])],
      uuid: [...(config.uuid ?? [])],
    },
  });

  await mkdir(join(runRoot, "tmp"), { recursive: true });
  await mkdir(join(runRoot, "home"), { recursive: true });

  const NativeDate = globalThis.Date;
  class SyntheticDate extends NativeDate {
    constructor(...args) {
      if (args.length > 0) {
        super(...args);
        return;
      }
      const value =
        world.scripts.clock.length > 1 ? world.scripts.clock.shift() : world.scripts.clock[0];
      super(value ?? "2025-01-02T03:04:05.000Z");
      record("clock.now", { value: this.toISOString() });
    }

    static now() {
      return new SyntheticDate().getTime();
    }
  }
  globalThis.Date = SyntheticDate;

  const timerHandles = new Map();
  globalThis.setTimeout = (callback, delay = 0, ...args) => {
    const id = ++world.counters.timer;
    const handle = { id, delay, cancelled: false };
    timerHandles.set(id, handle);
    record("timer.set", { id, delay });
    if (world.config?.abortOnTimerAt === id) {
      world.abortController?.abort();
      record("signal.abort", { timer: id });
    }
    queueMicrotask(() => {
      if (handle.cancelled) return;
      timerHandles.delete(id);
      callback(...args);
    });
    return handle;
  };
  globalThis.clearTimeout = (handle) => {
    if (!handle) return;
    handle.cancelled = true;
    timerHandles.delete(handle.id);
    record("timer.clear", { id: handle.id, delay: handle.delay });
  };

  const processConfig = config.process ?? {};
  const syntheticProcess = new Proxy(nativeProcess, {
    get(target, property, receiver) {
      if (property === "pid") return processConfig.pid ?? target.pid;
      if (property === "platform") return processConfig.platform ?? target.platform;
      if (property === "env") return config.env ?? {};
      if (property === "cwd") return () => config.cwd ?? runRoot;
      if (property === "kill") {
        return (pid, signal = 0) => {
          const result = processConfig.probes?.[String(pid)] ?? "ESRCH";
          record("process.kill", { pid, signal, result });
          if (result === "ok") return true;
          const error = new Error(`Synthetic process probe ${result}`);
          error.code = result;
          throw error;
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  Object.defineProperty(globalThis, "process", {
    configurable: true,
    value: syntheticProcess,
    writable: true,
  });

  globalThis.fetch = async () => {
    throw new Error("Network access is forbidden by the Knorvia test world");
  };
  return world;
}
