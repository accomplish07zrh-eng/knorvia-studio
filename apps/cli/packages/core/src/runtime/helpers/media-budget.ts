// SPDX-License-Identifier: Apache-2.0
// 媒体体积预算投影的兼容面（B9）：实现见 ./media/model-media-policy.js。
import * as policy from "./media/model-media-policy.js";

export type MediaBudgetProjection = policy.MediaBudgetProjection;
export const projectMessagesForModelMediaPolicy = policy.projectMessagesForModelMediaPolicy;
export const projectMessagesForMediaBudget = policy.projectMessagesForMediaBudget;
export const logMediaBudgetProjection = policy.logMediaBudgetProjection;
