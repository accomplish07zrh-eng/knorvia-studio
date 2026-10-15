/* eslint-disable max-lines -- 供应商 schema、迁移与运行时投影 helper 共用同一套类型边界，集中放免得契约散开。 */
const TEMPLATE_ID_VALUES = {
  zai: /* zai 站点模板 ID */ "zai-api",
  bigmodel: /* bigmodel 站点模板 ID */ "bigmodel-api",
} as const; // 模板 ID 取值逐字冻结

export const BUILTIN_PROVIDER_TEMPLATE_IDS = TEMPLATE_ID_VALUES;

const PROVIDER_ID_VALUES = {
  zaiIndividualCodingPlan: /* zai 个人版 Coding Plan */ "account:zai-individual-coding-plan",
  zaiTeamCodingPlan: /* zai 团队版 Coding Plan */ "account:zai-team-coding-plan",
  zaiStartPlan: /* zai Start Plan */ "account:zai-start-plan",
  bigmodelIndividualCodingPlan: /* bigmodel 个人版 */ "account:bigmodel-individual-coding-plan",
  bigmodelTeamCodingPlan: /* bigmodel 团队版 */ "account:bigmodel-team-coding-plan",
  bigmodelStartPlan: /* bigmodel Start Plan */ "account:bigmodel-start-plan",
} as const; // 六个内置 provider ID 取值逐字冻结

export const BUILTIN_MODEL_PROVIDER_IDS = PROVIDER_ID_VALUES;

export type BuiltinOAuthProviderId = keyof typeof PROVIDER_ID_VALUES;

export type BuiltinModelProviderId = (typeof PROVIDER_ID_VALUES)[BuiltinOAuthProviderId];

const BUILTIN_PROVIDER_ID_SET: ReadonlySet<string> = new Set(Object.values(PROVIDER_ID_VALUES));
const ZAI_CODING_PLAN_ID_SET: ReadonlySet<string> = new Set([
  PROVIDER_ID_VALUES.zaiIndividualCodingPlan,
  PROVIDER_ID_VALUES.zaiTeamCodingPlan,
  PROVIDER_ID_VALUES.zaiStartPlan,
]);
const BIGMODEL_CODING_PLAN_ID_SET: ReadonlySet<string> = new Set([
  PROVIDER_ID_VALUES.bigmodelIndividualCodingPlan,
  PROVIDER_ID_VALUES.bigmodelTeamCodingPlan,
  PROVIDER_ID_VALUES.bigmodelStartPlan,
]);
const START_PLAN_ID_SET: ReadonlySet<string> = new Set([
  PROVIDER_ID_VALUES.zaiStartPlan,
  PROVIDER_ID_VALUES.bigmodelStartPlan,
]);
const INDIVIDUAL_PLAN_ID_SET: ReadonlySet<string> = new Set([
  PROVIDER_ID_VALUES.zaiIndividualCodingPlan,
  PROVIDER_ID_VALUES.bigmodelIndividualCodingPlan,
]);

export function isBuiltinModelProviderId(
  candidateId: string,
): candidateId is BuiltinModelProviderId {
  return BUILTIN_PROVIDER_ID_SET.has(candidateId);
}

export function isZaiCodingPlanProviderId(candidateId: string): boolean {
  return ZAI_CODING_PLAN_ID_SET.has(candidateId);
}

export function isBigModelStartPlanProviderId(candidateId: string): boolean {
  const startPlanId = PROVIDER_ID_VALUES.bigmodelStartPlan;
  return candidateId === startPlanId;
}

export function isStartPlanModelProviderId(candidateId: string): boolean {
  return START_PLAN_ID_SET.has(candidateId);
}

// 个人版 Coding Plan（不含 Start Plan 与 Team Plan）：Start Plan 用 disconnected 展示
// 领取/付费卡、Team Plan 有独立文案，"服务端明确无权益"只在个人版要区分成"未开通"。
export function isIndividualCodingPlanModelProviderId(candidateId: string): boolean {
  return INDIVIDUAL_PLAN_ID_SET.has(candidateId);
}

export function isCodingPlanModelProviderId(candidateId: string): boolean {
  if (isZaiCodingPlanProviderId(candidateId)) {
    return true;
  }
  return BIGMODEL_CODING_PLAN_ID_SET.has(candidateId);
}

type ConnectivitySuccess = { readonly success: /* 测试通过 */ true };

type ConnectivityFailure = {
  readonly success: /* 测试未通过 */ false;
  readonly error: {
    readonly message: /* 原始错误消息 */ string;
    // 设置连接测试边界已确认的资格失败；其他执行错误保留原消息。
    readonly code?: /* 资格失败码 */ "provider-unavailable" | "model-unavailable";
  };
};

// 一个正式 Model 的连通性测试结果。
export type ModelConnectivityResult = ConnectivitySuccess | ConnectivityFailure;
