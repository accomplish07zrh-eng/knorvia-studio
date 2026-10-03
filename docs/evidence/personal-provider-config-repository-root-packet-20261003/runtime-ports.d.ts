import type { Hash } from "node:crypto";
import type { ProviderConfigLayerUpdate, ProviderConfigMap, ModelConfigRules } from "@knorvia/provider";

export interface SharedFileLockOptions {
  lockRetryDelaysMs?: readonly number[];
  lockOwnerlessGraceMs?: number;
  lockMaxWaitMs?: number;
}

export declare function withFileLock<T>(
  filePath: string,
  operation: () => Promise<T>,
  options?: SharedFileLockOptions,
): Promise<T>;

export declare function atomicWritePrivateTextFile(
  filePath: string,
  content: string,
  renameRetryDelaysMs?: readonly number[],
): Promise<void>;

export declare function decodeProviderConfigFile(input: unknown): ProviderConfigLayerUpdate;

export type EncodedPersonalProviderConfigFile = {
  schemaVersion: 1;
  config: {
    providerOrder?: readonly string[];
    providerConfigRules: { providerRules: ReturnType<ProviderConfigMap["toJSON"]> };
    modelConfigRules: ReturnType<ModelConfigRules["toPersonalJSON"]>;
    defaultModelSelection?: import("@knorvia/shared/model-selection").ModelSelection;
  };
};

export declare function encodeProviderConfigFile(
  update: ProviderConfigLayerUpdate,
): EncodedPersonalProviderConfigFile;

export declare class UnsupportedProviderConfigVersionError extends Error {
  readonly version: number | null;
  constructor(message: string, version: number | null);
}

// Conceptual fake/observation boundary only; not a new production injection API.
export interface RepositoryRuntimeObservationPorts {
  readFile(filePath: string, encoding: "utf8"): Promise<string>;
  createHash(algorithm: "sha256"): Pick<Hash, "update" | "digest">;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  atomicWritePrivateTextFile: typeof atomicWritePrivateTextFile;
  withFileLock: typeof withFileLock;
  decodeProviderConfigFile: typeof decodeProviderConfigFile;
  encodeProviderConfigFile: typeof encodeProviderConfigFile;
}
