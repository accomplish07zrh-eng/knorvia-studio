import { useRef } from "react";
import { DEFAULT_EMBEDDED_BROWSER_VIEWPORT_PREFERENCE } from "@knorvia/shared";
import { UnifiedBrowserView } from "@/browser-use/UnifiedBrowserView.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import type { WorkbenchTile } from "./workbenchModel.js";
import { useWorkbenchPreview, workbenchPreviewBinding } from "./workbenchPreviewStore.js";

/** 只有本机桌面、本地项目且非远端内核时，格子内才能渲染网页。 */
export function canRenderWorkbenchPreview(tile: WorkbenchTile, isDesktop: boolean): boolean {
  return (
    isDesktop &&
    !tile.kernel.startsWith("ssh:") &&
    !tile.scope.workspaceIdentity?.trim() &&
    !tile.scope.remoteSessionId
  );
}

/**
 * 每格产物预览（specs/knorvia-workbench-artifact-preview-20261008.md）：
 * 复用会话侧栏的网页视图，以仅显示模式运行，不登记为 Agent 可控标签。
 */
export function WorkbenchPreview({
  tile,
  visible,
  isDesktop,
}: {
  tile: WorkbenchTile;
  visible: boolean;
  isDesktop: boolean;
}) {
  const { locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  const binding = workbenchPreviewBinding(tile);
  const stored = useWorkbenchPreview((state) => state.entries[tile.id]);
  const open = useWorkbenchPreview((state) => state.open);
  const entry = stored?.binding === binding ? stored : undefined;
  // 首次挂载用 initialUrl；之后每次重新打开（含同一地址被重新生成）都发导航请求。
  // initialUrl 变化本身也会导航，因此冻结为挂载时的地址，避免与导航请求重复加载。
  const mounted = useRef<{ binding: string; revision: number; url: string } | null>(null);
  if (entry && mounted.current?.binding !== binding)
    mounted.current = { binding, revision: entry.revision, url: entry.url };
  const supported = canRenderWorkbenchPreview(tile, isDesktop);
  const external = tile.kernel !== "knorvia";

  let notice: string | null = null;
  if (!supported)
    notice = zh
      ? "此环境暂不能在格子内预览网页（需要桌面版本机项目）。聊天不受影响。"
      : "Web previews in tiles need the desktop app with a local project. The chat is unaffected.";
  else if (!entry)
    notice = external
      ? zh
        ? "任务结束后，本次改动的网页会显示在这里。"
        : "Web pages changed by the finished run appear here."
      : zh
        ? "Agent 生成网页后会显示在这里；也可以点击聊天里的网页卡片。"
        : "Web pages the agent creates appear here. You can also click a web card in the chat.";

  return (
    <div
      data-testid="workbench-preview"
      data-tile-id={tile.id}
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-background"
    >
      {entry && supported ? (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2 text-ui-xs">
          {entry.files.length > 1 ? (
            <select
              aria-label={zh ? "选择预览文件" : "Choose the previewed file"}
              data-testid="workbench-preview-file"
              className="h-7 min-w-0 flex-1 truncate rounded-full border border-border bg-background px-2 text-ui-xs"
              value={entry.url}
              onChange={(event) => {
                const file = entry.files.find((item) => item.url === event.target.value);
                if (file) open(tile.id, binding, file, entry.files);
              }}
            >
              {entry.files.map((file) => (
                <option key={file.url} value={file.url}>
                  {file.title}
                </option>
              ))}
            </select>
          ) : (
            <span className="min-w-0 flex-1 truncate text-foreground-subtle" title={entry.title}>
              {entry.title}
            </span>
          )}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        {notice ? (
          <p role="status" className="p-5 text-ui-sm text-foreground-subtle">
            {notice}
          </p>
        ) : entry ? (
          <UnifiedBrowserView
            key={binding}
            browserKey={`workbench-preview:${tile.id}`}
            displayOnly
            isVisible={visible}
            isSelected={visible}
            isCurrentTask={false}
            initialUrl={mounted.current?.url ?? entry.url}
            navigationRequest={
              mounted.current && entry.revision > mounted.current.revision
                ? { id: `${binding}:${entry.revision}`, url: entry.url }
                : null
            }
            initialHumanViewportPreference={DEFAULT_EMBEDDED_BROWSER_VIEWPORT_PREFERENCE}
          />
        ) : null}
      </div>
    </div>
  );
}
