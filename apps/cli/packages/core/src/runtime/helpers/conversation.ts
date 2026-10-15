// SPDX-License-Identifier: Apache-2.0
// 回合输入准入的兼容面（B42）：实现见 ./session/turn-input-admission.js。
import * as admission from "./session/turn-input-admission.js";

export const getLatestActiveSessionMessageId = admission.getLatestActiveSessionMessageId;
export const isMetaUserContextMessage = admission.isMetaUserContextMessage;
export const findLatestRealUserMessageIndex = admission.findLatestRealUserMessageIndex;
export const buildUserContentFromTurn = admission.buildUserContentFromTurn;
export const buildRuntimeUserEntriesFromTurn = admission.buildRuntimeUserEntriesFromTurn;
