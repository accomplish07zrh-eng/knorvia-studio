// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
const ENV_KEYS = {
  builtin: "KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE",
  bundledBuiltin: "KNORVIA_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE",
  personal: "KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE",
} as const;

const PAIR_REQUIRED_MESSAGE =
  "Knorvia Studio Built-in 与 Personal Provider Config 路径必须同时提供";

export const KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE_ENV = ENV_KEYS.builtin;

export const KNORVIA_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV = ENV_KEYS.bundledBuiltin;

export const KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE_ENV = ENV_KEYS.personal;

export const PERSONAL_PROVIDER_CONFIG_FILE_NAME = "provider_config.json";

export type NodeProviderRuntimePaths = Readonly<{
  knorviaBuiltinFilePath: string;
  personalFilePath: string;
}>;

type ProviderPathEnv = Record<string, string>;

type RuntimeEnv = Readonly<Record<string, string | undefined>>;

// 空串与纯空白同样视为「没给」：路径只能整体提供或整体缺席。
const usablyTrimmed = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed !== "" ? trimmed : undefined;
};

export function createNodeProviderRuntimePathEnv(paths: NodeProviderRuntimePaths): ProviderPathEnv {
  const env: ProviderPathEnv = {};
  env[ENV_KEYS.builtin] = paths.knorviaBuiltinFilePath;
  env[ENV_KEYS.personal] = paths.personalFilePath;
  return env;
}

export function resolveNodeProviderRuntimePaths(env: RuntimeEnv): NodeProviderRuntimePaths | null {
  const builtinPath = usablyTrimmed(env[ENV_KEYS.builtin]);
  const personalPath = usablyTrimmed(env[ENV_KEYS.personal]);
  const provided = [builtinPath, personalPath].filter((path) => path !== undefined);
  if (provided.length === 0) return null;
  if (builtinPath === undefined || personalPath === undefined)
    throw new Error(PAIR_REQUIRED_MESSAGE);
  return Object.freeze({ knorviaBuiltinFilePath: builtinPath, personalFilePath: personalPath });
}
