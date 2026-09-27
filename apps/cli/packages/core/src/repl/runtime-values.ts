// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";

export function stringifyValue(value: unknown): string | undefined {
  if (value === undefined || typeof value === "string") return value;
  if (ArrayBuffer.isView(value)) return inspect(value, { maxArrayLength: 100 });
  try {
    const json = JSON.stringify(value, null, 2);
    if (json !== undefined) return json;
  } catch {
    // 循环对象与 bigint 不能 JSON 序列化；保留 REPL 的文本回显语义。
  }
  return String(value);
}

export function errorField(value: unknown, key: string): unknown {
  // cell 能抛出任意 Proxy/getter；读取错误字段自身也可能抛错，边界不得再次崩溃。
  try {
    return value !== null && (typeof value === "object" || typeof value === "function")
      ? Reflect.get(value, key)
      : undefined;
  } catch {
    return undefined;
  }
}
export function errorDetails(value: unknown): { name: string; message: string; stack?: string } {
  const name = errorField(value, "name");
  const stack = errorField(value, "stack");
  let message = errorField(value, "message");
  if (typeof message !== "string") {
    try {
      message = String(value);
    } catch {
      message = "An unprintable value was thrown";
    }
  }
  return {
    name: typeof name === "string" ? name : "Error",
    message: message as string,
    ...(typeof stack === "string" ? { stack } : {}),
  };
}

export function restrictedProcess(): Readonly<Record<string, unknown>> {
  return Object.freeze({
    arch: process.arch,
    argv: Object.freeze([...process.argv]),
    cwd: () => process.cwd(),
    env: Object.freeze({ ...process.env }),
    execArgv: Object.freeze([...process.execArgv]),
    execPath: process.execPath,
    hrtime: process.hrtime.bind(process),
    memoryUsage: process.memoryUsage.bind(process),
    nextTick: process.nextTick.bind(process),
    pid: process.pid,
    platform: process.platform,
    release: Object.freeze({ ...process.release }),
    resourceUsage: process.resourceUsage.bind(process),
    uptime: process.uptime.bind(process),
    version: process.version,
    versions: Object.freeze({ ...process.versions }),
  });
}

export function moduleAccess(facade?: Readonly<Record<string, unknown>>) {
  const base = createRequire(pathToFileURL(resolve(process.cwd(), "__knorvia_repl__.cjs")));
  const isProcess = (id: unknown) => id === "process" || id === "node:process";
  const require = Object.assign((id: string) => (facade && isProcess(id) ? facade : base(id)), {
    resolve: base.resolve,
    cache: base.cache,
    extensions: base.extensions,
  }) as NodeJS.Require;
  return {
    require,
    importModule: async (specifier: string, options?: ImportCallOptions): Promise<unknown> => {
      if (facade && isProcess(specifier)) return { ...facade, default: facade };
      // 属性来自运行中的 cell，必须交给 Node 原生 import 校验，不能裁掉或静态替换。
      return import(specifier, options);
    },
  };
}
