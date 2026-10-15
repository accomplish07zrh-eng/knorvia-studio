// SPDX-License-Identifier: Apache-2.0
// 输入呈现投影与来源登记的兼容面（B35）：实现见 ./provider/input-presentation-projection.js。
import * as presentation from "./provider/input-presentation-projection.js";

export const ProviderEntryOrigins = presentation.ProviderEntryOrigins;
export const isPresentedInput = presentation.isPresentedInput;
export const projectIncomingMessageEntries = presentation.projectIncomingMessageEntries;
