/* eslint-disable max-lines -- 顶层 grouped task 容器仍集中维护远程 workspace service 解析、group 菜单、task 菜单和列表写回；子行与纯 helper 已拆到 workspace-grouped-tasks 目录。 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  CollisionDetection,
  DropAnimation,
} from "@dnd-kit/core";
import type { KnorviaGroupedTaskView } from "@knorvia/services";
import { OFF_PEAK_DEFAULT_GROUP_ID, type KnorviaTaskMeta } from "@knorvia/shared";
import { createPortal } from "react-dom";
import { cn } from "@/components/lib/utils.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { TaskRenameDialog } from "@/TaskRenameDialog.js";
import { shouldHideGroupedTaskContent, useGroupedTaskView } from "@/hooks/useGroupedTaskView.js";
import type { WorkspaceTabState } from "@/store/tabStore.js";
import { buildTaskWorkspaceKey } from "@/lib/taskQueryCache.js";
import { getPathLeaf } from "@/lib/path.js";
import { resolveTaskFileTreeTargetFromTabs } from "@/lib/taskFileTreeTarget.js";
import { toast } from "@/components/ui/toast.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { selectWorkspaceKnorviaState, useKnorviaSessionStore } from "@/store/sessionStore.js";
import { useRemoteWorkspaceSessionStore } from "@/store/remoteWorkspaceSessionStore.js";
import { buildWorkspaceServiceLookup } from "@/lib/workspaceServiceResolver.js";
import { applyTaskQueryCacheMutation } from "@/store/taskQueryCacheStore.js";
import { useRemotePinnedTaskStore } from "@/store/remotePinnedTaskStore.js";
import { useRemoteTimelineTaskStore } from "@/store/remoteTimelineTaskStore.js";
import { bumpTaskListMembershipVersion } from "@/v4/taskListMembershipVersion.js";
import { GroupItem, GroupedTaskItem } from "@/workspace-grouped-tasks/items.js";
import { GroupDragOverlay } from "@/workspace-grouped-tasks/group-drag-overlay.js";
import { VirtualizedGroupedTopLevelList } from "@/workspace-grouped-tasks/virtualized-top-level-list.js";
import { GroupedDraftTaskRow } from "@/workspace-grouped-tasks/draft-task-row.js";
import { StickyGroupHeader } from "@/workspace-grouped-tasks/sticky-group-header.js";
import type { CreateTaskRequest } from "@/app-shell/types.js";
import {
  findTaskInGroupedView,
  filterGroupedViewByTaskKeys,
  replaceTaskInGroupedView,
  taskKey,
} from "@/workspace-grouped-tasks/shared.js";
import { acceptsGroupedDragCollision } from "@/workspace-grouped-tasks/groupedDragProjection.js";
import { GroupedDragSessionOwner, type GroupedDragPorts } from "@/workspace-grouped-tasks/groupedDragSessionOwner.js";
import { GroupedSectionInteractionOwner, type GroupedSectionInteractionPorts } from "@/workspace-grouped-tasks/groupedSectionInteractionOwner.js";
import { GroupedSectionMenuProjection } from "@/workspace-grouped-tasks/groupedSectionMenuProjection.js";
import {
  cancelWorkbenchPointerDrag,
  finishWorkbenchPointerDrag,
  updateWorkbenchPointerDrag,
} from "@/v4/workbenchPointerDragDrop.js";
import {
  createWorkbenchPointerPositionTracker,
} from "@/v4/workbenchPointerPositionTracker.js";

function findNearestScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const canScrollY =
      /(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight;
    if (canScrollY) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

const groupedTaskCollisionDetection: CollisionDetection = (args) => closestCenter({
  ...args,
  droppableContainers: args.droppableContainers.filter((container) =>
    acceptsGroupedDragCollision(args.active.data.current, container.data.current)),
});

type GroupedTaskLayoutRects = Map<
  string,
  {
    height: number;
    left: number;
    top: number;
  }
>;

const GROUPED_TASK_DROP_ANIMATION: DropAnimation = {
  duration: 150,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
};
const GROUPED_TASK_AUTO_SCROLL_THRESHOLD = {
  x: 0.1,
  y: 0.1,
} as const;

function collectGroupedTaskLayoutRects(root: HTMLElement | null): GroupedTaskLayoutRects {
  const rects: GroupedTaskLayoutRects = new Map();
  if (!root) {
    return rects;
  }
  root.querySelectorAll<HTMLElement>("[data-grouped-layout-key]").forEach((element) => {
    const key = element.getAttribute("data-grouped-layout-key");
    if (!key) {
      return;
    }
    const rect = element.getBoundingClientRect();
    rects.set(`layout:${key}`, {
      height: rect.height,
      left: rect.left,
      top: rect.top,
    });
  });
  root.querySelectorAll<HTMLElement>("[data-grouped-task-key]").forEach((element) => {
    const key = element.getAttribute("data-grouped-task-key");
    if (!key) {
      return;
    }
    const rect = element.getBoundingClientRect();
    rects.set(`task:${key}`, {
      height: rect.height,
      left: rect.left,
      top: rect.top,
    });
  });
  return rects;
}

function measureGroupedTaskPreviewWidth(
  root: HTMLElement | null,
  targetTaskKey: string,
): number | null {
  if (!root) {
    return null;
  }
  const targetDomKey = encodeURIComponent(targetTaskKey);
  for (const element of root.querySelectorAll<HTMLElement>("[data-grouped-task-key]")) {
    if (element.getAttribute("data-grouped-task-key") === targetDomKey) {
      return element.getBoundingClientRect().width;
    }
  }
  return null;
}

function measureGroupedGroupPreviewWidth(
  root: HTMLElement | null,
  targetGroupId: string,
): number | null {
  if (!root) {
    return null;
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-grouped-group-item-id]")) {
    if (element.getAttribute("data-grouped-group-item-id") === targetGroupId) {
      return element.getBoundingClientRect().width;
    }
  }
  return null;
}

function resolveStickyGroupedTaskGroupId(root: HTMLElement | null): string | null {
  if (!root) {
    return null;
  }
  const scrollContainer = findNearestScrollableAncestor(root);
  if (!scrollContainer) {
    return null;
  }
  const containerTop = scrollContainer.getBoundingClientRect().top;
  let stickyGroupId: string | null = null;
  for (const element of root.querySelectorAll<HTMLElement>("[data-grouped-group-item-id]")) {
    const groupId = element.getAttribute("data-grouped-group-item-id");
    if (element.getAttribute("data-group-collapsed") === "true") {
      continue;
    }
    const header = groupId
      ? root.querySelector<HTMLElement>(`[data-grouped-group-header-id="${CSS.escape(groupId)}"]`)
      : null;
    if (!groupId || !header) {
      continue;
    }
    const groupRect = element.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const headerHeight = headerRect.height || 32;
    const headerHasScrolledPastTop = headerRect.top < containerTop - 0.5;
    const groupStillCoversTop = groupRect.bottom > containerTop + headerHeight + 0.5;
    if (headerHasScrolledPastTop && groupStillCoversTop) {
      stickyGroupId = groupId;
    }
  }
  return stickyGroupId;
}

function animateGroupedTaskLayoutFrom(
  root: HTMLElement | null,
  previousRects: GroupedTaskLayoutRects,
) {
  if (!root || previousRects.size === 0) {
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const selector = "[data-grouped-layout-key], [data-grouped-task-key]";
  root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    const layoutKey = element.getAttribute("data-grouped-layout-key");
    const taskKeyValue = element.getAttribute("data-grouped-task-key");
    const previousRect = layoutKey
      ? previousRects.get(`layout:${layoutKey}`)
      : taskKeyValue
        ? previousRects.get(`task:${taskKeyValue}`)
        : null;
    if (!previousRect) {
      return;
    }
    const nextRect = element.getBoundingClientRect();
    const deltaX = previousRect.left - nextRect.left;
    const deltaY = previousRect.top - nextRect.top;
    const deltaHeight = previousRect.height - nextRect.height;
    const shouldAnimateHeight = Boolean(layoutKey) && Math.abs(deltaHeight) >= 0.5;
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5 && !shouldAnimateHeight) {
      return;
    }
    element.getAnimations().forEach((animation) => animation.cancel());
    const previousOverflow = element.style.overflow;
    if (shouldAnimateHeight) {
      element.style.overflow = "hidden";
    }
    const animation = element.animate(
      [
        {
          height: shouldAnimateHeight ? `${previousRect.height}px` : undefined,
          transform: `translate(${deltaX}px, ${deltaY}px)`,
        },
        {
          height: shouldAnimateHeight ? `${nextRect.height}px` : undefined,
          transform: "translate(0, 0)",
        },
      ],
      {
        duration: 150,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      },
    );
    animation.addEventListener(
      "finish",
      () => {
        element.style.overflow = previousOverflow;
      },
      { once: true },
    );
    animation.addEventListener(
      "cancel",
      () => {
        element.style.overflow = previousOverflow;
      },
      { once: true },
    );
  });
}

export function WorkspaceGroupedTasksSection({
  workspaceTabs,
  activeWorkspacePath,
  activeWorkspaceIdentity,
  activeTaskId,
  onSelectTask,
  onCreateTask,
  onOpenFileTree,
  onCreateGroupActionChange,
  onCreateDraftTaskActionChange,
  collapsedGroupIds,
  onGroupedTaskGroupIdsChange,
  onCollapsedGroupIdsChange,
  onStickyGroupHeaderChange,
  onOpenAutomations,
}: {
  workspaceTabs: WorkspaceTabState[];
  activeWorkspacePath: string;
  activeWorkspaceIdentity?: string;
  activeTaskId: string | null;
  onSelectTask: (workspacePath: string, taskId: string, workspaceIdentity?: string) => void;
  onCreateTask: (request?: CreateTaskRequest) => void;
  onOpenFileTree?: (target: {
    workspacePath: string;
    workspaceName: string;
    workspaceIdentity?: string;
    workspaceRemoteSessionId?: string;
  }) => void;
  onCreateGroupActionChange?: (action: (() => void) | null) => void;
  onCreateDraftTaskActionChange?: (action: (() => void) | null) => void;
  collapsedGroupIds: ReadonlySet<string>;
  onGroupedTaskGroupIdsChange?: (groupIds: string[]) => void;
  onCollapsedGroupIdsChange: (updater: (currentGroupIds: Set<string>) => Set<string>) => void;
  onStickyGroupHeaderChange?: (node: ReactNode | null) => void;
  /** 闲时系统分组的「+」/右键新建路由到 Automations 主视图。 */
  onOpenAutomations?: () => void;
}) {
  const { intl } = useKnorviaIntl();
  const baseServices = useBaseWorkspaceServices();
  const sessionsById = useRemoteWorkspaceSessionStore((state) => state.sessionsById);
  const sessionIdByWorkspaceIdentity = useRemoteWorkspaceSessionStore(
    (state) => state.sessionIdByWorkspaceIdentity,
  );
  const sessionIdByWorkspacePath = useRemoteWorkspaceSessionStore(
    (state) => state.sessionIdByWorkspacePath,
  );
  const serviceResolverState = useMemo(
    () => ({
      sessionsById,
      sessionIdByWorkspaceIdentity,
      sessionIdByWorkspacePath,
    }),
    [sessionIdByWorkspaceIdentity, sessionIdByWorkspacePath, sessionsById],
  );
  const workspaceServiceLookup = useMemo(
    () => buildWorkspaceServiceLookup(workspaceTabs, baseServices, serviceResolverState),
    [baseServices, serviceResolverState, workspaceTabs],
  );
  const removeTaskState = useKnorviaSessionStore((state) => state.removeTaskState);
  const upsertOptimisticTaskListItem = useKnorviaSessionStore(
    (state) => state.upsertOptimisticTaskListItem,
  );
  const setTaskUnreadIndicator = useKnorviaSessionStore((state) => state.setTaskUnreadIndicator);
  const groupedDraftTask = useKnorviaSessionStore(
    (state) =>
      selectWorkspaceKnorviaState(state, activeWorkspacePath, activeWorkspaceIdentity)
        .groupedDraftTask,
  );
  const groupedDraftFocusVersion = useKnorviaSessionStore(
    (state) =>
      selectWorkspaceKnorviaState(state, activeWorkspacePath, activeWorkspaceIdentity)
        .draftFocusVersion,
  );
  const clearGroupedDraftTask = useKnorviaSessionStore((state) => state.clearGroupedDraftTask);
  const {
    view: authoritativeView,
    scopeSignature,
    setView,
    loading,
    initialized,
    saving,
    createGroup,
    renameGroup,
    updateGroupColor,
    ungroupGroup,
    applyOrder,
  } = useGroupedTaskView({
    workspaceTabs,
  });
  const sectionPortsRef = useRef<GroupedSectionInteractionPorts | null>(null);
  const [section] = useState(() => new GroupedSectionInteractionOwner(() => {
    if (!sectionPortsRef.current) throw new Error("Grouped section ports are inactive");
    return sectionPortsRef.current;
  }));
  const {
    archiving: archivingTaskKeys, renamingTaskKey, renameDraft, newGroupSetupId,
  } = useSyncExternalStore(section.subscribe, section.read, section.read);
  const setRenameDraft = section.setRenameDraft;
  const view = useMemo(
    () => filterGroupedViewByTaskKeys(authoritativeView, archivingTaskKeys),
    [archivingTaskKeys, authoritativeView],
  );

  useEffect(() => {
    section.reconcileArchives(authoritativeView);
  }, [archivingTaskKeys.size, authoritativeView, section]);
  const groupedSectionRootRef = useRef<HTMLDivElement | null>(null);
  // 已经画出过 grouped 列表：之后任何 loading/未初始化帧都不再回到空白门禁。
  // 挂载时若模块级缓存已种出非空 view，本帧就会画出列表，闩锁直接种 true——把「渲染期置位」
  // 的窗口收窄到只剩真正的首屏。
  const hasPaintedGroupedListRef = useRef(view.nodes.length > 0);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [menuProjection] = useState(() => new GroupedSectionMenuProjection());
  const layoutAnimationFrameRef = useRef<number | null>(null);
  const [stickyGroupId, setStickyGroupId] = useState<string | null>(null);
  const dragPortsRef = useRef<GroupedDragPorts | null>(null);
  const [dragSession] = useState(() => new GroupedDragSessionOwner(() => {
    if (!dragPortsRef.current) throw new Error("Grouped drag ports are inactive");
    return dragPortsRef.current;
  }));
  const {
    activeTaskKey: activeDragTaskKey, activeGroupId: activeDragGroupId,
    width: activeDragOverlayWidth,
  } = useSyncExternalStore(dragSession.subscribe, dragSession.read, dragSession.read);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );
  const isGroupedDraftActive = Boolean(groupedDraftTask && activeTaskId === null);
  useLayoutEffect(() => {
    sectionPortsRef.current = {
      authoritative: () => authoritativeView, displayed: () => view,
      draft: () => ({ activeTaskId, activeWorkspacePath, activeWorkspaceIdentity, placement: groupedDraftTask?.placement, view }),
      taskService: (task) => workspaceServiceLookup.get(buildTaskWorkspaceKey(task.workspacePath, task.workspaceIdentity))?.services.taskService,
      setCollapsed: onCollapsedGroupIdsChange,
      createDraft: (placement) => onCreateTask({ groupedDraftPlacement: placement }),
      closeDraft: clearGroupedDraftTask, createGroup, renameGroup,
      colorGroup: updateGroupColor, ungroup: ungroupGroup,
      order: (next, canPublish) => applyOrder(next, { canPublish }),
      commitMetadata: (kind, previous, next, canWriteView) => {
        if (kind === "unread") setTaskUnreadIndicator(previous.workspacePath, previous.taskId, true, previous.workspaceIdentity);
        if (canWriteView()) setView((current) => canWriteView() ? replaceTaskInGroupedView(current, next) : current);
        upsertOptimisticTaskListItem(previous.workspacePath, next, previous.workspaceIdentity);
        applyTaskQueryCacheMutation({ previousTask: previous, nextTask: next,
          previousState: { pinned: false, archived: false }, nextState: { pinned: false, archived: false } });
      },
      commitArchive: (previous, next) => {
        bumpTaskListMembershipVersion();
        removeTaskState(previous.workspacePath, previous.taskId, previous.workspaceIdentity);
        if (previous.workspaceIdentity) {
          useRemoteTimelineTaskStore.getState().removeTask(previous.workspacePath, previous.taskId, previous.workspaceIdentity);
          useRemotePinnedTaskStore.getState().removeTask(previous.workspacePath, previous.taskId, previous.workspaceIdentity);
        }
        applyTaskQueryCacheMutation({ previousTask: previous, nextTask: next,
          previousState: { pinned: false, archived: false }, nextState: { pinned: false, archived: true } });
      },
      notify: (id) => toast(intl.formatMessage({ id })),
    };
    section.reconcileArchiveServices();
  });
  useLayoutEffect(() => section.activate(), [baseServices.taskService, scopeSignature, section]);
  const handleGroupedPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // 必须在 dnd-kit 激活前监听，才能捕获越过 6px 阈值的首个
      // pointermove；快速拖到 Workbench 后立即松手也要使用真实 viewport 坐标。
      dragSession.pointerDown(event.currentTarget.ownerDocument, event.nativeEvent);
    },
    [dragSession],
  );
  const handleCreateTopDraftTask = section.createTopDraft;
  const handleCreateGroupDraftTask = section.createGroupDraft;
  const handleCreateContextualDraftTask = section.createContextualDraft;
  const handleCloseGroupedDraftTask = section.closeDraft;
  useEffect(() => {
    onCreateDraftTaskActionChange?.(handleCreateContextualDraftTask);
    return () => onCreateDraftTaskActionChange?.(null);
  }, [handleCreateContextualDraftTask, onCreateDraftTaskActionChange]);
  useEffect(() => {
    if (groupedDraftTask?.placement.type !== "top") {
      return;
    }
    const rootElement = groupedSectionRootRef.current;
    if (!rootElement) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const scrollContainer = findNearestScrollableAncestor(rootElement);
      // 全局 New task 的草稿创建在 grouped 列表顶部。
      // 用户可能已经滚到下面的 group；这里按入口语义把列表滚动条归零，而不是只保证草稿可见。
      scrollContainer?.scrollTo({ top: 0 });
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [groupedDraftFocusVersion, groupedDraftTask]);
  const { menus: groups, ids: groupIds } = useMemo(() => menuProjection.project(view), [menuProjection, view]);
  useEffect(() => {
    onGroupedTaskGroupIdsChange?.(groupIds);
  }, [groupIds, onGroupedTaskGroupIdsChange]);
  useEffect(() => {
    const rootElement = groupedSectionRootRef.current;
    if (!rootElement || activeDragTaskKey !== null || activeDragGroupId !== null) {
      setStickyGroupId(null);
      return undefined;
    }
    const scrollContainer = findNearestScrollableAncestor(rootElement);
    if (!scrollContainer) {
      setStickyGroupId(null);
      return undefined;
    }
    let animationFrame: number | null = null;
    const updateStickyGroup = () => {
      animationFrame = null;
      setStickyGroupId(resolveStickyGroupedTaskGroupId(rootElement));
    };
    const scheduleUpdate = () => {
      if (animationFrame !== null) {
        return;
      }
      animationFrame = window.requestAnimationFrame(updateStickyGroup);
    };
    updateStickyGroup();
    scrollContainer.addEventListener("scroll", scheduleUpdate, {
      passive: true,
    });
    window.addEventListener("resize", scheduleUpdate);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleUpdate);
    resizeObserver?.observe(rootElement);
    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      scrollContainer.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      resizeObserver?.disconnect();
    };
  }, [
    activeDragGroupId,
    activeDragTaskKey,
    collapsedGroupIds,
    groupedDraftTask?.placement,
    view.nodes,
  ]);
  const workspaceTabByKey = useMemo(
    () =>
      new Map(
        workspaceTabs.map((tab) => [
          buildTaskWorkspaceKey(tab.workspacePath, tab.workspaceIdentity),
          tab,
        ]),
      ),
    [workspaceTabs],
  );

  const getTaskWorkspaceLabel = useCallback(
    (task: KnorviaTaskMeta) => {
      const tab = workspaceTabByKey.get(
        buildTaskWorkspaceKey(task.workspacePath, task.workspaceIdentity),
      );
      if (tab?.workspacePurpose === "conversation") {
        return intl.formatMessage({
          id: "workspaceSidebar.conversationsSection",
        });
      }
      return tab?.label || getPathLeaf(task.workspacePath) || task.workspacePath;
    },
    [intl, workspaceTabByKey],
  );
  const draftWorkspaceLabel = useMemo(() => {
    const tab = workspaceTabByKey.get(
      buildTaskWorkspaceKey(activeWorkspacePath, activeWorkspaceIdentity),
    );
    if (tab?.workspacePurpose === "conversation") {
      return intl.formatMessage({
        id: "workspaceSidebar.conversationsSection",
      });
    }
    return tab?.label || getPathLeaf(activeWorkspacePath) || activeWorkspacePath;
  }, [activeWorkspaceIdentity, activeWorkspacePath, intl, workspaceTabByKey]);

  const getTaskRemoteSessionId = useCallback(
    (task: KnorviaTaskMeta) =>
      workspaceServiceLookup.get(buildTaskWorkspaceKey(task.workspacePath, task.workspaceIdentity))
        ?.remoteSessionId,
    [workspaceServiceLookup],
  );

  const handleOpenTaskFileTree = useCallback(
    (task: KnorviaTaskMeta) => {
      const target = resolveTaskFileTreeTargetFromTabs(task, workspaceTabs);
      if (!onOpenFileTree || !target) {
        return;
      }
      onOpenFileTree(target);
    },
    [onOpenFileTree, workspaceTabs],
  );

  const handleCreateGroup = section.createGroup;
  useEffect(() => {
    onCreateGroupActionChange?.(handleCreateGroup);
    return () => onCreateGroupActionChange?.(null);
  }, [handleCreateGroup, onCreateGroupActionChange]);
  const handleNewGroupSetupStarted = section.acknowledgeSetup;
  const handleToggleGroupCollapsed = section.toggleCollapsed;
  const isGroupCollapsed = useCallback(
    (groupId: string) => collapsedGroupIds.has(groupId),
    [collapsedGroupIds],
  );

  const handleCancelRenameTask = section.cancelRename, handleStartRenameTask = section.startRename;
  const handleMoveTaskToGroup = section.moveToGroup, handleMoveTaskToTop = section.moveToTop;
  const handleSubmitRenameTask = section.submitRename, handleMarkTaskAsUnread = section.markUnread;
  const handleCloseTask = section.archive, handleRenameGroup = section.renameGroup;
  const handleUpdateGroupColor = section.colorGroup, handleUngroupGroup = section.ungroup;

  useEffect(() => {
    return () => {
      if (layoutAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutAnimationFrameRef.current);
      }
    };
  }, []);

  const setViewWithGroupedTaskAnimation = useCallback(
    (nextView: KnorviaGroupedTaskView) => {
      const previousRects = collectGroupedTaskLayoutRects(groupedSectionRootRef.current);
      setView(nextView);
      if (layoutAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutAnimationFrameRef.current);
      }
      layoutAnimationFrameRef.current = window.requestAnimationFrame(() => {
        layoutAnimationFrameRef.current = null;
        animateGroupedTaskLayoutFrom(groupedSectionRootRef.current, previousRects);
      });
    },
    [setView],
  );

  useEffect(() => {
    if (!renamingTaskKey) {
      return;
    }
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingTaskKey]);

  useEffect(() => {
    if (!renamingTaskKey) {
      return;
    }
    section.reconcileRename(view);
  }, [renamingTaskKey, section, view]);

  useLayoutEffect(() => {
    dragPortsRef.current = {
      authoritative: () => authoritativeView,
      collapsed: () => collapsedGroupIds,
      setCollapsed: onCollapsedGroupIdsChange,
      payload: (key) => {
        const task = findTaskInGroupedView(view, key);
        return task ? {
          kind: "knorvia/session", workspacePath: task.workspacePath,
          workspaceIdentity: task.workspaceIdentity,
          remoteSessionId: getTaskRemoteSessionId(task), sessionId: task.taskId,
        } : null;
      },
      // 宽度只在 start 测一次，避免 preview 重排与 dnd-kit 测量形成同步更新循环。
      measure: (kind, key) => kind === "group"
        ? measureGroupedGroupPreviewWidth(groupedSectionRootRef.current, key)
        : measureGroupedTaskPreviewWidth(groupedSectionRootRef.current, key),
      animate: setViewWithGroupedTaskAnimation,
      persist: (next, canPublish) => {
        const sectionAllows = section.permitOrder();
        return applyOrder(next, { canPublish: () => canPublish() && sectionAllows() });
      },
      failed: () => toast(intl.formatMessage({ id: "taskGroup.updateFailed" })),
      track: createWorkbenchPointerPositionTracker,
      updateWorkbench: updateWorkbenchPointerDrag,
      finishWorkbench: finishWorkbenchPointerDrag,
      cancelWorkbench: cancelWorkbenchPointerDrag,
    };
  });
  useLayoutEffect(() => dragSession.activate(), [baseServices.taskService, dragSession, scopeSignature]);
  const handleGroupedTaskDragStart = useCallback((event: Parameters<typeof dragSession.start>[0]) => {
    section.invalidateOrder();
    dragSession.start(event);
  }, [dragSession, section]);
  const handleGroupedTaskDragMove = dragSession.move;
  const handleGroupedTaskDragOver = dragSession.over;
  const handleGroupedTaskDragCancel = dragSession.cancel;
  const handleGroupedTaskDragEnd = dragSession.end;

  const activeDragTask = useMemo(
    () => (activeDragTaskKey ? findTaskInGroupedView(view, activeDragTaskKey) : null),
    [activeDragTaskKey, view],
  );
  const activeDragGroup = useMemo(
    () =>
      activeDragGroupId
        ? view.nodes.find((node) => node.type === "group" && node.group.id === activeDragGroupId)
        : null,
    [activeDragGroupId, view.nodes],
  );

  useEffect(() => {
    const dragging = activeDragTaskKey !== null || activeDragGroupId !== null;
    if (!dragging || typeof document === "undefined") {
      return undefined;
    }
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = previousCursor;
    };
  }, [activeDragTaskKey, activeDragGroupId]);

  const groupedTooltipsDisabled = activeDragTaskKey !== null || activeDragGroupId !== null;
  const stickyGroupNode = useMemo(
    () =>
      stickyGroupId
        ? view.nodes.find((node) => node.type === "group" && node.group.id === stickyGroupId)
        : null,
    [view.nodes, stickyGroupId],
  );
  useEffect(() => {
    if (!onStickyGroupHeaderChange) {
      return undefined;
    }
    if (stickyGroupNode?.type !== "group") {
      onStickyGroupHeaderChange(null);
      return () => onStickyGroupHeaderChange(null);
    }
    onStickyGroupHeaderChange(
      <StickyGroupHeader
        node={stickyGroupNode}
        collapsed={collapsedGroupIds.has(stickyGroupNode.group.id)}
        tooltipsDisabled={groupedTooltipsDisabled}
        onCreateTask={() =>
          stickyGroupNode.group.id === OFF_PEAK_DEFAULT_GROUP_ID
            ? onOpenAutomations?.()
            : handleCreateGroupDraftTask(stickyGroupNode.group.id)
        }
        onToggleCollapsed={handleToggleGroupCollapsed}
        onUpdateGroupColor={handleUpdateGroupColor}
        onUngroupGroup={handleUngroupGroup}
      />,
    );
    return () => onStickyGroupHeaderChange(null);
  }, [
    collapsedGroupIds,
    groupedTooltipsDisabled,
    handleCreateGroupDraftTask,
    onOpenAutomations,
    handleToggleGroupCollapsed,
    handleUngroupGroup,
    handleUpdateGroupColor,
    onStickyGroupHeaderChange,
    stickyGroupNode,
  ]);

  const renderTopLevelNode = useCallback(
    (node: KnorviaGroupedTaskView["nodes"][number]) =>
      node.type === "group" ? (
        <div key={node.group.id} data-grouped-layout-key={`group:${node.group.id}`}>
          <GroupItem
            node={node}
            groups={groups}
            activeWorkspacePath={activeWorkspacePath}
            activeWorkspaceIdentity={activeWorkspaceIdentity}
            activeTaskId={activeTaskId}
            getTaskRemoteSessionId={getTaskRemoteSessionId}
            getTaskWorkspaceLabel={getTaskWorkspaceLabel}
            onSelectTask={onSelectTask}
            onCloseTask={handleCloseTask}
            onOpenFileTree={onOpenFileTree ? handleOpenTaskFileTree : undefined}
            onCreateTask={() =>
              node.group.id === OFF_PEAK_DEFAULT_GROUP_ID
                ? onOpenAutomations?.()
                : handleCreateGroupDraftTask(node.group.id)
            }
            hasDraftTask={
              groupedDraftTask?.placement.type === "group" &&
              groupedDraftTask.placement.groupId === node.group.id
            }
            draftTaskActive={isGroupedDraftActive}
            draftWorkspaceLabel={draftWorkspaceLabel}
            onSelectDraftTask={() => handleCreateGroupDraftTask(node.group.id)}
            onCloseDraftTask={handleCloseGroupedDraftTask}
            onRenameGroup={handleRenameGroup}
            onUpdateGroupColor={handleUpdateGroupColor}
            onUngroupGroup={handleUngroupGroup}
            onMoveTaskToGroup={handleMoveTaskToGroup}
            onMoveTaskToTop={handleMoveTaskToTop}
            onStartRenameTask={handleStartRenameTask}
            onArchiveTask={handleCloseTask}
            onMarkTaskAsUnread={handleMarkTaskAsUnread}
            newGroupSetup={newGroupSetupId === node.group.id}
            onNewGroupSetupStarted={handleNewGroupSetupStarted}
            collapsed={collapsedGroupIds.has(node.group.id)}
            onToggleCollapsed={handleToggleGroupCollapsed}
            activeDragTaskKey={activeDragTaskKey}
            activeDragGroupId={activeDragGroupId}
            tooltipsDisabled={groupedTooltipsDisabled}
          />
        </div>
      ) : (
        <GroupedTaskItem
          key={taskKey(node.task)}
          task={node.task}
          groups={groups}
          remoteSessionId={getTaskRemoteSessionId(node.task)}
          workspaceLabel={getTaskWorkspaceLabel(node.task)}
          activeWorkspacePath={activeWorkspacePath}
          activeWorkspaceIdentity={activeWorkspaceIdentity}
          activeTaskId={activeTaskId}
          onSelectTask={onSelectTask}
          onCloseTask={handleCloseTask}
          onOpenFileTree={onOpenFileTree ? handleOpenTaskFileTree : undefined}
          onMoveTaskToGroup={handleMoveTaskToGroup}
          onMoveTaskToTop={handleMoveTaskToTop}
          onStartRenameTask={handleStartRenameTask}
          onArchiveTask={handleCloseTask}
          onMarkTaskAsUnread={handleMarkTaskAsUnread}
          dragId={taskKey(node.task)}
          dragging={activeDragTaskKey === taskKey(node.task)}
          tooltipsDisabled={groupedTooltipsDisabled}
        />
      ),
    [
      activeTaskId,
      activeWorkspaceIdentity,
      activeWorkspacePath,
      activeDragTaskKey,
      activeDragGroupId,
      groupedTooltipsDisabled,
      collapsedGroupIds,
      draftWorkspaceLabel,
      getTaskRemoteSessionId,
      getTaskWorkspaceLabel,
      groupedDraftTask?.placement,
      groups,
      handleCloseGroupedDraftTask,
      handleCloseTask,
      handleCreateGroupDraftTask,
      onOpenAutomations,
      handleMoveTaskToGroup,
      handleMoveTaskToTop,
      handleNewGroupSetupStarted,
      handleOpenTaskFileTree,
      handleRenameGroup,
      handleToggleGroupCollapsed,
      handleUngroupGroup,
      handleUpdateGroupColor,
      handleMarkTaskAsUnread,
      handleStartRenameTask,
      isGroupedDraftActive,
      newGroupSetupId,
      onOpenFileTree,
      onSelectTask,
    ],
  );

  // 首次权威请求结束前既需要阻止 grouped draft/空态抢先出现，又曾把这个
  // 数据门禁直接渲染成“正在获取任务”；切换到分组时，置顶列表下方因此闪出无帮助的文案。
  // 这里保留 initialized 门禁但隐藏主体，数据就绪后再一次性展示权威列表。
  // 门禁只该拦首屏。之前每次会话流式节点都可能让它回关，
  // grouped 整棵子树随之卸载再重挂载——这就是「左侧分组列表整块闪一下」。
  // 画过一次列表后一律继续渲染，旧数据优于空白。
  if (
    shouldHideGroupedTaskContent({
      initialized,
      loading,
      hasNodes: view.nodes.length > 0,
      hasPaintedOnce: hasPaintedGroupedListRef.current,
    })
  ) {
    return null;
  }
  if (view.nodes.length > 0) {
    // 渲染期写 ref 的前提（禁止照搬到非单调状态）：本 ref 是单调闩锁（false→true，永不回落），
    // 新值只由本次渲染的 view 内容推导。concurrent 下被丢弃的渲染也会执行这次赋值，最坏结果是
    // 门禁提前开门一帧、显示空态文案而不是隐藏；对可回落状态用同样写法则会产生不可复现的漏帧。
    hasPaintedGroupedListRef.current = true;
  }
  const dragOverlayWidthStyle = activeDragOverlayWidth
    ? { width: `${activeDragOverlayWidth}px` }
    : undefined;
  const dragOverlayWidthClassName =
    "transition-[width,max-width] duration-150 ease-out motion-reduce:transition-none";

  const groupedTaskDragOverlay = (
    <DragOverlay dropAnimation={GROUPED_TASK_DROP_ANIMATION}>
      {activeDragTask ? (
        <div className={dragOverlayWidthClassName} style={dragOverlayWidthStyle}>
          <GroupedTaskItem
            task={activeDragTask}
            groups={groups}
            remoteSessionId={getTaskRemoteSessionId(activeDragTask)}
            workspaceLabel={getTaskWorkspaceLabel(activeDragTask)}
            activeWorkspacePath={activeWorkspacePath}
            activeWorkspaceIdentity={activeWorkspaceIdentity}
            activeTaskId={activeTaskId}
            onSelectTask={onSelectTask}
            onCloseTask={handleCloseTask}
            onOpenFileTree={onOpenFileTree ? handleOpenTaskFileTree : undefined}
            onMoveTaskToGroup={handleMoveTaskToGroup}
            onMoveTaskToTop={handleMoveTaskToTop}
            onStartRenameTask={handleStartRenameTask}
            onArchiveTask={handleCloseTask}
            onMarkTaskAsUnread={handleMarkTaskAsUnread}
            dragId={activeDragTaskKey ?? undefined}
            dragOverlay
          />
        </div>
      ) : activeDragGroup?.type === "group" ? (
        <GroupDragOverlay
          node={activeDragGroup}
          className={dragOverlayWidthClassName}
          style={dragOverlayWidthStyle}
        />
      ) : null}
    </DragOverlay>
  );

  return (
    <>
      <TaskRenameDialog
        open={renamingTaskKey !== null}
        value={renameDraft}
        inputRef={renameInputRef}
        intl={intl}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelRenameTask();
          }
        }}
        onChange={setRenameDraft}
        onCancel={handleCancelRenameTask}
        onConfirm={() => {
          void handleSubmitRenameTask();
        }}
      />
      <DndContext
        sensors={sensors}
        autoScroll={{ threshold: GROUPED_TASK_AUTO_SCROLL_THRESHOLD }}
        collisionDetection={groupedTaskCollisionDetection}
        onDragStart={handleGroupedTaskDragStart}
        onDragMove={handleGroupedTaskDragMove}
        onDragOver={handleGroupedTaskDragOver}
        onDragEnd={handleGroupedTaskDragEnd}
        onDragCancel={handleGroupedTaskDragCancel}
      >
        <div
          ref={groupedSectionRootRef}
          onPointerDownCapture={handleGroupedPointerDownCapture}
          className={cn("pb-4", saving && "opacity-90")}
        >
          {groupedDraftTask?.placement.type === "top" ? (
            <GroupedDraftTaskRow
              active={isGroupedDraftActive}
              workspaceLabel={draftWorkspaceLabel}
              onSelect={handleCreateTopDraftTask}
              onClose={handleCloseGroupedDraftTask}
            />
          ) : null}
          <VirtualizedGroupedTopLevelList
            nodes={view.nodes}
            isGroupCollapsed={isGroupCollapsed}
            renderNode={renderTopLevelNode}
          />
          {view.nodes.length === 0 && !groupedDraftTask && !loading ? (
            <div className="px-3 py-2 text-ui-base text-foreground-subtle">
              {intl.formatMessage({ id: "taskList.noTasks" })}
            </div>
          ) : null}
        </div>
        {/* overlay 是鼠标浮层，挂到 body，避免被 grouped task 滚动容器的滚动条/裁剪上下文影响。 */}
        {typeof document === "undefined"
          ? groupedTaskDragOverlay
          : createPortal(groupedTaskDragOverlay, document.body)}
      </DndContext>
    </>
  );
}
