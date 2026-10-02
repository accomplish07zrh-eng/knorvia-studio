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

export class ProviderConfigRuntime {
  readonly configService: NodeProviderConfigRuntime["configService"];
  #runtime: NodeProviderConfigRuntime;

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
    return this.#runtime.dispose();
  }
}

export function createProviderConfigRuntime(
  options: ProviderConfigRuntimeOptions,
): ProviderConfigRuntime {
  return new ProviderConfigRuntime(options);
}
