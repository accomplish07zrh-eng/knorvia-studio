import {
  ProviderConfig,
  ProviderConfigMap,
  ZhipuAccountAccessConfig,
  type ModelId,
  type ProviderId,
} from "./config/index.js";
import type {
  AccountProviderResolveInput,
  AccountProviderResolver,
} from "./account-provider-service.js";
import type {
  AccountProviderState,
  AccountProviderUnavailableReason,
} from "./account-provider-state.js";

export type AccountProviderConnectionResult = {
  /** 账号/组织身份变化后禁止沿用旧快照；仅用于本轮解析，不进入配置。 */
  readonly resetPrevious?: boolean;
  readonly current?: boolean;
  readonly connectionKey?: string;
  readonly effectiveAt?: number;
} & (
  | {
      readonly providerId: ProviderId;
      readonly status: "available" | "pending";
      readonly models?: readonly ModelId[];
    }
  | {
      readonly providerId: ProviderId;
      readonly status: "unavailable" | "unknown";
      /** 仅在 status === "unavailable" 时携带；unknown 表示本轮无法判定原因。 */
      readonly unavailableReason?: AccountProviderUnavailableReason;
    }
);

export interface ResolveAccountProviderConfigsInput {
  readonly configuredProviders: ProviderConfigMap;
  readonly previousProviders: ProviderConfigMap;
  readonly connections: readonly AccountProviderConnectionResult[];
}

export type AccountProviderConnectionResolver = (
  input: Omit<AccountProviderResolveInput, "previousProviders">,
) => Promise<readonly AccountProviderConnectionResult[]>;

export function createAccountProviderConfigResolver(
  resolveConnections: AccountProviderConnectionResolver,
): AccountProviderResolver {
  return async (input) => {
    const connections = await resolveConnections({
      configRevision: input.configRevision,
      configuredProviders: input.configuredProviders,
      reasons: input.reasons ?? [],
    });
    const providers = resolveAccountProviderConfigs({
      configuredProviders: input.configuredProviders,
      previousProviders: input.previousProviders,
      connections,
    });
    const states: Record<string, AccountProviderState> = {};

    for (const connection of connections) {
      const previous = connection.resetPrevious
        ? undefined
        : input.previousStates?.[connection.providerId];
      const access = providers.get(connection.providerId)?.access;
      const unavailableReason =
        connection.status === "unknown" && previous
          ? previous.unavailableReason
          : connection.status === "unavailable"
            ? connection.unavailableReason
            : undefined;

      states[connection.providerId] = Object.freeze({
        ...(connection.status === "unknown" ? previous : {}),
        availability:
          connection.status === "unknown" && previous ? previous.availability : connection.status,
        entitled: access?.type === "zhipu-account" && access.entitled === true,
        ...(unavailableReason !== undefined ? { unavailableReason } : {}),
        ...(connection.current !== undefined ? { current: connection.current } : {}),
        connectionKey: connection.connectionKey,
        ...(connection.effectiveAt !== undefined ? { effectiveAt: connection.effectiveAt } : {}),
      });
    }

    return Object.freeze({ providers, states: Object.freeze(states) });
  };
}

export function resolveAccountProviderConfigs(
  input: ResolveAccountProviderConfigsInput,
): ProviderConfigMap {
  const connections = indexConnections(input.configuredProviders, input.connections);
  const entries: Array<readonly [ProviderId, ProviderConfig]> = [];

  for (const [providerId, configured] of input.configuredProviders.entries()) {
    const access = configured.access;
    if (access?.type !== "zhipu-account") {
      continue;
    }

    const connection: AccountProviderConnectionResult = connections.get(providerId) ?? {
      providerId,
      status: "unknown",
    };
    entries.push([providerId, resolveAccountConfig(providerId, access, connection, input)]);
  }

  return new ProviderConfigMap(entries);
}

function indexConnections(
  configuredProviders: ProviderConfigMap,
  connections: readonly AccountProviderConnectionResult[],
): Map<ProviderId, AccountProviderConnectionResult> {
  const indexed = new Map<ProviderId, AccountProviderConnectionResult>();

  for (const connection of connections) {
    if (indexed.has(connection.providerId)) {
      throw new Error(`重复 Account Provider 连接结果: ${connection.providerId}`);
    }

    const configured = configuredProviders.get(connection.providerId);
    if (!configured) {
      throw new Error(`Account 连接指向未配置 Provider: ${connection.providerId}`);
    }
    if (configured.access?.type !== "zhipu-account") {
      throw new Error(`Account 连接指向非 Account Provider: ${connection.providerId}`);
    }

    indexed.set(connection.providerId, connection);
  }

  return indexed;
}

function resolveAccountConfig(
  providerId: ProviderId,
  access: ZhipuAccountAccessConfig,
  connection: AccountProviderConnectionResult,
  input: ResolveAccountProviderConfigsInput,
): ProviderConfig {
  if (connection.status === "available" || connection.status === "pending") {
    const builtinModelIds =
      access.mode === "start-plan" ? normalizeModelIds(connection.models) : undefined;

    return new ProviderConfig({
      access: new ZhipuAccountAccessConfig({
        entitled: connection.status === "available",
      }),
      ...(builtinModelIds !== undefined ? { builtinModelIds } : {}),
    });
  }

  if (connection.status === "unavailable") {
    return withoutEntitlement();
  }

  const previous = connection.resetPrevious ? undefined : input.previousProviders.get(providerId);
  return previous || withoutEntitlement();
}

function withoutEntitlement(): ProviderConfig {
  return new ProviderConfig({
    access: new ZhipuAccountAccessConfig({ entitled: false }),
  });
}

function normalizeModelIds(values: readonly ModelId[] | undefined): readonly ModelId[] {
  const normalized: ModelId[] = [];
  for (const value of values ?? []) {
    const modelId = value.trim();
    if (modelId) {
      normalized.push(modelId);
    }
  }
  return Object.freeze(normalized);
}
