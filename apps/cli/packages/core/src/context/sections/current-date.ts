// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 当前日期 section：没有日期就不出段（返回 null），有日期则注入 meta user 且标记为动态。
import type { ContextSection } from "../types.js";
import { contextSectionFromText } from "./section-core.js";

const DATE_HEADING = "# currentDate";

const DATE_SENTENCE_PREFIX = "Today's date is ";

export const buildCurrentDateSection = (currentDate: string | undefined): ContextSection | null => {
  if (!currentDate) return null;
  const content = `${DATE_HEADING}\n${DATE_SENTENCE_PREFIX}${currentDate}.`;
  return contextSectionFromText("Current Date", "current_date", "meta_user", "dynamic", content);
};
