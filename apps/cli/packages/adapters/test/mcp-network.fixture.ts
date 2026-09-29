// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import type { TestContext } from "node:test";

export const moduleUrls = {
  target: new URL("../src/mcp/network.js", import.meta.url).href,
  sanitizer: import.meta.resolve("@knorvia/shared/runtime-env"),
  projection: new URL("../src/network/subprocess-env.js", import.meta.url).href,
  fetch: new URL("../src/network/proxy-fetch.js", import.meta.url).href,
};

type Policy = { caCertFile?: string; httpProxy?: string; noProxy?: string };
type Options = { env?: NodeJS.ProcessEnv; network?: Policy };
export interface McpNetworkApi {
  buildMcpStdioEnv(options: Options): Record<string, string>;
  createMcpTransportFetch(options: Options): typeof fetch;
}
type ProjectionOptions = { network?: Policy; sourceEnv: NodeJS.ProcessEnv };
type FetchOptions = Policy & { env: NodeJS.ProcessEnv };
type Call =
  | { stage: "sanitize"; env: Record<string, string> }
  | { stage: "project"; env: Record<string, string>; options: ProjectionOptions }
  | { stage: "fetch"; options: FetchOptions };

let importSequence = 0;

export async function networkFixture(
  t: TestContext,
  options: { platform?: NodeJS.Platform; executable?: string } = {},
) {
  const execDescriptor = Object.getOwnPropertyDescriptor(process, "execPath");
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
  assert.ok(execDescriptor);
  assert.ok(platformDescriptor);
  const platform = options.platform ?? "win32";
  const executable = options.executable ?? "C:\\owned\\agent\\node.exe";
  const state = {
    calls: [] as Call[],
    access: [] as { candidate: fs.PathLike; mode: number | undefined }[],
    sanitize: (env: Record<string, string>) => env,
    project: (env: Record<string, string>, _options: ProjectionOptions) => env,
    fetch: ((_options: FetchOptions) => marker) as (value: FetchOptions) => typeof fetch,
    available: (_candidate: fs.PathLike): boolean => false,
  };
  const marker: typeof fetch = async () => new Response("owned marker");
  t.mock.module(moduleUrls.sanitizer, {
    namedExports: {
      sanitizeKnorviaRuntimeEnv: (env: Record<string, string>) => {
        state.calls.push({ stage: "sanitize", env });
        return state.sanitize(env);
      },
    },
  });
  t.mock.module(moduleUrls.projection, {
    namedExports: {
      applyNetworkEgressEnv: (env: Record<string, string>, input: ProjectionOptions) => {
        state.calls.push({ stage: "project", env, options: input });
        return state.project(env, input);
      },
    },
  });
  t.mock.module(moduleUrls.fetch, {
    namedExports: {
      createNetworkProxyFetch: (input: FetchOptions) => {
        state.calls.push({ stage: "fetch", options: input });
        return state.fetch(input);
      },
    },
  });
  const accessMock = t.mock.method(fs, "accessSync", (candidate: fs.PathLike, mode?: number) => {
    state.access.push({ candidate, mode });
    if (!state.available(candidate)) throw new Error("Owned fixture: inaccessible Node");
  });
  syncBuiltinESMExports();
  t.after(() => {
    accessMock.mock.restore();
    syncBuiltinESMExports();
    Object.defineProperty(process, "execPath", execDescriptor);
    Object.defineProperty(process, "platform", platformDescriptor);
  });
  Object.defineProperty(process, "execPath", { ...execDescriptor, value: executable });
  Object.defineProperty(process, "platform", { ...platformDescriptor, value: platform });
  const api = (await import(`${moduleUrls.target}?owned-mcp=${++importSequence}`)) as McpNetworkApi;
  // 被测模块已捕获平台；之后恢复真实进程标识，避免夹具影响其他读取者。
  Object.defineProperty(process, "execPath", execDescriptor);
  Object.defineProperty(process, "platform", platformDescriptor);
  return { api, state, marker, executable, platform };
}

export function callAt(state: { calls: Call[] }, index: number) {
  const call = state.calls[index];
  assert.ok(call);
  return call;
}

export function withOwnedEnvironment<T>(env: NodeJS.ProcessEnv, operation: () => T): T {
  const original = process.env;
  try {
    process.env = env;
    return operation();
  } finally {
    process.env = original;
  }
}
