import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export const MASCOT_PREFERENCE_KEY = "knorvia-studio:mascot:v1";
export const MASCOT_MODES = ["animated", "still", "hidden"] as const;
export type MascotMode = (typeof MASCOT_MODES)[number];
const isMode = (value: unknown): value is MascotMode => MASCOT_MODES.includes(value as MascotMode);
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function createMascotPreferenceStore(storage?: PreferenceStorage) {
  let mode: MascotMode = "animated";
  try {
    const stored = storage?.getItem(MASCOT_PREFERENCE_KEY);
    if (isMode(stored)) mode = stored;
  } catch {
    /* Unavailable storage must not prevent rendering. */
  }
  return createStore<{
    mode: MascotMode;
    saveFailed: boolean;
    setMode: (mode: MascotMode) => void;
  }>((set) => ({
    mode,
    saveFailed: false,
    setMode(next) {
      if (!isMode(next)) return;
      let saveFailed = false;
      try {
        if (!storage) throw new Error("Storage unavailable");
        storage.setItem(MASCOT_PREFERENCE_KEY, next);
      } catch {
        saveFailed = true;
      }
      set({ mode: next, saveFailed });
    },
  }));
}

function localStorageOrUndefined() {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
const store = createMascotPreferenceStore(localStorageOrUndefined());
export function useMascotPreference<T>(selector: (state: ReturnType<typeof store.getState>) => T) {
  return useStore(store, selector);
}
