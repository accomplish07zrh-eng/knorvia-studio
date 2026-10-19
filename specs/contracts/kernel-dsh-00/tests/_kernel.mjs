// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 宿主级契约测试的共享工具：临时 HOME/工作区、静默 logger 与统一清理。
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export function silentLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

export function recordingLogger() {
  const entries = [];
  const record = (level) => (message, fields) => {
    entries.push({ level, message, fields });
  };
  return {
    entries,
    logger: {
      debug: record("debug"),
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
    },
  };
}

export async function withBoot(kernel, options, callback) {
  const workspace = options.cwd ?? join(options.root, "workspace");
  const home = options.home ?? join(options.root, "home");
  const dataBase = options.dataBase ?? join(options.root, "base");
  await mkdir(workspace, { recursive: true });
  await mkdir(home, { recursive: true });

  const previous = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    DSH_HOME: process.env.DSH_HOME,
    DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_DISABLED,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  const env = {
    KNORVIA_DATA_BASE_DIR: dataBase,
    HOME: home,
    USERPROFILE: home,
    ...options.env,
  };

  let host;
  try {
    host = await kernel.bootKernel({
      cwd: workspace,
      env,
      logger: options.logger ?? silentLogger(),
      ...options.boot,
    });
    return await callback({
      host,
      workspace,
      home,
      dataBase,
      dataRoot: join(dataBase, ".knorvia-studio"),
      dshHome: host.dshHome,
    });
  } finally {
    if (host && options.keepHost !== true) {
      try {
        await host.dispose();
      } catch {
        // 用例自己负责断言 dispose 失败；清理阶段不掩盖首个错误。
      }
    }
    restore("HOME", previous.HOME);
    restore("USERPROFILE", previous.USERPROFILE);
    restore("DSH_HOME", previous.DSH_HOME);
    restore("DSH_TELEMETRY_DISABLED", previous.DSH_TELEMETRY_DISABLED);
  }
}

function restore(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
