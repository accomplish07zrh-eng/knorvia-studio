import { materializeKnorviaBuiltinProviderConfig } from "@knorvia/services/node";

declare const __KNORVIA_BUILTIN_PROVIDER_CONFIG_JSON__: string | undefined;

interface MaterializeBundledKnorviaBuiltinProviderConfigOptions {
  readonly environmentConfigRoot: string;
  readonly content: string;
}

/** 返回构建时嵌入远端 Server 的 Knorvia Built-in Provider Config。 */
export function readBundledKnorviaBuiltinProviderConfig(): string {
  if (typeof __KNORVIA_BUILTIN_PROVIDER_CONFIG_JSON__ !== "string") {
    throw new Error("当前构建未嵌入 Knorvia Studio Built-in Provider Config");
  }
  return __KNORVIA_BUILTIN_PROVIDER_CONFIG_JSON__;
}

/**
 * 将 Knorvia Built-in Config 原子物化到所属环境的固定资源副本。
 * 升级前退出旧进程；不保留按内容 hash 增长的历史文件。
 */
export async function materializeBundledKnorviaBuiltinProviderConfig(
  options: MaterializeBundledKnorviaBuiltinProviderConfigOptions,
): Promise<string> {
  return materializeKnorviaBuiltinProviderConfig(options);
}
