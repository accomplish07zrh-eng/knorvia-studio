import {
  ApiKeyAccessConfig,
  ProviderConfig,
  resolveProviderTemplateName,
  type ProviderConfigMap,
  type ProviderConfigRule,
  type ProviderId,
  type ProviderTemplate,
  type ProviderTemplateId,
} from "./config/index.js";
import { resolveOwnedOrder } from "./owned-order.js";
import { assertMembership, modelOrder, providerBaseline } from "./config-service-models.js";
import type {
  CreatePersonalProviderInput,
  ProviderConfigLayerSnapshot,
  ProviderConfigLayerUpdate,
  ProviderModelMembership,
} from "./config-service.js";

function personalProviderIds(providers: ProviderConfigMap): ProviderId[] {
  return providers
    .entries()
    .filter(([, config]) => config.group === "standard-personal")
    .map(([id]) => id);
}

function providerOrder(
  providers: ProviderConfigMap,
  requested: readonly ProviderId[],
): ProviderId[] {
  return [...resolveOwnedOrder([], personalProviderIds(providers), requested)];
}

function labelFor(providers: ProviderConfigMap, providerId: ProviderId): string {
  return providers.getRule(providerId)?.providerName ?? "";
}

function labelKey(label: string): string {
  return label.trim().toLocaleLowerCase();
}

function uniqueId(base: string, occupied: ReadonlySet<string>): string {
  let candidate = base;
  for (let suffix = 2; occupied.has(candidate); suffix += 1) {
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

function uniqueLabel(base: string, occupied: ReadonlySet<string>): string {
  let candidate = base;
  for (let suffix = 2; occupied.has(labelKey(candidate)); suffix += 1) {
    candidate = `${base} ${suffix}`;
  }
  return candidate;
}

export function saveProviderOverlay(
  current: ProviderConfigLayerSnapshot,
  builtin: ProviderConfigLayerSnapshot,
  providerId: ProviderId,
  config: ProviderConfig,
  membership?: ProviderModelMembership,
  metadata?: Pick<ProviderConfigRule, "providerName" | "templateId" | "enabled">,
): ProviderConfigLayerUpdate {
  assertMembership(membership, providerId, current);
  const builtinProvider = builtin.providers.get(providerId);
  const currentPersonal = current.providers.get(providerId);
  const effective = builtin.providers.overlay(current.providers);
  if (builtinProvider?.access?.type === "zhipu-account" && metadata?.enabled === false) {
    throw new Error(`Account Provider 不允许禁用: ${providerId}`);
  }
  if (builtinProvider?.access?.type === "zhipu-account" && config.access !== undefined) {
    throw new Error(
      `固定 Account Provider 的 Access 只能由 Knorvia Studio Built-in Config 声明: ${providerId}`,
    );
  }
  if (!currentPersonal && !builtinProvider) {
    throw new Error(`Personal Provider 尚未创建: ${providerId}`);
  }

  let suppliedConfig: ProviderConfig;
  if (builtinProvider) {
    if (config.group != null && config.group !== builtinProvider.group) {
      throw new Error(`Personal Overlay 不能改写 Built-in Provider group: ${providerId}`);
    }
    suppliedConfig = config.withoutGroup();
  } else {
    const group = config.group ?? currentPersonal?.group;
    if (group !== "standard-personal") {
      throw new Error(`Personal-only Provider 必须使用 standard-personal group: ${providerId}`);
    }
    suppliedConfig = config.overlay(new ProviderConfig({ group }));
  }

  let normalizedMembership = currentPersonal;
  if (currentPersonal) {
    const inherited = [
      ...new Set(
        membership?.inheritedModelIds ??
          providerBaseline(providerId, builtin, current)?.builtinModelIds ??
          [],
      ),
    ];
    const inheritedSet = new Set(inherited);
    const personal = [...new Set(currentPersonal.personalModelIds ?? [])].filter(
      (id) => !inheritedSet.has(id),
    );
    normalizedMembership = currentPersonal.withPersonalModelIds(personal);
    if (currentPersonal.modelOrder != null) {
      normalizedMembership = normalizedMembership.withModelOrder(
        modelOrder(inherited, personal, currentPersonal.modelOrder),
      );
    }
  }
  const nextRule: ProviderConfigRule = {
    ...current.providers.getRule(providerId),
    providerId,
    ...(metadata?.templateId !== undefined ? { templateId: metadata.templateId } : {}),
    ...(metadata?.enabled !== undefined ? { enabled: metadata.enabled } : {}),
    ...(metadata?.providerName !== undefined
      ? { providerName: metadata.providerName?.trim() || null }
      : {}),
    config: suppliedConfig.withModelMembershipFrom(normalizedMembership),
  };
  const providers = current.providers.setRule(nextRule);
  const nextEffective = builtin.providers.overlay(providers);
  const currentKey = labelKey(labelFor(effective, providerId));
  const nextLabel = labelFor(nextEffective, providerId).trim();
  const nextKey = nextLabel.toLocaleLowerCase();
  if (nextKey && nextKey !== currentKey) {
    for (const otherId of nextEffective.keys()) {
      if (otherId !== providerId && labelKey(labelFor(nextEffective, otherId)) === nextKey) {
        throw new Error(`Provider 名称已存在: ${nextLabel}`);
      }
    }
  }
  return {
    providers,
    models: current.models,
    providerOrder: current.providerOrder,
  };
}
interface ProviderCreationContext {
  readonly templateId: ProviderTemplateId | undefined;
  readonly template: ProviderTemplate | undefined;
}

export function prepareProviderCreation(
  builtin: ProviderConfigLayerSnapshot,
  input: CreatePersonalProviderInput,
): ProviderCreationContext {
  const templateId = input.templateId?.trim();
  const template = templateId ? builtin.providerTemplates?.get(templateId) : undefined;
  if (templateId && !template) {
    throw new Error(`Provider Template 不存在: ${templateId}`);
  }
  if (input.initialConfig?.group !== undefined) {
    throw new Error("initialConfig 不能包含 group");
  }
  if (input.initialConfig?.builtinModelIds !== undefined) {
    throw new Error("initialConfig 不能包含 builtinModelIds");
  }
  return { templateId, template };
}

export function createProviderUpdate(
  current: ProviderConfigLayerSnapshot,
  builtin: ProviderConfigLayerSnapshot,
  input: CreatePersonalProviderInput,
  creation: ProviderCreationContext,
  captureCreatedId: (providerId: ProviderId) => void,
): ProviderConfigLayerUpdate {
  const { templateId, template } = creation;
  const idSeed = templateId
    ? templateId
        .trim()
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "new-provider"
    : "new-provider";
  const providerId = uniqueId(
    idSeed,
    new Set([...builtin.providers.keys(), ...current.providers.keys()]),
  );
  const seed =
    (
      input.providerName ??
      (template && templateId
        ? resolveProviderTemplateName(templateId, template, input.locale ?? "en-US")
        : "new-provider")
    ).trim() || "new-provider";
  const templatedPersonal = current.providers.mapConfigs((config, _id, rule) => {
    const templateConfig = rule.templateId
      ? builtin.providerTemplates?.get(rule.templateId)?.config
      : undefined;
    return templateConfig ? templateConfig.overlay(config) : config;
  });
  const effective = builtin.providers.overlay(templatedPersonal);
  const providerName = uniqueLabel(
    seed,
    new Set(effective.keys().map((id) => labelKey(labelFor(effective, id)))),
  );
  const config = new ProviderConfig({
    group: "standard-personal",
    access: templateId ? undefined : new ApiKeyAccessConfig(),
    personalModelIds: [],
    modelOrder: [],
  }).overlay(input.initialConfig ?? new ProviderConfig());
  const providers = current.providers.setRule({
    providerId,
    ...(templateId ? { templateId } : {}),
    providerName,
    config,
  });
  const priorOrder = providerOrder(current.providers, current.providerOrder ?? []).filter(
    (id) => id !== providerId,
  );
  const nextOrder = providerOrder(providers, [...priorOrder, providerId]);
  captureCreatedId(providerId);
  return {
    providers,
    models: current.models,
    providerOrder: nextOrder,
  };
}

export function deleteProviderUpdate(
  current: ProviderConfigLayerSnapshot,
  providerId: ProviderId,
): ProviderConfigLayerUpdate {
  return {
    providers: current.providers.delete(providerId),
    models: current.models.deleteExactForProvider(providerId),
    providerOrder: current.providerOrder?.filter((id) => id !== providerId),
  };
}

export function reorderProvidersUpdate(
  current: ProviderConfigLayerSnapshot,
  providerIds: readonly ProviderId[],
): ProviderConfigLayerUpdate {
  return {
    providers: current.providers,
    models: current.models,
    providerOrder: providerOrder(current.providers, providerIds),
  };
}
