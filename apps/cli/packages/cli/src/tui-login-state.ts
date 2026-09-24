import { getKnorviaCopy } from "@knorvia/i18n";
import type { CommandCenterApp } from "./command-center.js";

export function modelConfigurationRequiredResponse(locale?: string): string {
  const copy = getKnorviaCopy(locale).tui.modelConfigurationRequired;
  return [copy.message, copy.help].join("\n");
}

/** Registry already applies provider/account availability, including personal providers. */
export function createTuiModelAvailabilityChecker(
  getApp: () => Promise<CommandCenterApp>,
): () => Promise<boolean> {
  return async () => {
    const app = await getApp();
    return ((await app.listModels?.()) ?? []).some((model) => !model.disabledReason);
  };
}
