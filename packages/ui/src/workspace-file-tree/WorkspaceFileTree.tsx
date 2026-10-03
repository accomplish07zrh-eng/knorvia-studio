/* eslint-disable max-lines -- WorkspaceFileTree 需要集中编排数据、虚拟列表、吸顶和入口操作状态。 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  ArrowLeft,
  Copy,
  Ellipsis,
  FolderOpen,
  GitCommitVertical,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { toast } from "@/components/ui/toast.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import {
  TID_WORKSPACE_FILE_TREE_PANEL,
  TID_WORKSPACE_FILE_TREE_REFRESH_BUTTON,
} from "@knorvia/shared";
import {
  getWorkspaceFileGitStatus,
  filterWorkspaceFileTreeRows,
  type WorkspaceFileGitStatus,
} from "@/workspace-file-tree/model.js";
import { getPathLeaf } from "@/lib/path.js";
import { logger } from "@/logger.js";
import { WORKSPACE_FILE_TREE_VIRTUAL_ROW_HEIGHT_PX } from "@/workspace-file-tree/constants.js";
import { getFileManagerLabel } from "@/workspace-file-tree/helpers.js";
import { useInstalledFileTreeEditors } from "@/workspace-file-tree/useInstalledFileTreeEditors.js";
import {
  FileTreePanelInteractionOwner,
  type FileTreePanelPorts,
} from "./fileTreePanelInteractionOwner.js";
import { observeFileTreeViewport } from "./fileTreeViewportLease.js";
import { useWorkspaceOpenInEditorTarget } from "@/hooks/useWorkspaceOpenInEditorTarget.js";
import {
  resolveWorkspaceEditorSelection,
  resolveWorkspaceFileManagerEditor,
} from "@/lib/workspaceEditorSelection.js";
import { useWorkspaceFileTreeData } from "@/workspace-file-tree/useWorkspaceFileTreeData.js";
import { useWorkspaceFileTreeStickyFolders } from "@/workspace-file-tree/useWorkspaceFileTreeStickyFolders.js";
import {
  useWorkspaceFileSearchIndex,
  useWorkspaceFileSearchResults,
} from "@/workspace-file-tree/useWorkspaceFileSearchIndex.js";
import {
  WORKSPACE_FILE_TREE_MASK_OFFSET_PROPERTY,
  WorkspaceFileTreeList,
} from "@/workspace-file-tree/WorkspaceFileTreeList.js";
import { WorkspaceFileTreeStickyFolders } from "@/workspace-file-tree/WorkspaceFileTreeStickyFolders.js";
import { createWorkspaceFileTreeRowsFromSearchEntries } from "@/workspace-file-tree/searchRows.js";
import type {
  WorkspaceFileTreeProps,
  WorkspaceFileTreeStickyFolderItem,
} from "@/workspace-file-tree/types.js";

export function WorkspaceFileTree({
  workspacePath,
  workspaceName,
  workspaceIdentity,
  workspaceRemoteSessionId,
  revealPath,
  temporaryExternalDirectory = false,
  canOpenLocalFileManager = false,
  activePreviewPath,
  onClose,
  onOpenBrowserUrl,
  onOpenPreview,
}: WorkspaceFileTreeProps) {
  const { intl } = useKnorviaIntl();
  const platform = usePlatform();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const panelPortsRef = useRef<FileTreePanelPorts | null>(null);
  const [panel] = useState(
    () =>
      new FileTreePanelInteractionOwner(() => {
        if (!panelPortsRef.current) throw new Error("File tree panel ports are inactive");
        return panelPortsRef.current;
      }),
  );
  const {
    selected: selectedPath,
    query: fileSearchQuery,
    changedOnly: showChangedOnly,
  } = useSyncExternalStore(panel.subscribe, panel.read, panel.read);
  const setSelectedPath = panel.select,
    setFileSearchQuery = panel.search,
    setShowChangedOnly = panel.changed;
  const [showScrollBottomMask, setShowScrollBottomMask] = useState(false);
  const [hasScrollableFileTree, setHasScrollableFileTree] = useState(false);
  const handleListRef = useCallback((node: HTMLDivElement | null) => {
    listRef.current = node;
    if (node) {
      node.style.setProperty(
        WORKSPACE_FILE_TREE_MASK_OFFSET_PROPERTY,
        `${scrollRef.current?.scrollTop ?? 0}px`,
      );
    }
  }, []);
  const treeData = useWorkspaceFileTreeData({
    workspacePath,
    workspaceIdentity,
    workspaceRemoteSessionId,
    enableWorkspaceFeatures: !temporaryExternalDirectory,
  });
  const { installedEditors } = useInstalledFileTreeEditors();
  const isRemoteWorkspaceFileTree = Boolean(workspaceRemoteSessionId || workspaceIdentity);
  const { remoteTarget } = useWorkspaceOpenInEditorTarget({
    workspacePath,
    workspaceIdentity,
    workspaceRemoteSessionId,
  });
  const availableEditors = useMemo(
    () =>
      isRemoteWorkspaceFileTree && !remoteTarget
        ? []
        : resolveWorkspaceEditorSelection({
            installedEditors,
            selectedEditorId: null,
            remoteTarget,
          }).availableEditors,
    [installedEditors, isRemoteWorkspaceFileTree, remoteTarget],
  );
  const wslFileManagerEditor = resolveWorkspaceFileManagerEditor(availableEditors, remoteTarget);
  const canOpenInFileManager =
    Boolean(wslFileManagerEditor) || (canOpenLocalFileManager && !isRemoteWorkspaceFileTree);
  const hasFileSearchQuery = fileSearchQuery.trim().length > 0;
  const searchIndex = useWorkspaceFileSearchIndex({
    workspacePath,
    workspaceIdentity,
    workspaceRemoteSessionId,
    enabled: hasFileSearchQuery,
  });
  const {
    entries: searchIndexEntries,
    error: searchIndexError,
    loaded: searchIndexLoaded,
    loading: searchIndexLoading,
    refresh: refreshSearchIndex,
  } = searchIndex;
  const searchEntries = useWorkspaceFileSearchResults({
    entries: searchIndexEntries,
    query: fileSearchQuery,
    workspacePath,
  });
  const searchRows = useMemo(
    () => createWorkspaceFileTreeRowsFromSearchEntries(searchEntries),
    [searchEntries],
  );
  const visibleRows = useMemo(() => {
    if (hasFileSearchQuery) {
      return showChangedOnly
        ? searchRows.filter((row) => getWorkspaceFileGitStatus(treeData.gitStatusByPath, row.path))
        : searchRows;
    }
    return filterWorkspaceFileTreeRows({
      rows: treeData.rows,
      searchQuery: fileSearchQuery,
      changedOnly: showChangedOnly,
      statusByPath: treeData.gitStatusByPath,
    });
  }, [
    fileSearchQuery,
    hasFileSearchQuery,
    searchRows,
    showChangedOnly,
    treeData.gitStatusByPath,
    treeData.rows,
  ]);
  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => WORKSPACE_FILE_TREE_VIRTUAL_ROW_HEIGHT_PX,
    overscan: 12,
  });

  useLayoutEffect(() => {
    panelPortsRef.current = {
      workspacePath,
      loadDirectory: treeData.loadDirectory,
      setExpanded: treeData.setExpandedPaths,
      gitStatus: treeData.gitStatusByPath,
      preview: onOpenPreview,
      refreshDirectories: treeData.refreshLoadedDirectories,
      refreshSearch: refreshSearchIndex,
      fileManager: canOpenInFileManager
        ? () =>
            wslFileManagerEditor
              ? platform.openInEditor(wslFileManagerEditor.id, workspacePath, {
                  pathKind: "directory",
                  remoteTarget,
                  workspaceIdentity,
                })
              : platform.openInFileManager(workspacePath)
        : null,
      clipboardAvailable: () =>
        typeof navigator !== "undefined" && Boolean(navigator.clipboard?.writeText),
      copyPath: () => navigator.clipboard.writeText(workspacePath),
      notify: (id, suffix) =>
        toast(`${intl.formatMessage({ id })}${suffix === undefined ? "" : `: ${suffix}`}`),
      log: (level, message, details) => logger[level](message, details),
    };
  });
  useLayoutEffect(
    () => panel.activate(),
    [panel, platform, workspaceIdentity, workspacePath, workspaceRemoteSessionId],
  );
  useEffect(() => panel.resetFilters(), [panel, workspaceIdentity, workspacePath]);

  useEffect(() => {
    if (!treeData.gitStatusAvailable) {
      setShowChangedOnly(false);
    }
  }, [treeData.gitStatusAvailable]);

  const rootLoading = treeData.loadingDirectoryPaths.has(workspacePath);
  const rootLoaded = treeData.loadedDirectoryPaths.has(workspacePath);
  const rootError = treeData.errorByDirectory.get(workspacePath) ?? null;
  const blockingRootError = getWorkspaceFileTreeBlockingRootError({
    rootLoaded,
    rootError,
  });
  const showInitialLoading = !rootLoaded && !blockingRootError;
  useEffect(
    () => panel.noticeRootError(rootLoaded, rootError),
    [intl, panel, rootError, rootLoaded],
  );
  const gitStatusLabelByStatus = useMemo<Record<WorkspaceFileGitStatus, string>>(
    () => ({
      added: intl.formatMessage({ id: "git.kind.added" }),
      deleted: intl.formatMessage({ id: "git.kind.deleted" }),
      ignored: intl.formatMessage({
        id: "workspaceFileTree.gitStatus.ignored",
      }),
      modified: intl.formatMessage({ id: "git.kind.modified" }),
      renamed: intl.formatMessage({ id: "git.kind.renamed" }),
      untracked: intl.formatMessage({ id: "git.section.untracked" }),
    }),
    [intl],
  );
  const fileManagerLabel = getFileManagerLabel(intl);
  const fileContextMenuLabels = useMemo(
    () => ({
      addToChat: intl.formatMessage({ id: "workspaceFileTree.addToChat" }),
      copyAbsolutePath: intl.formatMessage({
        id: "fileActions.copyAbsolutePath",
      }),
      copyRelativePath: intl.formatMessage({
        id: "fileActions.copyRelativePath",
      }),
      open: intl.formatMessage({ id: "common.open" }),
      openInBrowser: intl.formatMessage({
        id: "workspaceFileTree.openInBrowser",
      }),
      openFailed: intl.formatMessage({ id: "workspaceFileTree.openFailed" }),
      openWith: intl.formatMessage({ id: "workspaceFileTree.openWith" }),
      reveal: fileManagerLabel,
    }),
    [fileManagerLabel, intl],
  );

  const scrollMaskStyle = useMemo<CSSProperties | undefined>(() => {
    if (!showScrollBottomMask) {
      return undefined;
    }
    return {
      WebkitMaskImage:
        "linear-gradient(to bottom, black 0px, black calc(100% - 32px), transparent 100%)",
      maskImage: "linear-gradient(to bottom, black 0px, black calc(100% - 32px), transparent 100%)",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskSize: "100% 100%",
      maskSize: "100% 100%",
    };
  }, [showScrollBottomMask]);
  const scrollContainerStyle = useMemo<CSSProperties>(
    () => ({ ...scrollMaskStyle, overflowAnchor: "none" }),
    [scrollMaskStyle],
  );

  useEffect(
    () => panel.revealPreview(activePreviewPath, revealPath),
    [
      activePreviewPath,
      panel,
      revealPath,
      treeData.loadDirectory,
      treeData.setExpandedPaths,
      workspacePath,
    ],
  );
  useEffect(
    () =>
      panel.revealVisiblePreview(visibleRows, activePreviewPath, revealPath, (index) =>
        rowVirtualizer.scrollToIndex(index, { align: "auto" }),
      ),
    [activePreviewPath, panel, revealPath, rowVirtualizer, visibleRows, workspacePath],
  );
  useEffect(
    () =>
      panel.revealVisibleSearch(visibleRows, hasFileSearchQuery, (index) =>
        rowVirtualizer.scrollToIndex(index, { align: "center" }),
      ),
    [hasFileSearchQuery, panel, rowVirtualizer, visibleRows],
  );
  useEffect(() => {
    const scrollNode = scrollRef.current;
    if (!scrollNode) return;
    return observeFileTreeViewport({
      scroll: scrollNode,
      content:
        scrollNode.firstElementChild instanceof HTMLElement ? scrollNode.firstElementChild : null,
      window,
      // 原生 scroll 同帧更新 offset，不等待 virtualizer 的下一 React 帧。
      offset: (value) =>
        listRef.current?.style.setProperty(WORKSPACE_FILE_TREE_MASK_OFFSET_PROPERTY, value),
      publish: ({ overflow, bottomMask }) => {
        setHasScrollableFileTree(overflow);
        setShowScrollBottomMask(bottomMask);
      },
      resizeObserver: (callback) => new ResizeObserver(callback),
      frame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (id) => cancelAnimationFrame(id),
    });
  }, [rootError, rootLoaded, rootLoading, visibleRows.length]);
  const handleRefresh = panel.refresh,
    handleOpenInFileManager = panel.openFileManager,
    handleCopyPath = panel.copyPath;
  const handleToggleDirectory = panel.toggle,
    handleDirectoryAction = panel.directory;
  const handleOpenPreview = panel.preview,
    handleRowKeyDown = panel.keyDown;
  const refreshInProgress =
    rootLoading || treeData.refreshingLoadedDirectories || searchIndexLoading;

  const hasActiveFileTreeFilter = fileSearchQuery.trim().length > 0 || showChangedOnly;
  const virtualItems = rowVirtualizer.getVirtualItems();
  const scrollOffset = rowVirtualizer.scrollOffset ?? 0;
  const stickyFolderItems = useWorkspaceFileTreeStickyFolders({
    rows: visibleRows,
    virtualItems,
    scrollDirection: rowVirtualizer.scrollDirection,
    scrollOffset,
    enabled: hasScrollableFileTree && !hasFileSearchQuery,
  });
  const handleRevealStickyFolderRow = useCallback(
    (item: WorkspaceFileTreeStickyFolderItem) =>
      rowVirtualizer.scrollToIndex(item.index, { align: "start" }),
    [rowVirtualizer],
  );
  const workspaceTitle =
    workspaceName?.trim() ||
    getPathLeaf(workspacePath) ||
    intl.formatMessage({ id: "workspaceFileTree.title" });
  const editorState = {
    canOpenLocalFileManager,
    installedEditors: availableEditors,
    isRemoteWorkspaceFileTree,
    remoteTarget,
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col text-foreground"
      data-testid={TID_WORKSPACE_FILE_TREE_PANEL}
    >
      <div className="px-2 pb-3 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full justify-start gap-2 rounded-xl px-2.5 text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
          onClick={onClose}
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span className="min-w-0 truncate">
            {intl.formatMessage({ id: "workspaceFileTree.backToTasks" })}
          </span>
        </Button>
      </div>
      <div className="flex shrink-0 items-center px-2 pb-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-foreground-subtlest" />
          <Input
            type="text"
            size="default"
            value={fileSearchQuery}
            className="h-7 bg-transparent pl-7 pr-7 focus-visible:bg-input-focused"
            placeholder={intl.formatMessage({
              id: "workspaceFileTree.searchPlaceholder",
            })}
            aria-label={intl.formatMessage({
              id: "workspaceFileTree.searchLabel",
            })}
            onChange={(event) => setFileSearchQuery(event.currentTarget.value)}
          />
          {fileSearchQuery.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-foreground-subtlest hover:bg-surface-hover hover:text-foreground"
              aria-label={intl.formatMessage({
                id: "workspaceFileTree.clearSearch",
              })}
              title={intl.formatMessage({
                id: "workspaceFileTree.clearSearch",
              })}
              onClick={() => setFileSearchQuery("")}
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center px-2 pb-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <h3 className="min-w-0 truncate py-1 pr-0.5 pl-2.5 text-ui-base font-medium text-foreground-subtlest">
            {workspaceTitle}
          </h3>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
              aria-label={intl.formatMessage({ id: "common.more" })}
              title={intl.formatMessage({ id: "common.more" })}
            >
              <Ellipsis className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              disabled={!canOpenInFileManager}
              onSelect={() => void handleOpenInFileManager()}
            >
              <FolderOpen className="size-4" />
              {fileManagerLabel}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void handleCopyPath()}>
              <Copy className="size-4" />
              {intl.formatMessage({ id: "appHeader.copyPath" })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {treeData.gitStatusAvailable ? (
          <ControlHintTooltip
            title={intl.formatMessage({
              id: showChangedOnly
                ? "workspaceFileTree.showAllFiles"
                : "workspaceFileTree.showChangedFiles",
            })}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-pressed={showChangedOnly}
              aria-label={intl.formatMessage({
                id: showChangedOnly
                  ? "workspaceFileTree.showAllFiles"
                  : "workspaceFileTree.showChangedFiles",
              })}
              className={cn(
                "text-foreground-subtle hover:bg-surface-hover hover:text-foreground",
                showChangedOnly && "bg-selected text-foreground",
              )}
              onClick={() => setShowChangedOnly((current) => !current)}
            >
              <GitCommitVertical className="size-3.5" />
            </Button>
          </ControlHintTooltip>
        ) : null}
        <ControlHintTooltip title={intl.formatMessage({ id: "workspaceFileTree.refresh" })}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-testid={TID_WORKSPACE_FILE_TREE_REFRESH_BUTTON}
            className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
            aria-label={intl.formatMessage({ id: "workspaceFileTree.refresh" })}
            disabled={treeData.refreshingLoadedDirectories}
            onClick={handleRefresh}
          >
            <RefreshCw className={cn("size-3.5", refreshInProgress && "animate-spin")} />
          </Button>
        </ControlHintTooltip>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="h-full min-h-0 overflow-auto px-1 px-2"
          style={scrollContainerStyle}
        >
          <WorkspaceFileTreeStickyFolders
            items={stickyFolderItems}
            selectedPath={selectedPath}
            gitStatusByPath={treeData.gitStatusByPath}
            ignoredPathSet={treeData.ignoredPathSet}
            gitStatusLabelByStatus={gitStatusLabelByStatus}
            contextMenuLabels={fileContextMenuLabels}
            editorState={editorState}
            workspacePath={workspacePath}
            workspaceIdentity={workspaceIdentity}
            onSelect={setSelectedPath}
            onToggleDirectory={handleToggleDirectory}
            onRevealRow={handleRevealStickyFolderRow}
            onOpenPreview={handleOpenPreview}
            onOpenBrowserUrl={onOpenBrowserUrl}
            onKeyDown={handleRowKeyDown}
          />
          <WorkspaceFileTreeList
            rootError={hasFileSearchQuery ? searchIndexError : blockingRootError}
            showInitialLoading={
              showInitialLoading || (hasFileSearchQuery && searchIndexLoading && !searchIndexLoaded)
            }
            rows={visibleRows}
            virtualItems={virtualItems}
            listRef={handleListRef}
            stickyFolderCount={stickyFolderItems.length}
            totalSize={rowVirtualizer.getTotalSize()}
            emptyTitle={intl.formatMessage({
              id: hasActiveFileTreeFilter
                ? "workspaceFileTree.noResults"
                : "workspaceFileTree.empty",
            })}
            workspaceTitle={workspaceTitle}
            workspacePath={workspacePath}
            workspaceIdentity={workspaceIdentity}
            selectedPath={selectedPath}
            gitStatusByPath={treeData.gitStatusByPath}
            ignoredPathSet={treeData.ignoredPathSet}
            gitStatusLabelByStatus={gitStatusLabelByStatus}
            contextMenuLabels={fileContextMenuLabels}
            editorState={editorState}
            onSelect={setSelectedPath}
            onToggleDirectory={handleDirectoryAction}
            onOpenPreview={handleOpenPreview}
            onOpenBrowserUrl={onOpenBrowserUrl}
            onKeyDown={handleRowKeyDown}
          />
        </div>
      </div>
    </section>
  );
}

function getWorkspaceFileTreeBlockingRootError({
  rootLoaded,
  rootError,
}: {
  rootLoaded: boolean;
  rootError: Error | null;
}) {
  return rootLoaded ? null : rootError;
}
