// SPDX-License-Identifier: Apache-2.0
// Coding Plan 额度相关的纯类型定义（B43 面）。
// 从 usage-stats.ts 拆出：MCP 额度接入后那边超过 oxlint max-lines(400) 门禁，
// 而额度是可独立描述的一组类型（不依赖统计聚合结构）；本文件只依赖自身，
// usage-stats.ts 单向导入并 re-export，不构成循环依赖。

export type UsageQuotaSnapshot = {
  level: /* 套餐层级 */ string | null;
  limits: /* 额度桶列表 */ UsageQuotaLimit[];
};

// 额度桶拆成「身份段 + 计量段 + 明细」三段描述，段间是交叉关系。
type UsageQuotaIdentityFields = {
  type: /* 额度桶类型码 */ string;
  // Start Plan 服务端额度桶及周期身份；周期时间为毫秒，供提醒去重。
  bucketId?: /* 额度桶身份 */ string;
  userPlanId?: /* 用户套餐身份 */ string;
  periodStart?: /* 周期开始毫秒 */ number;
  periodEnd?: /* 周期结束毫秒 */ number;
  // 所属 entitlement 的周期类型，如 daily / one_time。
  period?: /* 周期类型 */ string;
  planId?: /* 套餐身份（设置页分组展示用） */ string;
};

type UsageQuotaMeteringFields = {
  meter?: /* 计量器名 */ string;
  unitType?: /* 单位类型 */ string;
  unit?: /* 单位额度 */ number;
  number?: /* 数量额度 */ number;
  usage?: /* 已用量 */ number;
  currentValue?: /* 当前值 */ number;
  remaining?: /* 剩余量 */ number;
  percentage?: /* 已使用占比 */ number;
  nextResetTime?: /* 下次重置毫秒 */ number;
};

export type UsageQuotaLimit = UsageQuotaIdentityFields &
  UsageQuotaMeteringFields & {
    usageDetails: /* 分模型用量明细 */ UsageQuotaUsageDetail[];
  };

export type UsageQuotaUsageDetail = {
  modelCode: /* 模型编码 */ string;
  displayName?: /* 展示名 */ string;
  usage: /* 该模型用量 */ number;
};

// `aggregate.type` 的合成值：不复用 TOKENS_LIMIT / TIME_LIMIT，因为 isSameLimitCategory
// 会把 TIME_LIMIT 判成工具额度同类，让 MCP 汇总额度被 findCodingPlanQuotaLimit 查询误命中。
export const MCP_USAGE_QUOTA_LIMIT_TYPE = "MCP_USAGE_LIMIT" as const;

// MCP 额度所属的 Coding Plan 连接，供 UI 判断能否显示在当前 provider tab 下。
export type UsageMcpQuotaScope = // 个人版与团队版两种归属
  | {
      providerFamily: /* 归属家族 */ "zai" | "bigmodel";
      targetType: /* 个人版 */ "PERSONAL";
    }
  | {
      providerFamily: /* 归属家族 */ "zai" | "bigmodel";
      targetType: /* 团队版 */ "TEAM";
      organizationId: /* 组织 ID */ string;
      projectId: /* 项目 ID */ string;
    };

export type UsageMcpQuotaSnapshot = {
  // 服务端 server_time，毫秒（接口返回 Unix 秒）。
  serverTime: /* 服务端毫秒时间 */ number;
  level: /* 套餐层级 */ string | null;
  scope: /* 连接归属 */ UsageMcpQuotaScope;
  // 服务端 total_usage（总已用/总额度/总剩余）的等价表达，直接复用现有额度条/额度卡的
  // 展示逻辑。注意 percentage 沿用 quota 接口口径：**已使用占比**，展示端负责反转成剩余。
  aggregate: /* 汇总额度桶 */ UsageQuotaLimit;
};
