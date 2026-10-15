// SPDX-License-Identifier: Apache-2.0
// 会话标题与项目标识的兼容面（B41）：实现见 ./session/identity-and-guards.js。
import * as guards from "./session/identity-and-guards.js";

export const titleFromInput = guards.titleFromInput;
export const slugify = guards.slugify;
export const projectIdFromDirectory = guards.projectIdFromDirectory;
