// SPDX-License-Identifier: Apache-2.0
// 子 Agent 交互中转的兼容面（B16）：实现见 ./permission/subagent-request-routing.js。
import * as routing from "./permission/subagent-request-routing.js";

export const createSubagentInteractionBroker = routing.createSubagentInteractionBroker;
