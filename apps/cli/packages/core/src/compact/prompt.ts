// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// compact 提示词的公开面：实现与文案都在 ./prompt-internal.js，本模块只做转发。
export {
  buildCompactPrompt,
  buildCompactSummaryMessage,
  formatCompactSummary,
} from "./prompt-internal.js";
