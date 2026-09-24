import { useMemo, useState } from "react";
import type { StudioWorkspaceChange } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { DiffViewer } from "@/components/ui/diff-viewer.js";
import { useKnorviaStore } from "@/store/StoreProvider.js";
import { resolveTheme } from "@/useTheme.js";
import { studioWorkspaceDiff } from "./studioWorkspaceDiff.js";

export function StudioWorkspaceReviewCard({
  change,
  zh,
  busy,
  applying,
  onApply,
}: {
  change: StudioWorkspaceChange;
  zh: boolean;
  busy: boolean;
  applying: boolean;
  onApply: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const theme = useKnorviaStore((state) => state.theme);
  const codePreviewSettings = useKnorviaStore((state) => state.codePreviewSettings);
  const diff = useMemo(() => studioWorkspaceDiff(change), [change]);
  const kind = zh
    ? { added: "新增", modified: "修改", deleted: "删除" }[change.kind]
    : { added: "Added", modified: "Modified", deleted: "Deleted" }[change.kind];
  return (
    <div className="rounded-lg border border-border p-3 text-ui-sm">
      <button
        type="button"
        aria-expanded={expanded}
        className="w-full cursor-pointer text-left [overflow-wrap:anywhere]"
        onClick={() => setExpanded((value) => !value)}
      >
        {change.path} · {kind} {change.conflict ? (zh ? "· 有冲突" : "· Conflict") : ""}
      </button>
      {change.conflict && (
        <p role="alert" className="mt-2 text-destructive">
          {zh
            ? "源项目中的文件在隔离后已被修改或删除，与原始版本及此成员的版本均不同。为避免覆盖现有内容，不能应用此文件。"
            : "The source file changed or was deleted after isolation and differs from both the original and this member's version. Applying it would overwrite those changes."}
        </p>
      )}
      {expanded && (diff.canShowText && diff.oldFile && diff.newFile ? (
        <DiffViewer
          oldFile={diff.oldFile}
          newFile={diff.newFile}
          className="mt-3 max-h-80 min-h-12 rounded-md border border-border"
          fontSizePx={codePreviewSettings.fontSizePx}
          lightTheme={codePreviewSettings.lightTheme}
          darkTheme={codePreviewSettings.darkTheme}
          themeType={resolveTheme(theme)}
        />
      ) : (
        <p className="mt-3 text-foreground-subtle">
          {zh
            ? "二进制文件或无法读取的文本，没有可用的文字差异预览。"
            : "Binary or unreadable file; no text diff is available."}
        </p>
      ))}
      <Button
        className="mt-2"
        size="sm"
        variant="outline"
        disabled={busy || !diff.canApply}
        onClick={onApply}
      >
        {applying
          ? zh
            ? "正在应用…"
            : "Applying…"
          : zh
            ? "应用此文件"
            : "Apply this file"}
      </Button>
    </div>
  );
}
