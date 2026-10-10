import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { getPathLeaf } from "@/lib/path.js";
import { formatTaskRelativeTime } from "@/lib/taskListItemPresentation.js";
import { STUDIO_KERNELS, studioKernelOption, type StudioKernelId } from "../types.js";
import type { TaskWorkbenchState } from "./workbenchModel.js";
import { untouchedWorkbenchTile, workbenchPaneFor } from "./workbenchPlacement.js";
import type { WorkbenchConversationRow } from "./workbenchTasks.js";
import { WORKBENCH_TILE_LIMIT } from "./workbenchModel.js";

/** 一次最多渲染的行数；更多结果靠搜索缩小，避免长历史拖慢浮层。 */
const RENDER_LIMIT = 200;

/** 还能放入的格子数：空余位置加上可复用的待命格。 */
export function workbenchFreeSlots(board: TaskWorkbenchState): number {
  const tiles = Object.values(board.tiles);
  return WORKBENCH_TILE_LIMIT - tiles.length + tiles.filter(untouchedWorkbenchTile).length;
}

/**
 * 「添加对话」浮层（specs/knorvia-workbench-conversations-20261010.md）：按内核分组列出已受理的对话，
 * 可搜索、多选，一次放入工作台。只改视图引用，不发送任何会话命令。
 */
export function WorkbenchConversationPicker({
  board,
  rows,
  loading,
  onAdd,
}: {
  board: TaskWorkbenchState;
  rows: WorkbenchConversationRow[];
  loading: boolean;
  onAdd(rows: WorkbenchConversationRow[]): void;
}) {
  const { intl, locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const free = workbenchFreeSlots(board);
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? rows.filter((row) =>
            `${row.title}\n${getPathLeaf(row.workspacePath)}\n${studioKernelOption(row.kernel).name}`
              .toLowerCase()
              .includes(needle),
          )
        : rows,
    [needle, rows],
  );
  const visible = filtered.slice(0, RENDER_LIMIT);
  // 分组顺序跟随内核登记顺序；本机发现或远程的 ACP 内核排在后面。
  const order = (id: StudioKernelId) => {
    const index = STUDIO_KERNELS.findIndex((kernel) => kernel.id === id);
    return index < 0 ? STUDIO_KERNELS.length : index;
  };
  const groups = [...new Set(visible.map((row) => row.kernel))]
    .sort((a, b) => order(a) - order(b))
    .map((id) => ({
      option: { id, name: studioKernelOption(id).name },
      rows: visible.filter((row) => row.kernel === id),
    }));
  const chosen = rows.filter((row) => selected.has(row.key) && !workbenchPaneFor(board, row.tile));
  const over = chosen.length > free;
  const toggle = (key: string) =>
    setSelected((prior) => {
      const next = new Set(prior);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <div data-testid="workbench-conversation-picker" className="flex max-h-[60vh] flex-col">
      <div className="px-3 pt-3 pb-2">
        <label className="flex h-8 items-center gap-2 rounded-full border border-border bg-background px-3 focus-within:border-foreground-subtle">
          <Search className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
          <input
            autoFocus
            data-testid="workbench-conversation-search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={zh ? "搜索对话标题或项目" : "Search conversations or projects"}
            aria-label={zh ? "搜索对话" : "Search conversations"}
            className="min-w-0 flex-1 bg-transparent text-ui-sm outline-none placeholder:text-foreground-subtlest"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {groups.map(({ option, rows: items }) => (
          <section key={option.id} className="pt-2">
            <h3 className="px-2 pb-1 text-ui-xs text-foreground-subtle">{option.name}</h3>
            {items.map((row) => {
              const placed = Boolean(workbenchPaneFor(board, row.tile));
              const checked = placed || selected.has(row.key);
              const project = getPathLeaf(row.workspacePath);
              return (
                <button
                  key={row.key}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={placed || row.unavailable}
                  data-testid="workbench-conversation-row"
                  onClick={() => toggle(row.key)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                    "hover:bg-sidebar-accent disabled:cursor-default disabled:hover:bg-transparent",
                    checked && !placed && "bg-sidebar-accent",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border",
                      checked
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background",
                      placed && "opacity-40",
                    )}
                  >
                    {checked && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-ui-sm",
                        (placed || row.unavailable) && "text-foreground-subtle",
                      )}
                      title={row.title}
                    >
                      {row.title || (zh ? "未命名对话" : "Untitled conversation")}
                    </span>
                    <span
                      className="block truncate text-ui-xs text-foreground-subtlest"
                      title={row.workspacePath}
                    >
                      {project}
                    </span>
                  </span>
                  <span className="shrink-0 text-ui-xs text-foreground-subtlest">
                    {placed
                      ? zh
                        ? "已在工作台"
                        : "In workbench"
                      : row.unavailable
                        ? zh
                          ? "离线"
                          : "Offline"
                        : formatTaskRelativeTime(row.updatedAt, intl)}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
        {!groups.length && (
          <p className="px-2 py-6 text-center text-ui-sm text-foreground-subtle">
            {loading
              ? zh
                ? "正在读取对话…"
                : "Reading conversations…"
              : needle
                ? zh
                  ? "没有匹配的对话。"
                  : "No matching conversations."
                : zh
                  ? "还没有已发送的对话。"
                  : "No sent conversations yet."}
          </p>
        )}
        {filtered.length > RENDER_LIMIT && (
          <p className="px-2 py-2 text-ui-xs text-foreground-subtle">
            {zh
              ? `仅显示最近 ${RENDER_LIMIT} 个，继续输入以筛选。`
              : `Showing the latest ${RENDER_LIMIT}. Type to narrow down.`}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <span
          className={cn("min-w-0 flex-1 truncate text-ui-xs", over ? "" : "text-foreground-subtle")}
          role={over ? "alert" : undefined}
        >
          {over
            ? zh
              ? `已选 ${chosen.length} 个，工作台只剩 ${free} 个位置`
              : `${chosen.length} selected, only ${free} free tiles`
            : zh
              ? `已选 ${chosen.length} 个 · 还可放入 ${free} 个`
              : `${chosen.length} selected · ${free} free tiles`}
        </span>
        <Button
          size="sm"
          data-testid="workbench-conversation-add"
          disabled={!chosen.length || over}
          onClick={() => {
            onAdd(chosen);
            setSelected(new Set());
          }}
        >
          {zh
            ? `加入工作台${chosen.length ? ` (${chosen.length})` : ""}`
            : `Add${chosen.length ? ` (${chosen.length})` : ""}`}
        </Button>
      </div>
    </div>
  );
}
