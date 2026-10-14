// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// section 装配器：把拼好的正文包成 ContextSection。字符数、token 估算与前 100 字预览的
// 口径集中在这里，各 section 文件只负责给出正文与元信息。
import type {
  ContextCacheHint,
  ContextInjectionTarget,
  ContextSection,
  ContextSource,
} from "../types.js";
import { estimateTokens } from "../utils.js";

export function contextSectionFromText(
  name: string,
  source: ContextSource,
  target: ContextInjectionTarget,
  cache: ContextCacheHint,
  content: string,
): ContextSection {
  const shaped = {} as ContextSection;
  shaped.name = name;
  shaped.source = source;
  shaped.injectionTarget = target;
  shaped.cacheHint = cache;
  shaped.chars = content.length;
  shaped.tokens = estimateTokens(content);
  shaped.content = content;
  shaped.preview = content.slice(0, 100);
  return shaped;
}
