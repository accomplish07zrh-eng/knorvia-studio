import type { ReactNode } from "react";
import { TID_CHAT_THOUGHT_LEVEL_SELECT_ITEM, testId } from "@knorvia/shared";
import { cn } from "@/components/lib/utils.js";

export interface ThoughtLevelSliderEntry {
  value: string;
  label: string;
}

/**
 * 聊天输入框的思考强度滑杆（specs/knorvia-composer-polish-20261008.md）：
 * 参照 Codex / Claude Code 的单条强度轴，档位按配置顺序从低到高排列，
 * 拖动、点刻度名或方向键即时切换；纯黑白深浅表达强度，不引入彩色。
 */
export function ThoughtLevelSlider({
  title,
  entries,
  index,
  onSelect,
  onCommitCurrent,
}: {
  title: ReactNode;
  entries: ThoughtLevelSliderEntry[];
  /** 当前档位下标；-1 表示未选或失效，滑块停在最左但不点亮刻度。 */
  index: number;
  onSelect(value: string): void;
  onCommitCurrent?(value: string): void;
}) {
  const last = Math.max(1, entries.length - 1);
  const position = index < 0 ? 0 : index / last;
  const current = index >= 0 ? entries[index] : undefined;
  return (
    <div className="w-64 space-y-3" data-thought-level-slider="true">
      <div className="flex items-baseline justify-between gap-3 text-ui-sm">
        <span className="text-foreground-subtle">{title}</span>
        <span className="font-medium text-foreground">{current?.label ?? "—"}</span>
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-2 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-foreground/25 to-foreground transition-[width] duration-200"
            style={{ width: `${position * 100}%` }}
          />
        </div>
        {entries.map((entry, step) => (
          <span
            key={entry.value}
            aria-hidden="true"
            className={cn(
              "absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
              index >= step ? "bg-background/80" : "bg-foreground/25",
            )}
            style={{ left: `calc(0.5rem + (100% - 1rem) * ${step / last})` }}
          />
        ))}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/20 bg-background shadow-sm transition-[left] duration-200"
          style={{ left: `calc(0.5rem + (100% - 1rem) * ${position})` }}
        />
        <input
          type="range"
          min={0}
          max={entries.length - 1}
          step={1}
          value={Math.max(0, index)}
          aria-label={typeof title === "string" ? title : undefined}
          aria-valuetext={current?.label}
          data-testid="chat-thought-level-slider"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={(event) => {
            const entry = entries[Number(event.currentTarget.value)];
            if (entry) onSelect(entry.value);
          }}
        />
      </div>
      <div className="flex justify-between gap-1">
        {entries.map((entry, step) => (
          <button
            key={entry.value}
            type="button"
            data-testid={testId(TID_CHAT_THOUGHT_LEVEL_SELECT_ITEM, entry.value)}
            aria-pressed={step === index}
            className={cn(
              "min-w-0 flex-1 truncate rounded-full px-1 py-0.5 text-center text-ui-xs transition-colors",
              step === index
                ? "bg-foreground/8 font-medium text-foreground"
                : "text-foreground-subtle hover:text-foreground",
            )}
            onClick={() => {
              if (step === index) onCommitCurrent?.(entry.value);
              else onSelect(entry.value);
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}
