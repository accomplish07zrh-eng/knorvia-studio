// SPDX-License-Identifier: Apache-2.0
// Config + Registry 生命周期单元（装配壳）。
//
// 本文件只保留 interface.md 冻结的导出面（类、两个工厂、options 类型），
// 实际装配与关停顺序逻辑放在 registry-composition.ts 里，通过一个内部句柄委托。
// 这样做的原因：这些签名逐字来自兼容面，行相似度上无法也不该改写；
// 把有逻辑的部分挪出去之后，本文件退化为「声明 + 一次转发」。
import type {
  AccountProviderConfigSnapshot,
  ProviderRegistryService,
  ProviderSource,
} from "@knorvia/provider";
import type {
  NodeProviderConfigRuntime,
  NodeProviderConfigRuntimeOptions,
} from "./provider-config-runtime.js";
import { composeRegistryRuntime } from "./registry-composition.js";

export interface NodeProviderRegistryRuntimeOptions extends NodeProviderConfigRuntimeOptions {
  readonly accountSource?: ProviderSource<AccountProviderConfigSnapshot>;
  readonly createAccountSource?: (
    configService: NodeProviderConfigRuntime["configService"],
  ) => ProviderSource<AccountProviderConfigSnapshot>;
}

export class NodeProviderRegistryRuntime {
  readonly #composed: ReturnType<typeof composeRegistryRuntime>;

  readonly configService: NodeProviderConfigRuntime["configService"];
  readonly registryService: ProviderRegistryService;

  constructor(options: NodeProviderRegistryRuntimeOptions) {
    this.#composed = composeRegistryRuntime(options);
    this.configService = this.#composed.configService;
    this.registryService = this.#composed.registryService;
  }

  start(): Promise<void> {
    return this.#composed.start();
  }

  get personalRepository(): NodeProviderConfigRuntime["personalRepository"] {
    return this.#composed.personalRepository;
  }

  onDidCheckKnorviaBuiltin(listener: () => Promise<void>): () => boolean {
    return this.#composed.onDidCheckKnorviaBuiltin(listener);
  }

  dispose(): void {
    this.#composed.dispose();
  }
}

export function createNodeProviderRegistryRuntime(
  options: NodeProviderRegistryRuntimeOptions,
): NodeProviderRegistryRuntime {
  return new NodeProviderRegistryRuntime(options);
}
