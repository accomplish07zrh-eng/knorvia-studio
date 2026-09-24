import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import {
  APPEARANCE_KEY,
  DEFAULT_GLASS,
  normalizeAppearance,
  type AppearancePreferences,
} from "@/appearance/preferences.js";
import {
  backgroundImages,
  prepareBackgroundImage,
  type BackgroundImageRepository,
} from "@/appearance/backgroundImage.js";

type StoragePort = Pick<Storage, "getItem" | "setItem">;
type Patch = Partial<Omit<AppearancePreferences, "imageId" | "imageName">>;
interface AppearanceState {
  preferences: AppearancePreferences;
  imageUrl: string | null;
  imageBusy: boolean;
  error: string | null;
  nativeGlassSupported: boolean | null;
  setNativeGlassSupported(value: boolean): void;
  update(patch: Patch): void;
  resetGlass(): void;
  replaceImage(file: File): Promise<void>;
  removeImage(): void;
  reload(): void;
}
export function createAppearancePreferenceStore(options: {
  storage?: StoragePort;
  images: BackgroundImageRepository;
  prepare(file: File): Promise<Blob>;
  createUrl(blob: Blob): string;
  revokeUrl(url: string): void;
  id(): string;
}) {
  let generation = 0;
  let imageRead = 0;
  let currentUrl: string | null = null;
  const read = () => {
    const value = options.storage?.getItem(APPEARANCE_KEY) ?? "null";
    try {
      return normalizeAppearance(JSON.parse(value));
    } catch {
      return normalizeAppearance(null);
    }
  };
  let initial = normalizeAppearance(null);
  try {
    initial = read();
  } catch {
    /* A broken preference must not prevent the app opening. */
  }
  const store = createStore<AppearanceState>((set, get) => {
    const clearUrl = () => {
      imageRead++;
      if (currentUrl) options.revokeUrl(currentUrl);
      currentUrl = null;
      set({ imageUrl: null });
    };
    const loadImage = async () => {
      const { imageId, backgroundEnabled } = get().preferences;
      if (!backgroundEnabled || !imageId) {
        clearUrl();
        return;
      }
      const request = ++imageRead;
      try {
        const blob = await options.images.read(imageId);
        if (request !== imageRead) return;
        if (!blob) throw new Error("missingImage");
        const next = options.createUrl(blob);
        if (currentUrl) options.revokeUrl(currentUrl);
        currentUrl = next;
        set({ imageUrl: next });
      } catch {
        if (request === imageRead) {
          clearUrl();
          set({ error: "missingImage" });
        }
      }
    };
    const commit = (patch: Partial<AppearancePreferences>) => {
      try {
        if (!options.storage) throw new Error("saveFailed");
        const previous = read();
        const displayed = get().preferences;
        const next = normalizeAppearance({ ...previous, ...patch });
        options.storage.setItem(APPEARANCE_KEY, JSON.stringify(next));
        set({ preferences: next, error: null });
        if (
          displayed.imageId !== next.imageId ||
          displayed.backgroundEnabled !== next.backgroundEnabled
        )
          void loadImage();
        return previous;
      } catch {
        set({ error: "saveFailed" });
        return null;
      }
    };
    const removeAsset = (id: string | null) => {
      if (id) void options.images.remove(id).catch(() => set({ error: "cleanupFailed" }));
    };
    return {
      preferences: initial,
      imageUrl: null,
      imageBusy: false,
      error: null,
      nativeGlassSupported: null,
      setNativeGlassSupported: (value) => set({ nativeGlassSupported: value }),
      update: (patch) => {
        if (patch.backgroundEnabled === false) {
          generation++;
          set({ imageBusy: false });
        }
        commit(patch);
      },
      resetGlass: () => {
        commit(DEFAULT_GLASS);
      },
      async replaceImage(file) {
        const request = ++generation;
        set({ imageBusy: true, error: null });
        let id: string | null = null;
        try {
          const blob = await options.prepare(file);
          if (request !== generation) return;
          id = options.id();
          await options.images.write(id, blob);
          // 选择新图/移除会推进代次；旧解码或写入结束后不能把已取消的图片重新挂上。
          if (request !== generation) {
            removeAsset(id);
            return;
          }
          const previous = commit({ imageId: id, imageName: file.name, backgroundEnabled: true });
          if (!previous) {
            removeAsset(id);
            return;
          }
          removeAsset(previous.imageId);
        } catch (error) {
          if (id) removeAsset(id);
          if (request === generation)
            set({
              error:
                error instanceof Error &&
                ["tooLarge", "invalidImage", "dimensions"].includes(error.message)
                  ? error.message
                  : "saveFailed",
            });
        } finally {
          if (request === generation) set({ imageBusy: false });
        }
      },
      removeImage() {
        generation++;
        set({ imageBusy: false });
        const previous = commit({ imageId: null, imageName: "", backgroundEnabled: false });
        if (previous) removeAsset(previous.imageId);
      },
      reload() {
        try {
          const previous = get().preferences;
          const next = read();
          set({ preferences: next });
          if (
            previous.imageId !== next.imageId ||
            previous.backgroundEnabled !== next.backgroundEnabled ||
            !get().imageUrl
          )
            void loadImage();
        } catch {
          set({ error: "saveFailed" });
        }
      },
    };
  });
  return store;
}
let storage: StoragePort | undefined;
try {
  if (typeof window !== "undefined") storage = window.localStorage;
} catch {
  /* Private mode. */
}
const store = createAppearancePreferenceStore({
  storage,
  images: backgroundImages,
  prepare: prepareBackgroundImage,
  createUrl: (blob) => URL.createObjectURL(blob),
  revokeUrl: (url) => URL.revokeObjectURL(url),
  id: () => crypto.randomUUID(),
});
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key === APPEARANCE_KEY || event.key === null) store.getState().reload();
  });
export function useAppearancePreference<T>(selector: (state: AppearanceState) => T) {
  return useStore(store, selector);
}
