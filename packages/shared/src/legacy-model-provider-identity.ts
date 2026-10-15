// SPDX-License-Identifier: Apache-2.0
// 旧模型供应商 ID 的单向迁移（B29）。
import {
  BUILTIN_MODEL_PROVIDER_IDS,
  BUILTIN_PROVIDER_TEMPLATE_IDS,
} from "./model-provider-types.js";
import { normalizeOfficialGlmModelId } from "./official-glm-model-id.js";

const LEGACY_PROVIDER_ID_PATTERN =
  /^(?:builtin:(?:zai|bigmodel)(?:-start-plan|-coding-plan)?|account:(?:zai|bigmodel)-(?:start-plan|individual-coding-plan|team-coding-plan))$/;

// 站点归属不能靠自定义 Provider 名字猜；闲时 Ticket 的绑定身份同样不可改写。
export function migrateLegacyOfficialGlmModelId(providerInput: string, modelInput: string): string {
  const legacyHit = LEGACY_PROVIDER_ID_PATTERN.test(providerInput);
  return legacyHit ? normalizeOfficialGlmModelId(modelInput) : modelInput;
}

// 迁移映射：只认下表里的旧 ID，其余按「是否 builtin: 前缀」分流。
const LEGACY_PROVIDER_MIGRATIONS: Readonly<Record<string, string>> = {
  "builtin:bigmodel": BUILTIN_PROVIDER_TEMPLATE_IDS.bigmodel,
  "builtin:zai": BUILTIN_PROVIDER_TEMPLATE_IDS.zai,
  "builtin:bigmodel-start-plan": BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan,
  "builtin:zai-start-plan": BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan,
  "builtin:bigmodel-coding-plan": BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
  "builtin:zai-coding-plan": BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan,
};

// 仅供已发布旧数据的单向升级，不是运行时别名、也不是选择兜底：
// 拿当前账号解释旧 Coding Plan 会让离线/SSH 迁移丢原意图；同域 Individual 只是
// 确定性迁移落点，不能据此绑定执行。迁移不查模型/档位可用性，普通未知 ID 不算旧格式。
export function migrateLegacyModelProviderId(providerInput: string): string | undefined {
  const migrated = LEGACY_PROVIDER_MIGRATIONS[providerInput];
  if (migrated !== undefined) {
    return migrated;
  }
  return providerInput.startsWith("builtin:") ? undefined : providerInput;
}
