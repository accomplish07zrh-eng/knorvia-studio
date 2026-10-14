// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// CLI 前缀 section：一句固定的产品身份说明，注入 system 且缓存稳定。
import type { ContextSection } from "../types.js";
import { contextSectionFromText } from "./section-core.js";

/** 交互式 CLI 的身份前缀；工作流子代理不走这一句。 */
const CLI_PREFIX_PROMPT = "You are Knorvia Studio, an interactive coding agent";

export const buildCliPrefixSection = (): ContextSection =>
  contextSectionFromText("CLI Prefix", "cli_prefix", "system", "stable", CLI_PREFIX_PROMPT);
