import type { AppSettings } from "@knorvia/shared";
import type { ISettingService } from "./setting.js";

type SettingsUpdateEvent = { readonly keys: readonly (keyof AppSettings)[] };

export function createObservableSettingService(base: ISettingService): ISettingService & {
  onDidUpdate(listener: (event: SettingsUpdateEvent) => void): () => void;
} {
  const listeners = new Set<(event: SettingsUpdateEvent) => void>();
  return {
    ...base,
    async update(patch) {
      await base.update(patch);
      const keys = Object.keys(patch) as (keyof AppSettings)[];
      if (keys.length === 0) return;
      const event: SettingsUpdateEvent = Object.freeze({ keys: Object.freeze(keys) });
      for (const listener of listeners) listener(event);
    },
    onDidUpdate(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
