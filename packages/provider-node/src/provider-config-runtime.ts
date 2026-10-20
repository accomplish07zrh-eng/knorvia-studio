// SPDX-License-Identifier: Apache-2.0
// Provider 配置运行时（装配壳）。
//
// 本文件保留 interface.md 冻结的导出面（类、工厂、options 类型与 configService 字段），
// 有状态的生命周期逻辑放在 config-runtime-core.ts。理由同 provider-registry-runtime：
// 这些签名逐字来自兼容面，行相似度上无法也不该改写；把逻辑移出后本文件只剩声明与转发。
import type { ProviderConfigService } from "@knorvia/provider";
import type { KnorviaBuiltinRefreshResult } from "./builtin-remote-synchronizer.js";
import { createConfigRuntimeCore, type ConfigRuntimeOptions } from "./config-runtime-core.js";

export type NodeProviderConfigRuntimeOptions = ConfigRuntimeOptions;

export class NodeProviderConfigRuntime {
  readonly #core: ReturnType<typeof createConfigRuntimeCore>;

  readonly configService: ProviderConfigService;

  constructor(options: NodeProviderConfigRuntimeOptions) {
    this.#core = createConfigRuntimeCore(options);
    this.configService = this.#core.configService;
  }

  resolveKnorviaBuiltinActiveFilePath(): Promise<string> {
    return this.#core.resolveKnorviaBuiltinActiveFilePath();
  }

  get personalRepository(): import("@knorvia/provider").PersonalProviderConfigRepository {
    return this.#core.personalRepository;
  }

  onDidCheckKnorviaBuiltin(listener: () => Promise<void>): () => boolean {
    return this.#core.onDidCheckKnorviaBuiltin(listener);
  }

  start(): Promise<void> {
    return this.#core.start();
  }

  refreshKnorviaBuiltin(options?: {
    readonly force?: boolean;
  }): Promise<KnorviaBuiltinRefreshResult> {
    return this.#core.refreshKnorviaBuiltin(options);
  }

  dispose(): void {
    this.#core.dispose();
  }
}

export function createNodeProviderConfigRuntime(
  options: NodeProviderConfigRuntimeOptions,
): NodeProviderConfigRuntime {
  return new NodeProviderConfigRuntime(options);
}
