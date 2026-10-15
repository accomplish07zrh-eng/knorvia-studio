// SPDX-License-Identifier: Apache-2.0
// 模型输入能力投影的兼容面（B8）：实现见 ./media/model-media-policy.js。
import * as policy from "./media/model-media-policy.js";

export type MediaCapabilityProjection = policy.MediaCapabilityProjection;
export const projectMessagesForInputFormat = policy.projectMessagesForInputFormat;
export const logMediaCapabilityProjection = policy.logMediaCapabilityProjection;
