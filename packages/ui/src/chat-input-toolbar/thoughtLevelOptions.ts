import type { KnorviaConfigOption, KnorviaProvider } from "@knorvia/shared";
import type { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { getConfigOptionEntryLabel } from "@/chat-input-toolbar/display.js";

type ThoughtLevelEntry = NonNullable<KnorviaConfigOption["options"]>[number];

const NO_THOUGHT_LEVEL_VALUES = new Set([
  "disabled",
  "false",
  "no",
  "none",
  "nothink",
  "no-think",
  "no_think",
  "off",
]);

const THOUGHT_LEVEL_LABEL_IDS: Record<string, string> = {
  disabled: "chat.toolbar.thoughtLevel.value.off",
  false: "chat.toolbar.thoughtLevel.value.off",
  no: "chat.toolbar.thoughtLevel.value.off",
  none: "chat.toolbar.thoughtLevel.value.off",
  nothink: "chat.toolbar.thoughtLevel.value.off",
  "no-think": "chat.toolbar.thoughtLevel.value.off",
  no_think: "chat.toolbar.thoughtLevel.value.off",
  off: "chat.toolbar.thoughtLevel.value.off",
  enable: "chat.toolbar.thoughtLevel.value.on",
  enabled: "chat.toolbar.thoughtLevel.value.on",
  on: "chat.toolbar.thoughtLevel.value.on",
  true: "chat.toolbar.thoughtLevel.value.on",
  low: "chat.toolbar.thoughtLevel.value.low",
  minimal: "chat.toolbar.thoughtLevel.value.minimal",
  medium: "chat.toolbar.thoughtLevel.value.medium",
  high: "chat.toolbar.thoughtLevel.value.high",
  "extra-high": "chat.toolbar.thoughtLevel.value.xhigh",
  extra_high: "chat.toolbar.thoughtLevel.value.xhigh",
  xhigh: "chat.toolbar.thoughtLevel.value.xhigh",
  max: "chat.toolbar.thoughtLevel.value.max",
  ultra: "chat.toolbar.thoughtLevel.value.ultra",
};

function normalizeThoughtLevelText(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 档位值 → 词条 id；表里没有的值返回 undefined（调用方原样显示 provider 自己的档位名）。
 * 工具条之外也有人要说这个词（工作流的子代理模型），两处必须查同一张表。
 */
export function thoughtLevelLabelId(value: string): string | undefined {
  return THOUGHT_LEVEL_LABEL_IDS[normalizeThoughtLevelText(value)];
}

export function isNoThoughtLevel(entry: ThoughtLevelEntry): boolean {
  return NO_THOUGHT_LEVEL_VALUES.has(normalizeThoughtLevelText(entry.value));
}

export function getNextThoughtLevelValue(
  option: Pick<KnorviaConfigOption, "type" | "currentValue" | "options">,
): string | null {
  if (option.type !== "select" || !option.options || option.options.length < 2) {
    return null;
  }

  // 配置已声明档位顺序；名称别名只用于展示，不能改变菜单或快捷键顺序。
  const entries = option.options;
  const currentValue = String(option.currentValue);
  const currentIndex = entries.findIndex((candidate) => candidate.value === currentValue);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % entries.length;

  return entries[nextIndex]?.value ?? null;
}

export function getThoughtLevelLabel(
  intl: ReturnType<typeof useKnorviaIntl>["intl"],
  provider: KnorviaProvider | undefined,
  option: KnorviaConfigOption,
  entry: ThoughtLevelEntry,
): string {
  const value = normalizeThoughtLevelText(entry.value);
  const labelId = Object.hasOwn(THOUGHT_LEVEL_LABEL_IDS, value)
    ? THOUGHT_LEVEL_LABEL_IDS[value]
    : undefined;
  if (labelId) {
    return intl.formatMessage({ id: labelId });
  }

  return getConfigOptionEntryLabel(intl, provider, option, entry);
}

const THOUGHT_LEVEL_RANKS: Record<string, number> = {
  minimal: 1,
  low: 2,
  medium: 3,
  enable: 4,
  enabled: 4,
  on: 4,
  true: 4,
  high: 4,
  "extra-high": 5,
  extra_high: 5,
  xhigh: 5,
  max: 6,
  ultra: 7,
};

/**
 * 强度轴必须从低到高（specs/knorvia-composer-polish-20261008.md）。修复 Grok 档位
 * 反向：部分内核按「极高→低」上报，强度轴照原顺序画就把最高档放在最左。仅当每个
 * 档位都能识别强弱时按强度稳定排序；含未知档位名时保留内核声明的顺序，不臆测。
 */
export function orderThoughtLevelsForAxis<T extends ThoughtLevelEntry>(entries: readonly T[]): T[] {
  const rank = (entry: T) =>
    isNoThoughtLevel(entry) ? 0 : THOUGHT_LEVEL_RANKS[normalizeThoughtLevelText(entry.value)];
  if (entries.some((entry) => rank(entry) === undefined)) return [...entries];
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry)! - rank(b.entry)! || a.index - b.index)
    .map(({ entry }) => entry);
}
