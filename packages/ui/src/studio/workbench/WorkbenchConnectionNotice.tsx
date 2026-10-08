import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { isWorkbenchConnectionUnverified } from "./workbenchConnection.js";
import { useTaskWorkbench } from "./workbenchStore.js";
import type { WorkbenchTile } from "./workbenchModel.js";

export function WorkbenchConnectionNotice({
  pane,
  tile,
  canReopenInput = false,
}: {
  pane: string;
  tile: WorkbenchTile;
  canReopenInput?: boolean;
}) {
  const { locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  const restored = isWorkbenchConnectionUnverified(tile.id);
  return (
    <div role="status" className="space-y-3 p-5 text-ui-sm text-foreground-subtle">
      <p>
        {zh
          ? "连接不可用或尚未核对，请在单聊核对后重新加入工作台。"
          : "The Host is unavailable or changed. Verify the chat before adding it again."}
      </p>
      {restored && (
        <>
          <p>
            {zh
              ? "布局和草稿已保留；重载后需要重新核对原连接。"
              : "Your layout and drafts are preserved. Verify the original connection after reload."}
          </p>
          <p className="break-all">
            {tile.kernel} · {tile.scope.workspaceIdentity?.trim() || tile.scope.workspacePath}
          </p>
          {canReopenInput && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => useTaskWorkbench.getState().reopenInput(pane, tile.id)}
            >
              {zh ? "在当前项目打开保存的输入" : "Open saved input in this project"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
