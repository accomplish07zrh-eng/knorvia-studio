export const KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE_ENV = "KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE";
export const KNORVIA_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV =
  "KNORVIA_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE";
export const KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE_ENV = "KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE";
export const PERSONAL_PROVIDER_CONFIG_FILE_NAME = "provider_config.json";

export interface NodeProviderRuntimePaths {
  readonly knorviaBuiltinFilePath: string;
  readonly personalFilePath: string;
}

export function createNodeProviderRuntimePathEnv(
  paths: NodeProviderRuntimePaths,
): Record<string, string> {
  return {
    [KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE_ENV]: paths.knorviaBuiltinFilePath,
    [KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE_ENV]: paths.personalFilePath,
  };
}

export function resolveNodeProviderRuntimePaths(
  env: Readonly<Record<string, string | undefined>>,
): NodeProviderRuntimePaths | null {
  const knorviaBuiltinFilePath = env[KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE_ENV]?.trim();
  const personalFilePath = env[KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE_ENV]?.trim();
  if (!knorviaBuiltinFilePath && !personalFilePath) return null;
  if (!knorviaBuiltinFilePath || !personalFilePath) {
    throw new Error("Knorvia Studio Built-in 与 Personal Provider Config 路径必须同时提供");
  }
  return Object.freeze({ knorviaBuiltinFilePath, personalFilePath });
}
