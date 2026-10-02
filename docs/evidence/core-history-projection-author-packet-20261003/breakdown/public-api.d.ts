import type { ContextUsageCategory, ContextUsageMetric, ContextUsageMessageRoleBreakdown, ContextUsageSkillDetail, ContextUsageToolDetail } from "../types.js";
type ContextUsageContributorKind = "context_section" | "tool_schema" | "skill" | "message_role";
export interface ContextUsageContributor extends ContextUsageMetric {
    cacheHint?: string;
    categorySource: ContextUsageCategory["source"];
    count?: number;
    injectionTarget?: string;
    kind: ContextUsageContributorKind;
    label: string;
    name?: string;
    path?: string;
    readOnly?: boolean;
    role?: string;
    scope?: string;
    serverName?: string;
    sideEffectScope?: string;
    source?: string;
}
export interface ContextUsageCategoryBreakdown extends ContextUsageCategory {
    contributors: ContextUsageContributor[];
}
type ContextUsageSectionDetail = ContextUsageMetric & {
    cacheHint: string;
    injectionTarget: string;
    name: string;
    source: string;
};
export declare function buildCategoryBreakdown(categoryBySource: ReadonlyMap<ContextUsageCategory["source"], ContextUsageCategory>, source: ContextUsageCategory["source"], contributors: ContextUsageContributor[]): ContextUsageCategoryBreakdown | undefined;
export declare function sectionContributor(categorySource: ContextUsageCategory["source"], section: ContextUsageSectionDetail): ContextUsageContributor;
export declare function toolContributor(categorySource: ContextUsageCategory["source"], tool: ContextUsageToolDetail): ContextUsageContributor;
export declare function skillContributor(categorySource: ContextUsageCategory["source"], skill: ContextUsageSkillDetail): ContextUsageContributor;
export declare function messageRoleContributor(message: ContextUsageMessageRoleBreakdown): ContextUsageContributor;
export {};
