// SPDX-License-Identifier: Apache-2.0
// 上下文用量分类贡献者的兼容面（B47）：实现见 ./context/usage-contributors.js。
import * as contributors from "./context/usage-contributors.js";

export type ContextUsageContributor = contributors.ContextUsageContributor;
export type ContextUsageCategoryBreakdown = contributors.ContextUsageCategoryBreakdown;
export const buildCategoryBreakdown = contributors.buildCategoryBreakdown;
export const sectionContributor = contributors.sectionContributor;
export const toolContributor = contributors.toolContributor;
export const skillContributor = contributors.skillContributor;
export const messageRoleContributor = contributors.messageRoleContributor;
