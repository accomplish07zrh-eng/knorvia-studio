import { useMemo, type ComponentProps } from "react";
import { ChatEmptyWorkspacePreviewMenu } from "@/ChatEmptyState.js";
import { useSelectDirectory } from "@/hooks/usePlatform.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { toast } from "@/components/ui/toast.js";
import { getPathLeaf } from "@/lib/path.js";
import { useStudioAgentStore } from "@/store/studioAgentStore.js";
import type { StudioKernelId } from "../types.js";
import { useStudioRuntime } from "../runtime/useStudioRuntime.js";

export type StudioDraftProjectMenuProps = Pick<
  ComponentProps<typeof ChatEmptyWorkspacePreviewMenu>,
  | "workspaceTabs"
  | "isWindowsDesktop"
  | "onConnectRemote"
  | "onSelectRemoteProject"
  | "onCancelRemoteProject"
>;

export function StudioDraftProjectMenu({
  sessionId,
  kernelId,
  workspacePath,
  workspaceTabs,
  ...menuProps
}: StudioDraftProjectMenuProps & {
  sessionId: string;
  kernelId: StudioKernelId;
  workspacePath: string;
}) {
  const { intl } = useKnorviaIntl();
  const selectDirectory = useSelectDirectory();
  const setDraftWorkspace = useStudioAgentStore((state) => state.setDraftWorkspace);
  const knownDrafts = useStudioAgentStore((state) => state.drafts);
  const { overview } = useStudioRuntime();
  const tabs = useMemo(() => {
    const paths = new Set(
      workspaceTabs
        .filter(
          (tab) =>
            !tab.remoteSessionId &&
            !tab.remoteTarget &&
            !tab.workspaceIdentity &&
            tab.workspacePurpose !== "conversation",
        )
        .map((tab) => tab.workspacePath),
    );
    for (const draft of Object.values(knownDrafts))
      if (draft.workspacePath) paths.add(draft.workspacePath);
    for (const conversation of overview?.conversations ?? [])
      if (conversation.workspacePath) paths.add(conversation.workspacePath);
    // 空路径仅为选择器的「尚未绑定项目」呈现，不创建原生 conversation workspace。
    return [
      { workspacePath: "", label: "", workspacePurpose: "conversation" as const },
      ...Array.from(paths, (path) => ({
        workspacePath: path,
        label: getPathLeaf(path),
        workspacePurpose: "project" as const,
      })),
    ];
  }, [knownDrafts, workspaceTabs, overview?.conversations]);
  const openFolder = async () => {
    try {
      const path = await selectDirectory();
      // 使用点击时捕获的 ID；选择目录期间换内核不能污染新会话。
      if (path) setDraftWorkspace(sessionId, kernelId, path);
    } catch {
      toast(intl.formatMessage({ id: "studio.agents.error.invalid-project" }), {
        variant: "warning",
      });
    }
  };
  return (
    <ChatEmptyWorkspacePreviewMenu
      {...menuProps}
      workspacePath={workspacePath}
      workspaceTabs={tabs}
      allowRemoteWorkspace={false}
      onSelectWorkspace={(tab) => setDraftWorkspace(sessionId, kernelId, tab.workspacePath)}
      onSelectConversationWorkspace={() => {
        setDraftWorkspace(sessionId, kernelId, "");
      }}
      onOpenFolder={() => {
        void openFolder();
      }}
    />
  );
}
