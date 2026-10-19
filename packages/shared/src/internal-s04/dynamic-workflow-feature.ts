// SPDX-License-Identifier: Apache-2.0
export const DYNAMIC_WORKFLOW_MODES = ["disabled", "onDemand", "alwaysOn"] as const;
export type DynamicWorkflowMode = (typeof DYNAMIC_WORKFLOW_MODES)[number];

export const KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV = "KNORVIA_DYNAMIC_WORKFLOW_MODE";
export const DEFAULT_DYNAMIC_WORKFLOW_MODE: DynamicWorkflowMode = "disabled";

export function normalizeDynamicWorkflowMode(value: unknown): DynamicWorkflowMode | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const candidate = value.trim();
  for (const validMode of DYNAMIC_WORKFLOW_MODES) {
    if (candidate === validMode) {
      return validMode;
    }
  }
  return undefined;
}

export function isDynamicWorkflowModeEnabled(mode: DynamicWorkflowMode): boolean {
  return mode !== "disabled";
}

export type DynamicWorkflowClientConfigSource = "remote" | "override" | "default";

export interface DynamicWorkflowClientConfig {
  readonly mode: DynamicWorkflowMode;
  readonly enabled: boolean;
  readonly source?: DynamicWorkflowClientConfigSource;
}

export function createDynamicWorkflowClientConfig(
  mode: DynamicWorkflowMode,
  source?: DynamicWorkflowClientConfigSource,
): DynamicWorkflowClientConfig {
  if (source !== undefined) {
    return {
      mode,
      enabled: isDynamicWorkflowModeEnabled(mode),
      source,
    };
  }
  return {
    mode,
    enabled: isDynamicWorkflowModeEnabled(mode),
  };
}

export function resolveDynamicWorkflowClientConfig(input: {
  remote: unknown;
  env?: Record<string, string | undefined>;
}): DynamicWorkflowClientConfig {
  const envVal = input.env?.[KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV];
  const overrideMode = normalizeDynamicWorkflowMode(envVal);
  if (overrideMode) {
    return createDynamicWorkflowClientConfig(overrideMode, "override");
  }

  const rawRemoteMode =
    input.remote && typeof input.remote === "object"
      ? (input.remote as { mode?: unknown }).mode
      : undefined;
  const remoteMode = normalizeDynamicWorkflowMode(rawRemoteMode);
  if (remoteMode) {
    return createDynamicWorkflowClientConfig(remoteMode, "remote");
  }

  return createDynamicWorkflowClientConfig(DEFAULT_DYNAMIC_WORKFLOW_MODE, "default");
}
