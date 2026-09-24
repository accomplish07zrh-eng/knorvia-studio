import {
  MutableAccountProviderConfigSource,
  parseAccountProviderConfigMap,
  type AccountProviderConfigSnapshot,
  type AccountProviderStates,
} from "@knorvia/provider";
import { isBuiltinModelProviderId } from "@knorvia/shared";
import {
  NodeModelSelectionConfigRepository,
  NodeProviderRegistryRuntime,
  resolveNodeProviderRuntimePaths,
} from "@knorvia/provider-node";
import { readLegacyCliPersonalProviderConfig } from "./legacy-cli-personal-provider-config-importer.js";

export interface ProcessProviderRegistryRuntimeOptions {
  readonly standalone?: { readonly legacyCliUserConfigFilePath?: string };
}

export async function startProcessProviderRegistryRuntime(
  env: Readonly<Record<string, string | undefined>>,
  options: ProcessProviderRegistryRuntimeOptions = {},
) {
  const paths = resolveNodeProviderRuntimePaths(env);
  if (!paths) throw new Error("Knorvia Studio requires bundled and personal provider configuration paths.");
  // 账号已移除；保留协议所需的空配置层，不加载产品凭据或下载上游配置。
  const accountSource = new MutableAccountProviderConfigSource();
  const runtime = new NodeProviderRegistryRuntime({
    ...paths,
    accountSource,
    ...(options.standalone?.legacyCliUserConfigFilePath ? {
      importLegacy: () => readLegacyCliPersonalProviderConfig({filePath: options.standalone!.legacyCliUserConfigFilePath!}),
    } : {}),
  });
  let repository: NodeModelSelectionConfigRepository | undefined;
  try {
    await runtime.start();
    const snapshot = runtime.registryService.getSnapshot()!;
    const modelSelectionConfigRepository = new NodeModelSelectionConfigRepository({personalRepository: runtime.personalRepository});
    repository = modelSelectionConfigRepository;
    const configuredDefaultModelSelection = await modelSelectionConfigRepository.read();
    return Object.freeze({
      accountSource,
      async syncAccountProviderConfig(next: AccountProviderConfigSnapshot): Promise<boolean> {
        const changed = accountSource.replace(next, "host-account-config");
        await runtime.registryService.refresh("host-account-config");
        return changed;
      },
      dispose() { modelSelectionConfigRepository.dispose(); runtime.dispose(); },
      providerRuntimeHeadersPort: undefined,
      runtime,
      snapshot,
      modelSelectionConfigRepository,
      configuredDefaultModelSelection,
    });
  } catch (error) { repository?.dispose(); runtime.dispose(); throw error; }
}

/** 把协议信封解析为进程 Registry 使用的第三层 Account Config Overlay。 */
export function parseProcessAccountProviderConfigSnapshot(input: {
  readonly revision: string;
  readonly basedOnKnorviaBuiltinRevision: string;
  readonly providers: unknown;
  readonly states?: AccountProviderStates;
}): AccountProviderConfigSnapshot {
  const revision = input.revision.trim();
  if (!revision) throw new Error("Account Config revision 不能为空");
  const basedOnKnorviaBuiltinRevision = input.basedOnKnorviaBuiltinRevision.trim();
  if (!basedOnKnorviaBuiltinRevision) {
    throw new Error("Account Config Built-in revision 不能为空");
  }
  const providers = parseAccountProviderConfigMap(input.providers);
  for (const [providerId, provider] of providers.entries()) {
    // 仅约束托管 Worker 的普通账号信封；独立 CLI、API 和闲时不需要 current。
    if (
      isBuiltinModelProviderId(providerId) &&
      provider.access?.type === "zhipu-account" &&
      provider.access.entitled &&
      typeof input.states?.[providerId]?.current !== "boolean"
    ) {
      throw new Error(`Account State 缺少 current: ${providerId}`);
    }
  }
  return Object.freeze({
    revision,
    basedOnKnorviaBuiltinRevision,
    providers,
    // 与 Overlay 属于同一快照；不能只更新 revision 却丢掉当前连接事实。
    ...(input.states ? { states: input.states } : {}),
  });
}
