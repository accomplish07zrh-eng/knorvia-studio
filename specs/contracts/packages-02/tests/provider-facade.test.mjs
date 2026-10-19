// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { providerNode, providerPublic as provider } from "./entry.mjs";

const {
  ModelConfig,
  ModelConfigRules,
  ModelOptionSpecsConfig,
  ModelPropertiesConfig,
  ProviderConfig,
  ProviderConfigMap,
  ProviderRegistryService,
  ProviderTemplateMap,
  ZhipuAccountAccessConfig,
  ProviderApiConfig,
} = provider;
const { createNodeModelSelectionFacade } = providerNode;

const START_ZAI = "account:zai-start-plan";
const START_BIGMODEL = "account:bigmodel-start-plan";
const ZAI_INDIVIDUAL = "account:zai-individual-coding-plan";
const BIGMODEL_INDIVIDUAL = "account:bigmodel-individual-coding-plan";
const ZAI_OFFPEAK = "account:zai-offpeak-idle-plan";
const BIGMODEL_OFFPEAK = "account:bigmodel-offpeak-idle-plan";
const HIDDEN_ORDINARY = "account:zai-offpeak-extra";

const modelProperties = new ModelPropertiesConfig({
  requiresMfjsToolSchema: false,
  contextWindow: 128000,
  inputFormat: {
    supportsText: true,
    supportsImage: true,
    supportsVideo: false,
    supportsAudio: false,
    supportsPdf: false,
  },
  outputFormat: { supportsText: true },
  supportsToolCall: true,
  supportsJsonSchemaOutput: true,
  supportsNativeWebSearch: true,
  supportsMidConversationSystem: false,
});

function completeModelConfig() {
  return new ModelConfig({
    enabled: true,
    properties: modelProperties,
    optionSpecs: new ModelOptionSpecsConfig({
      reasoningLevel: {
        values: ["disabled", "high"],
        map: '{"reasoning_effort": reasoningLevel}',
      },
      maxOutputTokens: { max: 8192, map: '{"max_tokens": maxOutputTokens}' },
    }),
  });
}

function builtinRules() {
  return new ModelConfigRules([
    {
      type: "model",
      modelMatch: ".*glm-5(?:[.\\-:/\\[].*)?",
      config: completeModelConfig(),
    },
    {
      type: "model",
      modelMatch: ".*GLM-5\\.2(?:[.\\-:/\\[].*)?",
      config: completeModelConfig(),
    },
    {
      type: "model",
      modelMatch: ".*glm-4(?:[.\\-:/\\[].*)?",
      config: completeModelConfig(),
    },
  ]);
}

function accountProvider({ family = "zai", mode = "individual-coding-plan", hidden = false } = {}) {
  return new ProviderConfig({
    group: family === "bigmodel" ? "bigmodel-family" : "zai-family",
    access: new ZhipuAccountAccessConfig({
      accountType: family,
      mode,
      entitled: true,
    }),
    api: new ProviderApiConfig({
      type: "openai-chat-completions",
      baseUrl: "https://api.example.com",
    }),
    builtinModelIds: ["glm-5", "GLM-5.2", "glm-4"],
    ...(hidden ? { visibility: "hidden" } : {}),
  });
}

function builtinProviders() {
  return new ProviderConfigMap([
    [START_ZAI, accountProvider({ mode: "start-plan" })],
    [START_BIGMODEL, accountProvider({ family: "bigmodel", mode: "start-plan" })],
    [ZAI_INDIVIDUAL, accountProvider()],
    [BIGMODEL_INDIVIDUAL, accountProvider({ family: "bigmodel" })],
    [ZAI_OFFPEAK, accountProvider({ mode: "off-peak", hidden: true })],
    [BIGMODEL_OFFPEAK, accountProvider({ family: "bigmodel", mode: "off-peak", hidden: true })],
    [
      HIDDEN_ORDINARY,
      new ProviderConfig({
        group: "zai-family",
        access: new ZhipuAccountAccessConfig({
          accountType: "zai",
          mode: "off-peak",
          entitled: true,
        }),
        api: new ProviderApiConfig({
          type: "openai-chat-completions",
          baseUrl: "https://api.example.com",
        }),
        builtinModelIds: ["glm-5"],
        visibility: "hidden",
      }),
    ],
  ]);
}

function configSnapshot(personalModels = ModelConfigRules.empty()) {
  return {
    revision: "cfg:1",
    knorviaBuiltinRevision: "builtin:1",
    personalRevision: "personal:1",
    knorviaBuiltinProviders: builtinProviders(),
    knorviaBuiltinProviderTemplates: ProviderTemplateMap.empty(),
    personalProviders: ProviderConfigMap.empty(),
    knorviaBuiltinModelRules: builtinRules(),
    personalModels,
    personalProviderOrder: [],
  };
}

function accountSnapshot(states) {
  return {
    revision: "account:1",
    basedOnKnorviaBuiltinRevision: "builtin:1",
    providers: ProviderConfigMap.empty(),
    states,
  };
}

function staticSource(snapshot) {
  return {
    async read() {
      return snapshot;
    },
    onDidChange() {
      return () => {};
    },
  };
}

const current = () => ({ availability: "available", entitled: true, current: true });

async function createHarness({ states = {}, personalModels } = {}) {
  const service = new ProviderRegistryService({
    configSource: staticSource(configSnapshot(personalModels)),
    accountSource: staticSource(accountSnapshot(states)),
  });
  await service.start();
  return { service, facade: createNodeModelSelectionFacade(service) };
}

function select(providerId, reasoningLevel = "disabled", modelId = "glm-5") {
  return {
    providerId,
    modelId,
    ...(reasoningLevel === null ? {} : { options: { reasoningLevel } }),
  };
}

function resolve(facade, selection) {
  return facade.getView(undefined, undefined, { selection });
}

function outcome(facade, selection) {
  const { effectiveSelection, selectionIssue } = resolve(facade, selection);
  return {
    effectiveSelection,
    ...(selectionIssue === undefined ? {} : { selectionIssue }),
  };
}

test("B26 Start Plan 按普通 Provider 解析，其余内置账号沿唯一当前连接改写", async () => {
  const { service, facade } = await createHarness({
    states: {
      [START_ZAI]: current(),
      [ZAI_INDIVIDUAL]: current(),
    },
  });
  try {
    assert.deepEqual(resolve(facade, select(START_ZAI)).effectiveSelection, select(START_ZAI));
    assert.deepEqual(
      resolve(facade, select(START_BIGMODEL)).effectiveSelection,
      select(START_BIGMODEL),
    );
    assert.deepEqual(
      resolve(facade, select(BIGMODEL_INDIVIDUAL)).effectiveSelection,
      select(ZAI_INDIVIDUAL),
    );
    assert.deepEqual(
      resolve(facade, select(ZAI_INDIVIDUAL)).effectiveSelection,
      select(ZAI_INDIVIDUAL),
    );
    assert.deepEqual(outcome(facade, select("account:missing")), {
      effectiveSelection: null,
      selectionIssue: "provider-not-found",
    });
    assert.deepEqual(outcome(facade, select(ZAI_INDIVIDUAL, "disabled", "missing-model")), {
      effectiveSelection: null,
      selectionIssue: "model-not-found",
    });
    assert.equal(facade.getView(undefined, 7, { selection: select(START_ZAI) }).revision, 7);
  } finally {
    service.dispose();
  }
});

test("B26 没有或存在多个当前连接时账号选择不可用，Start Plan 不受影响", async () => {
  const none = await createHarness();
  try {
    assert.deepEqual(outcome(none.facade, select(ZAI_INDIVIDUAL)), {
      effectiveSelection: null,
      selectionIssue: "account-connection-unavailable",
    });
    assert.deepEqual(resolve(none.facade, select(START_ZAI)).effectiveSelection, select(START_ZAI));
  } finally {
    none.service.dispose();
  }

  const two = await createHarness({
    states: {
      [ZAI_INDIVIDUAL]: current(),
      [BIGMODEL_INDIVIDUAL]: current(),
    },
  });
  try {
    assert.deepEqual(outcome(two.facade, select(ZAI_INDIVIDUAL)), {
      effectiveSelection: null,
      selectionIssue: "account-connection-unavailable",
    });
  } finally {
    two.service.dispose();
  }
});

test("B26 hidden Provider 只对 Off-Peak ID 可选，且不出现在选择视图", async () => {
  const { service, facade } = await createHarness({
    states: { [ZAI_INDIVIDUAL]: current() },
  });
  try {
    const visible = facade.getView().providers.map((item) => item.providerId);
    assert.ok(visible.includes(START_ZAI));
    assert.ok(visible.includes(ZAI_INDIVIDUAL));
    assert.ok(!visible.includes(ZAI_OFFPEAK));
    assert.ok(!visible.includes(BIGMODEL_OFFPEAK));
    assert.ok(!visible.includes(HIDDEN_ORDINARY));

    assert.deepEqual(resolve(facade, select(ZAI_OFFPEAK)).effectiveSelection, select(ZAI_OFFPEAK));
    assert.deepEqual(
      resolve(facade, select(BIGMODEL_OFFPEAK)).effectiveSelection,
      select(BIGMODEL_OFFPEAK),
    );
    assert.deepEqual(outcome(facade, select(HIDDEN_ORDINARY)), {
      effectiveSelection: null,
      selectionIssue: "provider-not-found",
    });
  } finally {
    service.dispose();
  }
});

test("B26 旧档位 off 仅在命中原 rename 规则时改写为 disabled 且结果稳定", async () => {
  const { service, facade } = await createHarness({
    states: { [ZAI_INDIVIDUAL]: current() },
  });
  try {
    assert.deepEqual(outcome(facade, select(ZAI_INDIVIDUAL, "off")).effectiveSelection, {
      ...select(ZAI_INDIVIDUAL),
      options: { reasoningLevel: "disabled" },
    });
    assert.deepEqual(
      outcome(facade, select(ZAI_INDIVIDUAL, "off")),
      outcome(facade, select(ZAI_INDIVIDUAL, "off")),
    );
  } finally {
    service.dispose();
  }
});

test("B26 nothink 只命中 GLM-5.2 的 rename 规则，不串用到同 Provider 其他模型", async () => {
  const { service, facade } = await createHarness({
    states: { [ZAI_INDIVIDUAL]: current() },
  });
  try {
    assert.deepEqual(
      resolve(facade, select(ZAI_INDIVIDUAL, "nothink", "GLM-5.2")).effectiveSelection,
      {
        ...select(ZAI_INDIVIDUAL, "disabled", "GLM-5.2"),
        options: { reasoningLevel: "disabled" },
      },
    );
    assert.deepEqual(outcome(facade, select(ZAI_INDIVIDUAL, "off", "GLM-5.2")), {
      effectiveSelection: { providerId: ZAI_INDIVIDUAL, modelId: "GLM-5.2" },
      selectionIssue: "reasoning-level-not-supported",
    });
  } finally {
    service.dispose();
  }
});

test("B26 不在 rename 表的模型与缺失档位保留 Provider 门面 issue", async () => {
  const { service, facade } = await createHarness({
    states: { [ZAI_INDIVIDUAL]: current() },
  });
  try {
    assert.deepEqual(outcome(facade, select(ZAI_INDIVIDUAL, "off", "glm-4")), {
      effectiveSelection: { providerId: ZAI_INDIVIDUAL, modelId: "glm-4" },
      selectionIssue: "reasoning-level-not-supported",
    });
    assert.deepEqual(outcome(facade, select(ZAI_INDIVIDUAL, null)), {
      effectiveSelection: { providerId: ZAI_INDIVIDUAL, modelId: "glm-5" },
      selectionIssue: "reasoning-level-missing",
    });
  } finally {
    service.dispose();
  }
});

test("B26 个人精确规则显式声明档位字段时禁用旧档位映射", async () => {
  const personalModels = new ModelConfigRules([
    {
      type: "provider-model",
      providerId: ZAI_INDIVIDUAL,
      modelId: "glm-5",
      config: new ModelConfig({
        optionSpecs: new ModelOptionSpecsConfig({
          reasoningLevel: { map: '{"reasoning_effort": reasoningLevel}' },
        }),
      }),
    },
  ]);
  const { service, facade } = await createHarness({
    states: { [ZAI_INDIVIDUAL]: current() },
    personalModels,
  });
  try {
    assert.deepEqual(outcome(facade, select(ZAI_INDIVIDUAL, "off")), {
      effectiveSelection: { providerId: ZAI_INDIVIDUAL, modelId: "glm-5" },
      selectionIssue: "reasoning-level-not-supported",
    });
    assert.deepEqual(
      resolve(facade, select(ZAI_INDIVIDUAL, "disabled")).effectiveSelection,
      select(ZAI_INDIVIDUAL),
    );
  } finally {
    service.dispose();
  }
});

test("B26 默认偏好只归一化旧档位，不改写账号身份", async () => {
  const { service, facade } = await createHarness({
    states: {
      [START_ZAI]: current(),
      [ZAI_INDIVIDUAL]: current(),
    },
  });
  try {
    assert.deepEqual(
      facade.getView(select(BIGMODEL_INDIVIDUAL)).preferredSelection,
      select(BIGMODEL_INDIVIDUAL),
    );
    assert.deepEqual(
      facade.getView(select(ZAI_INDIVIDUAL, "off")).preferredSelection,
      select(ZAI_INDIVIDUAL),
    );
    assert.deepEqual(facade.getView(select(START_ZAI)).preferredSelection, select(START_ZAI));
  } finally {
    service.dispose();
  }
});
