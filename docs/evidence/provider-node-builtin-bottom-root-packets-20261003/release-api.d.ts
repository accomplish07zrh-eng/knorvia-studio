import type { ModelConfigRules, ProviderConfigMap, ProviderTemplateMap } from "@knorvia/provider";

export declare const KNORVIA_BUILTIN_RELEASE_SCHEMA_VERSION: 1;

export interface KnorviaBuiltinConfigContent {
  readonly providers: ProviderConfigMap;
  readonly providerTemplates: ProviderTemplateMap;
  readonly modelConfigRules: ModelConfigRules;
}

export interface KnorviaBuiltinRelease {
  readonly schemaVersion: typeof KNORVIA_BUILTIN_RELEASE_SCHEMA_VERSION;
  readonly revision: number;
  readonly config: KnorviaBuiltinConfigContent;
}

export declare function decodeKnorviaBuiltinRelease(input: unknown): KnorviaBuiltinRelease;

export declare function encodeKnorviaBuiltinRelease(release: KnorviaBuiltinRelease): object;

export declare function serializeKnorviaBuiltinRelease(release: KnorviaBuiltinRelease): string;
