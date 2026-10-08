import type { ReactNode } from "react";
import { TID_CHAT_THOUGHT_LEVEL_SELECT_ITEM, testId } from "@knorvia/shared";
import { cn } from "@/components/lib/utils.js";

export interface ThoughtLevelSliderEntry {
  value: string;
  label: string;
}

/**
 * 聊天输入框的思考强度条（specs/knorvia-composer-polish-20261008.md）。
 * 参照 Codex 的单条强度轴：档位已由调用方按从低到高排好；未到本模型最高档时填充为白色，
 * 到达最高档时填充变为黑白渐变并带流动的喷射光点（`data-max`，动效见 styles.css）。
 * 每个模型的最高档由其自身档位列表决定，不假定统一上限。
 */
export function ThoughtLevelSlider({
  title,
  entries,
  currentValue,
  onSelect,
  onCommitCurrent,
}: {
  title: ReactNode;
  entries: ThoughtLevelSliderEntry[];
  /** 当前档位值；null 或不在列表中时滑块停在最左且不点亮。 */
  currentValue: string | null;
  onSelect(value: string): void;
  onCommitCurrent?(value: string): void;
}) {
  const index = currentValue === null ? -1 : entries.findIndex((e) => e.value === currentValue);
  const last = Math.max(1, entries.length - 1);
  const position = index < 0 ? 0 : index / last;
  const current = index >= 0 ? entries[index] : undefined;
  const atMax = index >= 0 && index === entries.length - 1;
  return (
    <div className="w-72 space-y-3" data-thought-level-slider="true" data-max={atMax || undefined}>
      <div className="flex items-baseline justify-between gap-3 text-ui-sm">
        <span className="text-foreground-subtle">{title}</span>
        <span className="font-medium text-foreground" data-testid="chat-thought-level-current">
          {current?.label ?? "—"}
        </span>
      </div>
      <div className="relative h-7">
        <div className="knorvia-effort-track absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full">
          <div
            className="knorvia-effort-fill h-full rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.34,1.36,0.64,1)]"
            data-max={atMax || undefined}
            style={{ width: `calc(0.75rem + (100% - 0.75rem) * ${position})` }}
          />
        </div>
        <span
          aria-hidden="true"
          className="knorvia-effort-knob pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left] duration-300 ease-[cubic-bezier(0.34,1.36,0.64,1)]"
          data-max={atMax || undefined}
          style={{ left: `calc(0.625rem + (100% - 1.25rem) * ${position})` }}
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
                ? "font-medium text-foreground"
                : "text-foreground-subtlest hover:text-foreground",
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
