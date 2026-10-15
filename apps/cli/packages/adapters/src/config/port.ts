// SPDX-License-Identifier: Apache-2.0
// 配置端口实现：读路径「存储 → 默认值 → 抛错」，快照装配在 snapshot.ts，存储细节在 store.ts。
import {
  ConfigKey,
  ConfigScope,
  DefaultRuntimeConfig as DefaultConfig,
  type ConfigObserver,
  type ConfigPort,
  type ConfigSource,
  type ConfigValue,
  type RuntimeConfig,
  type RuntimeConfigPatch,
} from "@knorvia/contracts";
import { getDefaultValue, hasDefaultValue } from "./defaults.js";
import { buildRuntimeConfig } from "./snapshot.js";
import { ConfigStore, type AllHandler } from "./store.js";

type Handler<K extends ConfigKey> = (value: ConfigValue<K>, prev: ConfigValue<K>) => void;

export class ConfigPortImpl implements ConfigPort {
  private readonly state: ConfigStore;

  constructor(initial?: RuntimeConfigPatch) {
    this.state = new ConfigStore(initial ?? DefaultConfig);
  }

  get<K extends ConfigKey>(key: K): ConfigValue<K> {
    const stored = this.state.get(key);
    if (stored !== undefined) return stored;
    const fallback = getDefaultValue(key) as ConfigValue<K> | undefined;
    if (fallback !== undefined) return fallback;
    throw new Error(`Config key not found: ${key}`);
  }

  getAll(): RuntimeConfig {
    return buildRuntimeConfig(this.state);
  }

  has(key: ConfigKey): boolean {
    return this.state.has(key) || hasDefaultValue(key);
  }

  set<K extends ConfigKey>(key: K, value: ConfigValue<K>): void {
    // 运行期改动一律算 session 作用域：用户的持久化意图由配置文件承载。
    this.state.set(key, value, ConfigScope.Session);
  }

  observe(): ConfigObserver {
    return {
      subscribe: <K extends ConfigKey>(key: K, handler: Handler<K>) =>
        this.state.subscribe(key, handler),
      subscribeAll: (handler: AllHandler) => this.state.subscribeAll(handler),
    };
  }

  getSources(key: ConfigKey): ConfigSource[] {
    return this.state.getSources(key);
  }

  merge(config: RuntimeConfigPatch, scope: ConfigScope): void {
    this.state.merge(config, scope);
  }
}
