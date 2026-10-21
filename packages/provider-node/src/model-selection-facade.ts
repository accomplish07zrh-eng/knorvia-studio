// SPDX-License-Identifier: Apache-2.0
// Node 侧模型选择门面的装配点。
//
// 只做一件事：把身份分类器与旧档位解析器注入纯 Provider Facade。
// 身份类别决定计费与连接唯一性，所以分类的**判定顺序**是行为的一部分，
// 这里用一条有序规则表显式表达，而不是靠 if 分支的先后顺序隐含表达。
import { ModelSelectionFacade, type ProviderRegistryFacadeSource } from "@knorvia/provider";
import {
  isBuiltinModelProviderId,
  isStartPlanModelProviderId,
  OFF_PEAK_PROVIDER_IDS,
} from "@knorvia/shared";
import { resolveLegacyReasoningLevel } from "./legacy-reasoning-level.js";

type ProviderClass = "account-plan" | "account-offpeak" | "ordinary";

/** 谷时计费 ID 集合：模块加载时算一次，避免每次分类都重建数组。 */
const OFF_PEAK_IDS: ReadonlySet<string> = new Set(Object.values(OFF_PEAK_PROVIDER_IDS));

/**
 * 有序分类规则。
 *
 * 表序即优先级，不可调换：Start 计划必须先按真实 ID 判为 ordinary，
 * 否则会落进 Built-in 分支被当成 account-plan，进而参与付费额度计算。
 */
const CLASSIFICATION_RULES: ReadonlyArray<{
  readonly matches: (providerId: string) => boolean;
  readonly classifyAs: ProviderClass;
}> = [
  { matches: isStartPlanModelProviderId, classifyAs: "ordinary" },
  { matches: isBuiltinModelProviderId, classifyAs: "account-plan" },
  { matches: (id) => OFF_PEAK_IDS.has(id), classifyAs: "account-offpeak" },
];

/** 按有序规则表判定身份类别；没有规则命中时落到 `ordinary`。 */
const classifyProvider = (providerId: string): ProviderClass =>
  CLASSIFICATION_RULES.find((rule) => rule.matches(providerId))?.classifyAs ?? "ordinary";

/**
 * 建 Node 侧模型选择门面：Host 与受管理 Worker 共用同一套身份分类，
 * 解析本身交给纯 Provider Facade（本层不参与匹配逻辑）。
 */
export const createNodeModelSelectionFacade = (
  source: ProviderRegistryFacadeSource,
): ModelSelectionFacade =>
  new ModelSelectionFacade(source, classifyProvider, resolveLegacyReasoningLevel);
