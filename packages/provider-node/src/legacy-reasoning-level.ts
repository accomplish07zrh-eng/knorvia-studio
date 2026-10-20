// SPDX-License-Identifier: Apache-2.0
// 旧档位名解析：把历史 ModelSelection 里已下线的 `reasoningLevel` 值
// （`off` / `nothink`）翻译回当前的 `disabled`。
//
// 边界：只服务 Built-in 模型的历史选择。Personal 配置与执行层校验**都不放宽**，
// 所以判定顺序是「先排除 Personal → 再要求 provider 存在 → 最后才做投影与解析」。
import {
  ModelConfig,
  ModelConfigRules,
  ModelOptionSpecsConfig,
  type ModelSelection,
  type ProviderRegistryServiceSnapshot,
} from "@knorvia/provider";
import { legacyReasoningLevelRenames } from "./legacy-reasoning-level-renames.js";

/** 会触发解析的两个历史档位名。 */
const RETIRED = new Set(["off", "nothink"]);

/** 投影结果缓存：Built-in 规则集实例在运行期稳定，投影是纯函数。 */
const projectedCache = new WeakMap<ModelConfigRules, ModelConfigRules>();

/** Personal 配置是否自己声明了 reasoningLevel 取值面（声明了就不迁移）。 */
function ownsReasoningLevelSpec(
  rule: ReturnType<ProviderRegistryServiceSnapshot["config"]["personalModels"]["getExactRule"]>,
): boolean {
  if (rule === undefined) return false;
  if (rule.type === "manual-provider-model") return true;
  const spec = rule.config.optionSpecs?.reasoningLevel;
  return spec?.values !== undefined || spec?.map !== undefined;
}

/**
 * 把规则集里的 `disabled` 换回该模型历史上的档位名。
 *
 * 只处理「已裁决的原始规则」（`type === "model"` 且 modelMatch 精确命中改名表）：
 * 新增的同名站点规则不继承旧别名，否则会给从未有过旧档位名的模型凭空造一个。
 */
function project(builtin: ModelConfigRules): ModelConfigRules {
  const hit = projectedCache.get(builtin);
  if (hit !== undefined) return hit;

  const rewritten = builtin.rules().map((rule) => {
    if (rule.type !== "model") return rule;
    const rename = legacyReasoningLevelRenames.find(
      (entry) => entry.modelMatch === rule.modelMatch,
    );
    const declared = rule.config.optionSpecs?.reasoningLevel?.values;
    // `declared` 的类型是 `readonly string[] | null | undefined`，可选链一次覆盖 null 与 undefined。
    if (rename === undefined || declared?.includes("disabled") !== true) return rule;

    const asLegacy = declared.map((value) => (value === "disabled" ? rename.oldLevel : value));
    const overlay = new ModelConfig({
      optionSpecs: new ModelOptionSpecsConfig({ reasoningLevel: { values: asLegacy } }),
    });
    return { ...rule, config: rule.config.overlay(overlay) };
  });

  const result = new ModelConfigRules(rewritten);
  projectedCache.set(builtin, result);
  return result;
}

/**
 * 若 `selection` 用的是已下线的档位名，返回它当前对应的档位（`disabled`）；否则 `undefined`。
 *
 * 匹配复用原规则引擎（大小写、前后缀、API/站点与后续覆盖都由它处理）——
 * 本模块不复制第二套匹配逻辑，否则两套逻辑迟早分叉。
 */
export function resolveLegacyReasoningLevel(
  snapshot: ProviderRegistryServiceSnapshot,
  selection: ModelSelection,
): string | undefined {
  const wanted = selection.options?.reasoningLevel;
  if (wanted === undefined || !RETIRED.has(wanted)) return undefined;

  const personalRule = snapshot.config.personalModels.getExactRule(
    selection.providerId,
    selection.modelId,
  );
  if (ownsReasoningLevelSpec(personalRule)) return undefined;

  const effective = snapshot.resolution.effectiveProviders.get(selection.providerId);
  if (effective === undefined) return undefined;

  // 解析所需的五个事实一次性取齐，再交给规则引擎：不复制匹配逻辑，只喂上下文。
  const query = {
    providerId: selection.providerId,
    modelId: selection.modelId,
    templateId: snapshot.resolution.effectiveProviders.getRule(selection.providerId)?.templateId,
    apiType: effective.api?.type,
    baseUrl: effective.api?.baseUrl,
  };
  const available = project(snapshot.config.knorviaBuiltinModelRules).resolve(query).optionSpecs
    ?.reasoningLevel?.values;

  // 只有投影后的取值面确实含这个旧名，才算「该模型的旧档位」；否则属于其它模型，不迁移。
  return available?.includes(wanted) === true ? "disabled" : undefined;
}
