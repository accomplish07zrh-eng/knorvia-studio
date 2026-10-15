// SPDX-License-Identifier: Apache-2.0
// 斜杠命令解析的兼容面（B39）：实现见 ./tooling/slash-command-parser.js。
import * as parser from "./tooling/slash-command-parser.js";

export const parseCompactCommand = parser.parseCompactCommand;
export const parseRewindCommand = parser.parseRewindCommand;
