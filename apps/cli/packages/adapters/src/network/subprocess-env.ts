// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import {
  KNORVIA_AGENT_CA_CERT_ENV_KEY,
  KNORVIA_HTTP_PROXY_ENV_KEY,
  KNORVIA_NO_PROXY_ENV_KEY,
  KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY,
  readKnorviaToolEnvPassthroughEnv,
} from "@knorvia/shared/runtime-env";

export interface NetworkEgressEnvPolicy {
  caCertFile?: string;
  httpProxy?: string;
  noProxy?: string;
}

interface NetworkEgressEnvOptions {
  network?: NetworkEgressEnvPolicy;
  platform?: NodeJS.Platform;
  sourceEnv?: Record<string, string | undefined>;
  toolEnvPassthrough?: boolean;
}

function sourceValue(
  source: Record<string, string | undefined>,
  name: string,
  windows: boolean,
): string | undefined {
  if (!windows) return source[name];
  const folded = name.toLowerCase();
  const key = Object.keys(source).find((entry) => entry.toLowerCase() === folded);
  // Windows 首个匹配即决定结果，空值也不能跳到后面的大小写别名。
  return key === undefined ? undefined : source[key];
}

function removeKey(target: Record<string, string>, name: string, windows: boolean): void {
  if (!windows) {
    delete target[name];
    return;
  }
  const folded = name.toLowerCase();
  for (const key of Object.keys(target)) {
    if (key.toLowerCase() === folded) delete target[key];
  }
}

function writeValue(
  target: Record<string, string>,
  name: string,
  value: string,
  windows: boolean,
): void {
  removeKey(target, name, windows);
  target[name] = value;
}

function nonblankSourceValue(
  source: Record<string, string | undefined>,
  name: string,
  windows: boolean,
): string | undefined {
  const value = sourceValue(source, name, windows);
  return value?.trim() ? value : undefined;
}

export function applyNetworkEgressEnv(
  env: Record<string, string>,
  options: NetworkEgressEnvOptions,
): Record<string, string> {
  const platform = options.platform ?? process.platform;
  const source = options.sourceEnv ?? {};
  const network = options.network ?? {};
  const windows = platform === "win32";

  removeKey(env, KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY, windows);
  if (options.toolEnvPassthrough !== false) {
    for (const [key, value] of Object.entries(readKnorviaToolEnvPassthroughEnv(source))) {
      writeValue(env, key, value, windows);
    }
  }

  // source 可以就是 env；必须在覆盖和前序写入之后逐项取值，不能提前快照。
  const proxy =
    network.httpProxy?.trim() || sourceValue(source, KNORVIA_HTTP_PROXY_ENV_KEY, windows)?.trim();
  if (proxy) {
    const value = /^[a-z][a-z0-9+.-]*:\/\//i.test(proxy) ? proxy : `http://${proxy}`;
    for (const key of [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "ALL_PROXY",
      "http_proxy",
      "https_proxy",
      "all_proxy",
    ]) {
      writeValue(env, key, value, windows);
    }
  }

  const noProxy =
    network.noProxy?.trim() || nonblankSourceValue(source, KNORVIA_NO_PROXY_ENV_KEY, windows);
  if (noProxy) {
    writeValue(env, "NO_PROXY", noProxy, windows);
    writeValue(env, "no_proxy", noProxy, windows);
  }

  const ca =
    network.caCertFile?.trim() ||
    nonblankSourceValue(source, KNORVIA_AGENT_CA_CERT_ENV_KEY, windows);
  if (ca) {
    for (const key of [
      "NODE_EXTRA_CA_CERTS",
      "SSL_CERT_FILE",
      "REQUESTS_CA_BUNDLE",
      "CURL_CA_BUNDLE",
      "GIT_SSL_CAINFO",
    ]) {
      writeValue(env, key, ca, windows);
    }
  }
  return env;
}
