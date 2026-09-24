import {
  NodeProviderConfigRuntime,
  PERSONAL_PROVIDER_CONFIG_FILE_NAME,
  type NodeProviderConfigRuntimeOptions,
  type PersonalProviderConfigRecoveryEvent,
} from "@knorvia/provider-node";
import { join } from "node:path";
import { getAppConfigDir } from "../paths.js";

export interface ProviderConfigRuntimeOptions {
  readonly knorviaBuiltinFilePath: string;
  readonly knorviaBuiltinActiveFilePath?: string;
  readonly onPersonalConfigRecovery?: (event: PersonalProviderConfigRecoveryEvent) => void;
  readonly onPersonalConfigPollingError?: (error: unknown) => void;
  readonly personalFilePath?: string;
  readonly personalPollingIntervalMs?: number | false;
  readonly watch?: boolean;
}

/**
 * Services 装配层只读取本地随包模型模板和当前 Knorvia 配置。
 * 不导入其它产品的数据，也不访问上游远程配置服务。
 */
export class ProviderConfigRuntime {
  readonly configService: NodeProviderConfigRuntime["configService"];
  readonly #runtime: NodeProviderConfigRuntime;

  constructor(options: ProviderConfigRuntimeOptions) {
    const runtimeOptions: NodeProviderConfigRuntimeOptions = {
      knorviaBuiltinFilePath: options.knorviaBuiltinFilePath,
      knorviaBuiltinActiveFilePath: options.knorviaBuiltinActiveFilePath,
      onPersonalConfigRecovery: options.onPersonalConfigRecovery,
      onPersonalConfigPollingError: options.onPersonalConfigPollingError,
      personalFilePath:
        options.personalFilePath ?? join(getAppConfigDir(), PERSONAL_PROVIDER_CONFIG_FILE_NAME),
      personalPollingIntervalMs: options.personalPollingIntervalMs,
      watch: options.watch,
    };
    this.#runtime = new NodeProviderConfigRuntime(runtimeOptions);
    this.configService = this.#runtime.configService;
  }

  start(): Promise<void> {
    return this.#runtime.start();
  }

  get personalRepository(): NodeProviderConfigRuntime["personalRepository"] {
    return this.#runtime.personalRepository;
  }

  resolveKnorviaBuiltinActiveFilePath(): Promise<string> {
    return this.#runtime.resolveKnorviaBuiltinActiveFilePath();
  }

  refreshKnorviaBuiltin(options?: { readonly force?: boolean }) {
    return this.#runtime.refreshKnorviaBuiltin(options);
  }

  onDidCheckKnorviaBuiltin(listener: () => Promise<void>): () => void {
    return this.#runtime.onDidCheckKnorviaBuiltin(listener);
  }

  dispose(): void {
    this.#runtime.dispose();
  }
}

export function createProviderConfigRuntime(
  options: ProviderConfigRuntimeOptions,
): ProviderConfigRuntime {
  return new ProviderConfigRuntime(options);
}
