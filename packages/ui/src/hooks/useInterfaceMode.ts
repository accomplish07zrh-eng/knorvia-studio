import { useKnorviaStoreWithDefault } from "@/store/StoreProvider.js";

export function useIsOfficeMode(): boolean {
  return useKnorviaStoreWithDefault((state) => state.interfaceMode === "office", false);
}
