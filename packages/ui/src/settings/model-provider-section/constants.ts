import type { ProviderSettingsFormProvider } from "@/lib/providerSettingsFormTypes.js";
import { getProviderFormLabel } from "@/lib/providerSettingsFormTypes.js";
import { createUuid } from "@knorvia/shared";

export function generateId(): string {
  return createUuid();
}
export interface ModelProviderNavItem {
  key: string;
  type: "custom";
  label: string;
  provider: ProviderSettingsFormProvider;
  statusActive: boolean;
}
export type ModelProviderNavGroupId = "custom";
export interface ModelProviderNavGroup {
  id: ModelProviderNavGroupId;
  title: string;
  items: ModelProviderNavItem[];
}

export function resolveModelProviderDisplayName(provider: ProviderSettingsFormProvider): string {
  return getProviderFormLabel(provider);
}
