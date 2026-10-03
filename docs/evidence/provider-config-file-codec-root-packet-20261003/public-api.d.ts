import type { z } from "zod";

import type { modelSelectionSchema } from "@knorvia/shared/model-selection";

import type { completeModelConfigDataSchema, modelConfigDataSchema } from "@knorvia/shared/model-config";

import type { parsePersonalModelConfigRules, parsePersonalProviderConfigMap, extractManualModelConfig, manualModelConfigSchema, ProviderConfigLayerUpdate } from "@knorvia/provider";

export declare class UnsupportedProviderConfigVersionError extends Error {
  readonly version: number | null;
  constructor(message: string, version: number | null);
}

export declare function decodeProviderConfigFile(input: unknown): ProviderConfigLayerUpdate;

export declare function encodeProviderConfigFile(update: ProviderConfigLayerUpdate): { schemaVersion: 1; config: { providerOrder?: readonly string[]; providerConfigRules: { providerRules: ReturnType<import("@knorvia/provider").ProviderConfigMap["toJSON"]> }; modelConfigRules: ReturnType<import("@knorvia/provider").ModelConfigRules["toPersonalJSON"]>; defaultModelSelection?: import("@knorvia/shared/model-selection").ModelSelection } };
