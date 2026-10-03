import type { ModelConnectivityResult } from "@knorvia/shared";
import type { ProviderSettingsConnectivityTester } from "./providerFacadeServices.js";

interface FormalModelConnectivityInput {
  readonly workspacePath: string;
  readonly workspaceIdentity?: string;
  readonly selection: {
    readonly providerId: string;
    readonly modelId: string;
  };
}

type FormalModelConnectivityExecutor = (
  input: FormalModelConnectivityInput,
) => Promise<{ readonly success: true }>;

export function createProviderSettingsConnectivityTester(dependencies: {
  readonly testModelConnectivity: FormalModelConnectivityExecutor;
}): ProviderSettingsConnectivityTester {
  return async (input) => {
    try {
      await dependencies.testModelConnectivity({
        workspacePath: input.workspacePath,
        ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
        selection: { providerId: input.providerId, modelId: input.modelId },
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) },
      };
    }
  };
}

export type { ModelConnectivityResult };
