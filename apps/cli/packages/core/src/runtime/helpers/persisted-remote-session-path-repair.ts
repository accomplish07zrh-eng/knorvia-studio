// SPDX-License-Identifier: Apache-2.0
// 持久化远程会话路径修复的兼容面（B44）：实现见 ./session/remote-session-repair.js。
import * as repair from "./session/remote-session-repair.js";

export const repairPersistedRemoteSessionPaths = repair.repairPersistedRemoteSessionPaths;
