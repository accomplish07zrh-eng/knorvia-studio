import { z } from "zod";
import {
  parseKnorviaBuiltinProviderConfigRules,
  parseKnorviaBuiltinModelConfigRules,
  type ModelConfigRules,
  type ProviderConfigMap,
  type ProviderTemplateMap,
} from "@knorvia/provider";
export const KNORVIA_BUILTIN_RELEASE_SCHEMA_VERSION = 1 as const;
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
const envelope = z
  .object({
    schemaVersion: z.literal(KNORVIA_BUILTIN_RELEASE_SCHEMA_VERSION),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    config: z.object({ providerConfigRules: z.unknown(), modelConfigRules: z.unknown() }).strict(),
  })
  .strict();
export function decodeKnorviaBuiltinRelease(input: unknown): KnorviaBuiltinRelease {
  const value = envelope.parse(input);
  const { providers, providerTemplates } = parseKnorviaBuiltinProviderConfigRules(
    value.config.providerConfigRules,
  );
  if (providers.has("builtin:zapi"))
    throw new Error("Knorvia Studio Built-in Release 包含已退出的 Provider: builtin:zapi");
  return Object.freeze({
    schemaVersion: KNORVIA_BUILTIN_RELEASE_SCHEMA_VERSION,
    revision: value.revision,
    config: Object.freeze({
      providers,
      providerTemplates,
      modelConfigRules: parseKnorviaBuiltinModelConfigRules(value.config.modelConfigRules),
    }),
  });
}
export function encodeKnorviaBuiltinRelease(release: KnorviaBuiltinRelease): object {
  return {
    schemaVersion: KNORVIA_BUILTIN_RELEASE_SCHEMA_VERSION,
    revision: release.revision,
    config: {
      providerConfigRules: {
        templateRules: release.config.providerTemplates.toJSON(),
        providerRules: release.config.providers.toJSON(),
      },
      modelConfigRules: release.config.modelConfigRules.toKnorviaBuiltinJSON(),
    },
  };
}
export function serializeKnorviaBuiltinRelease(release: KnorviaBuiltinRelease): string {
  return JSON.stringify(encodeKnorviaBuiltinRelease(release));
}
