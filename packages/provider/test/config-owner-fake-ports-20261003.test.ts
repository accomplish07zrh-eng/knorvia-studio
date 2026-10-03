import assert from "node:assert/strict";
import { test } from "node:test";
import { ProviderConfigService, type ProviderModelMembership } from "../src/config-service.js";
import {
  ModelConfig,
  ModelConfigRules,
  ProviderConfig,
  ProviderConfigMap,
  ProviderTemplate,
  ProviderTemplateMap,
  ZhipuAccountAccessConfig,
} from "../src/config/index.js";
import { deferred, FakePersonalRepository, FakeSource } from "./fake-owner-ports-20261003.js";
import type { ProviderConfigLayerSnapshot } from "../src/config-service.js";

test("synthetic config ports retain custom data, layered identity, owned order, atomic drafts/defaults and failure/disposal lifetime", async () => {
  const baseline = new ProviderConfig({
    group: "bigmodel-family",
    builtinModelIds: ["b1", "b2"],
  });
  const builtin = new FakeSource<ProviderConfigLayerSnapshot>({
    revision: "synthetic-builtin:1",
    providers: new ProviderConfigMap([
      { providerId: "builtin", providerName: "Builtin", config: baseline },
      { providerId: "empty-baseline", config: new ProviderConfig({ group: "bigmodel-family" }) },
      {
        providerId: "account",
        config: new ProviderConfig({ group: "zai-family", access: new ZhipuAccountAccessConfig() }),
      },
    ]),
    models: ModelConfigRules.empty(),
    providerTemplates: new ProviderTemplateMap([
      [
        "Template One",
        new ProviderTemplate({
          templateId: "Template One",
          templateNameMap: { "en-US": "Template Name" },
          config: new ProviderConfig({ builtinModelIds: ["t1"] }),
        }),
      ],
    ]),
  });
  const selection = Object.freeze({ providerId: "personal", modelId: "m1" });
  const repository = new FakePersonalRepository({
    revision: "synthetic-personal:0",
    providers: new ProviderConfigMap([
      {
        providerId: "empty-baseline",
        templateId: "Template One",
        config: new ProviderConfig({
          personalModelIds: ["t1", "keep"],
          modelOrder: ["t1", "keep"],
        }),
      },
      {
        providerId: "personal",
        providerName: "Custom",
        config: new ProviderConfig({
          group: "standard-personal",
          personalModelIds: ["m1"],
          modelOrder: ["m1"],
        }),
      },
    ]),
    models: ModelConfigRules.empty().setExact("personal", "m1", new ModelConfig({ enabled: true })),
    providerOrder: ["personal"],
    defaultModelSelection: selection,
  });
  const service = new ProviderConfigService({
    knorviaBuiltinSource: builtin,
    personalRepository: repository,
  });
  assert.deepEqual(Reflect.ownKeys(service), []);
  assert.deepEqual(
    Object.getOwnPropertyNames(ProviderConfigService.prototype).sort(),
    [
      "constructor",
      "read",
      "onDidChange",
      "replacePersonalConfig",
      "savePersonalProviderOverlay",
      "createPersonalProvider",
      "deletePersonalProvider",
      "reorderPersonalProviders",
      "reorderPersonalModels",
      "addPersonalModel",
      "renamePersonalModel",
      "setPersonalModelEnabled",
      "savePersonalModelDraft",
      "deletePersonalModel",
      "dispose",
    ].sort(),
  );
  const reasons: string[] = [];
  const remove = service.onDidChange((reason) => reasons.push(reason));
  builtin.emit("");
  repository.emit("synthetic");
  assert.deepEqual(reasons, ["knorviaBuiltin:", "personal:synthetic"]);
  const first = await service.read();
  assert.ok(Object.isFrozen(first));
  assert.equal(first.revision, '["synthetic-builtin:1","synthetic-personal:0"]');
  assert.equal(first.knorviaBuiltinProviders, builtin.snapshot.providers);
  assert.equal(first.personalProviders, repository.snapshot.providers);
  assert.equal(first.personalProviderOrder, repository.snapshot.providerOrder);
  assert.equal("defaultModelSelection" in first, false);

  const created = await service.createPersonalProvider();
  assert.deepEqual(created, { providerId: "new-provider" });
  assert.ok(Object.isFrozen(created));
  assert.equal(repository.snapshot.providers.get(created.providerId)?.access?.type, "api-key");
  const second = await service.createPersonalProvider({ providerName: " NEW-PROVIDER " });
  assert.equal(second.providerId, "new-provider-2");
  assert.equal(
    repository.snapshot.providers.getRule(second.providerId)?.providerName,
    "NEW-PROVIDER 2",
  );
  const fromTemplate = await service.createPersonalProvider({ templateId: " Template One " });
  assert.equal(fromTemplate.providerId, "template-one");
  assert.equal(repository.snapshot.providers.get(fromTemplate.providerId)?.access, undefined);
  assert.equal(
    repository.snapshot.providers.getRule(fromTemplate.providerId)?.providerName,
    "Template Name",
  );
  assert.equal(repository.snapshot.defaultModelSelection, selection);
  assert.deepEqual(repository.snapshot.providerOrder, [
    "personal",
    "new-provider",
    "new-provider-2",
    "template-one",
  ]);
  await service.reorderPersonalProviders(["unknown", "template-one", "personal", "personal"]);
  assert.deepEqual(repository.snapshot.providerOrder, [
    "template-one",
    "personal",
    "new-provider",
    "new-provider-2",
  ]);

  const unnamedIdLabel = await service.createPersonalProvider({ providerName: "account" });
  assert.equal(
    repository.snapshot.providers.getRule(unnamedIdLabel.providerId)?.providerName,
    "account",
  );
  await service.savePersonalProviderOverlay("empty-baseline", new ProviderConfig());
  assert.deepEqual(repository.snapshot.providers.get("empty-baseline")?.personalModelIds, [
    "t1",
    "keep",
  ]);
  await service.reorderPersonalModels("empty-baseline", ["keep"]);
  assert.deepEqual(repository.snapshot.providers.get("empty-baseline")?.modelOrder, ["keep", "t1"]);
  await assert.rejects(
    service.renamePersonalModel("empty-baseline", "t1", "renamed"),
    /Built-in Model 不能重命名/,
  );

  const member = (
    providerId: string,
    inheritedModelIds: readonly string[],
  ): ProviderModelMembership => ({
    providerId,
    inheritedModelIds,
    personalRevision: repository.snapshot.revision,
    assertCurrent: () => {},
  });
  await service.reorderPersonalModels("builtin", ["b2", "b1"]);
  await service.addPersonalModel(" builtin ", " x ", new ModelConfig({ enabled: false }));
  assert.deepEqual(repository.snapshot.providers.get("builtin")?.modelOrder, ["b2", "b1", "x"]);
  assert.equal(repository.snapshot.models.getExact("builtin", "x")?.enabled, true);
  await service.savePersonalProviderOverlay("builtin", new ProviderConfig(), member("builtin", []));
  assert.deepEqual(repository.snapshot.providers.get("builtin")?.personalModelIds, ["x"]);
  assert.deepEqual(repository.snapshot.providers.get("builtin")?.modelOrder, ["x"]);
  await service.reorderPersonalModels("template-one", ["t1"]);
  await service.addPersonalModel("template-one", "p1", new ModelConfig());
  assert.deepEqual(repository.snapshot.providers.get("template-one")?.modelOrder, ["t1", "p1"]);
  await assert.rejects(
    service.renamePersonalModel("template-one", "t1", "renamed"),
    /Built-in Model 不能重命名/,
  );
  await assert.rejects(
    service.deletePersonalModel("template-one", "t1"),
    /Built-in Model 不能删除/,
  );
  await service.renamePersonalModel("personal", "m1", "m2");
  assert.deepEqual(repository.snapshot.providers.get("personal")?.personalModelIds, ["m2"]);
  assert.equal(repository.snapshot.models.getExact("personal", "m1"), undefined);
  await service.savePersonalModelDraft(
    "personal",
    "m2",
    "m3",
    new ModelConfig(),
    repository.snapshot.revision,
    true,
  );
  assert.deepEqual(repository.snapshot.providers.get("personal")?.modelOrder, ["m3"]);
  assert.equal(repository.snapshot.models.getExact("personal", "m3"), undefined);
  const beforeRevisionFailure = repository.snapshot;
  await assert.rejects(
    service.savePersonalModelDraft("personal", "m3", "m4", new ModelConfig(), "synthetic-stale"),
    /revision conflict/,
  );
  assert.equal(repository.snapshot, beforeRevisionFailure);
  await service.savePersonalModelDraft(
    "personal",
    "m3",
    "m3",
    new ModelConfig({ properties: null }),
    repository.snapshot.revision,
    true,
  );
  assert.equal(repository.snapshot.models.getExact("personal", "m3")?.properties, null);
  await service.setPersonalModelEnabled("personal", "m3", false);
  assert.equal(repository.snapshot.models.getExact("personal", "m3")?.enabled, false);
  assert.equal(repository.snapshot.defaultModelSelection, selection);
  await service.deletePersonalModel("personal", "m3");
  assert.deepEqual(repository.snapshot.providers.get("personal")?.personalModelIds, []);
  await service.deletePersonalProvider("template-one");
  assert.equal(repository.snapshot.providers.has("template-one"), false);
  const beforeDeletedWrite = repository.snapshot;
  await assert.rejects(
    service.addPersonalModel("template-one", "late", new ModelConfig()),
    /Provider 不存在/,
  );
  await assert.rejects(
    service.savePersonalProviderOverlay("template-one", new ProviderConfig()),
    /尚未创建/,
  );
  assert.equal(repository.snapshot, beforeDeletedWrite);
  await assert.rejects(
    service.savePersonalProviderOverlay("account", new ProviderConfig(), undefined, {
      enabled: false,
    }),
    /Account Provider 不允许禁用/,
  );
  await assert.rejects(
    service.savePersonalProviderOverlay("account", new ProviderConfig({ access: null })),
    /Access 只能由/,
  );
  const exactFailure = new Error("synthetic repository failure");
  repository.updateFailure = exactFailure;
  await assert.rejects(
    service.reorderPersonalProviders([]),
    (error: unknown) => error === exactFailure,
  );
  assert.equal(repository.snapshot, beforeDeletedWrite);
  repository.updateFailure = undefined;
  const staleMembership = member("personal", []);
  await service.reorderPersonalProviders([]);
  const beforeStale = repository.snapshot;
  await assert.rejects(
    service.addPersonalModel("personal", "stale", new ModelConfig(), staleMembership),
    /membership revision conflict/,
  );
  assert.equal(repository.snapshot, beforeStale);
  const beforeLabelFailure = repository.snapshot;
  await assert.rejects(
    service.savePersonalProviderOverlay("personal", new ProviderConfig(), undefined, {
      providerName: "Builtin",
    }),
    /名称已存在/,
  );
  assert.equal(repository.snapshot, beforeLabelFailure);
  await service.savePersonalProviderOverlay("personal", new ProviderConfig(), undefined, {
    providerName: " Custom Renamed ",
  });
  assert.equal(repository.snapshot.providers.getRule("personal")?.providerName, "Custom Renamed");

  const metadataReads: string[] = [];
  await service.savePersonalProviderOverlay("personal", new ProviderConfig(), undefined, {
    get templateId() {
      metadataReads.push("templateId");
      return undefined;
    },
    get enabled() {
      metadataReads.push("enabled");
      return undefined;
    },
    get providerName() {
      metadataReads.push("providerName");
      return "  ";
    },
  });
  assert.deepEqual(metadataReads, ["templateId", "enabled", "providerName", "providerName"]);
  assert.equal(repository.snapshot.providers.getRule("personal")?.providerName, null);

  const replacement = {
    providers: repository.snapshot.providers,
    models: repository.snapshot.models,
  };
  await service.replacePersonalConfig(replacement);
  assert.equal(repository.updates.at(-1), replacement);
  assert.equal(repository.snapshot.defaultModelSelection, undefined);
  remove();
  const blockedRead = deferred<ProviderConfigLayerSnapshot>();
  builtin.readAction = () => blockedRead.promise;
  const reading = service.read();
  service.dispose();
  service.dispose();
  blockedRead.resolve(builtin.snapshot);
  assert.equal((await reading).knorviaBuiltinProviders, builtin.snapshot.providers);
  assert.equal(builtin.disposeCount, 1);
  assert.equal(repository.disposeCount, 1);
  assert.throws(() => service.onDidChange(() => {}), /ProviderConfigService 已 dispose/);
  await assert.rejects(service.read(), /ProviderConfigService 已 dispose/);
  assert.equal(await service.renamePersonalModel("personal", "same", "same"), repository.snapshot);
});
