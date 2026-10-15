// SPDX-License-Identifier: Apache-2.0
// 上下文用量的分类贡献者（B47）。分类不存在返回 undefined，否则返回分类并附贡献者列表；
// 四类构造器分别产出 context_section / tool_schema / skill / message_role 形状的贡献者，
// 字段与明细一一对应（字符数、token、方法、置信度、分词器，以及工具的只读/副作用范围、
// 技能的范围与路径、角色的计数）。同步纯计算、不抛异常。
import type {
  ContextUsageCategory,
  ContextUsageMetric,
  ContextUsageMessageRoleBreakdown,
  ContextUsageSkillDetail,
  ContextUsageToolDetail,
} from "../../types.js";

// 贡献者种类：上下文段 / 工具 schema / 技能 / 消息角色。
type ContextUsageContributorKind = "context_section" | "tool_schema" | "skill" | "message_role";

// 单个用量贡献者：指标字段 + 归属与标签 + 各类专属明细。
export interface ContextUsageContributor extends ContextUsageMetric {
  cacheHint?: string; // 缓存提示
  categorySource: ContextUsageCategory["source"]; // 所属分类来源
  count?: number; // 角色消息计数
  injectionTarget?: string; // 注入目标位置
  kind: ContextUsageContributorKind; // 贡献者种类
  label: string; // 展示标签
  name?: string; // 名称
  path?: string; // 技能文件路径
  readOnly?: boolean; // 工具只读标记
  role?: string; // 消息角色名
  scope?: string; // 技能作用范围
  serverName?: string; // 工具所属服务
  sideEffectScope?: string; // 工具副作用范围
  source?: string; // 明细来源
}

// 分类明细：分类 + 贡献者列表。
export interface ContextUsageCategoryBreakdown extends ContextUsageCategory {
  contributors: ContextUsageContributor[];
}

// 上下文段明细：指标 + 注入落点与缓存提示。
type ContextUsageSectionDetail = ContextUsageMetric & {
  cacheHint: string;
  injectionTarget: string;
  name: string;
  source: string;
};

// 把明细里的公共指标字段收拢成贡献者指标子对象。
const metricFields = (detail: ContextUsageMetric): ContextUsageMetric => ({
  chars: detail.chars,
  tokens: detail.tokens,
  tokenMethod: detail.tokenMethod,
  confidence: detail.confidence,
  tokenizer: detail.tokenizer,
});

// 按来源键取分类并附上贡献者；来源对不上给 undefined。
export const buildCategoryBreakdown = (
  categoryBySource: ReadonlyMap<ContextUsageCategory["source"], ContextUsageCategory>,
  sourceKey: ContextUsageCategory["source"],
  contributors: ContextUsageContributor[],
): ContextUsageCategoryBreakdown | undefined => {
  const category = categoryBySource.get(sourceKey);
  if (!category) return undefined; // 没有这个来源的分类
  const breakdown: ContextUsageCategoryBreakdown = { ...category, contributors };
  return breakdown;
};

// 上下文段贡献者：段名作标签，带上注入落点与缓存提示。
export const sectionContributor = (
  origin: ContextUsageCategory["source"],
  detail: ContextUsageSectionDetail,
): ContextUsageContributor => {
  const row: ContextUsageContributor = {
    kind: "context_section",
    categorySource: origin,
    label: detail.name,
    name: detail.name,
    source: detail.source,
    injectionTarget: detail.injectionTarget,
    cacheHint: detail.cacheHint,
    ...metricFields(detail),
  };
  return row;
};

// 工具 schema 贡献者：带只读标记与副作用范围。
export const toolContributor = (
  origin: ContextUsageCategory["source"],
  schema: ContextUsageToolDetail,
): ContextUsageContributor => {
  const row: ContextUsageContributor = {
    kind: "tool_schema",
    categorySource: origin,
    label: schema.name,
    name: schema.name,
    source: schema.source,
    serverName: schema.serverName,
    readOnly: schema.readOnly,
    sideEffectScope: schema.sideEffectScope,
    ...metricFields(schema),
  };
  return row;
};

// 技能贡献者：带作用范围与技能文件路径。
export const skillContributor = (
  origin: ContextUsageCategory["source"],
  entry: ContextUsageSkillDetail,
): ContextUsageContributor => {
  const row: ContextUsageContributor = {
    kind: "skill",
    categorySource: origin,
    label: entry.name,
    name: entry.name,
    source: entry.source,
    scope: entry.scope,
    path: entry.path,
    ...metricFields(entry),
  };
  return row;
};

// 消息角色贡献者：来源固定 messages，带角色计数。
export const messageRoleContributor = (
  roleRow: ContextUsageMessageRoleBreakdown,
): ContextUsageContributor => {
  const row: ContextUsageContributor = {
    kind: "message_role",
    categorySource: "messages",
    label: roleRow.role,
    role: roleRow.role,
    count: roleRow.count,
    ...metricFields(roleRow),
  };
  return row;
};
