// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import nativeProcess from "node:process";
import { getWorld, makeError, record } from "./state.mjs";

const world = getWorld();
const processConfig = world.config?.process ?? {};

export const pid = processConfig.pid ?? nativeProcess.pid;
export const platform = processConfig.platform ?? nativeProcess.platform;
export const env = world.config?.env ?? {};

export function cwd() {
  const value = world.config?.cwd ?? world.runRoot;
  record("process.cwd", { value });
  return value;
}

export function kill(targetPid, signal = 0) {
  const result = processConfig.probes?.[String(targetPid)] ?? "ESRCH";
  record("process.kill", { pid: targetPid, signal, result });
  if (result === "ok") return true;
  throw makeError({ code: result, message: `Synthetic process probe ${result}` });
}

const processProxy = new Proxy(nativeProcess, {
  get(target, property, receiver) {
    if (property === "pid") return pid;
    if (property === "platform") return platform;
    if (property === "env") return env;
    if (property === "cwd") return cwd;
    if (property === "kill") return kill;
    return Reflect.get(target, property, receiver);
  },
});

export default processProxy;
