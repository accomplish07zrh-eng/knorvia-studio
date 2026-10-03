/* eslint-disable max-lines -- Grouped 视图 hook 集中维护 optimistic overlay、排序保存和 ungroup 持久化，拆开会让同一份 view 状态在多个 hook 间漂移。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import type {
  KnorviaGroupedTaskView,
  KnorviaGroupedTaskViewStructure,
  KnorviaTaskGroup,
  KnorviaTaskGroupColor,
} from "@knorvia/services";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useLocalWorkspaceScopes } from "@/hooks/useLocalWorkspaceScopes.js";
import type { WorkspaceTabState } from "@/store/tabStore.js";
import { logger } from "@/logger.js";
import { buildGroupedTaskViewFromSessions } from "@/lib/buildGroupedTaskViewFromSessions.js";
import { fetchTaskListMembershipSets } from "@/lib/taskListMembershipSets.js";
import { useTaskListMembershipVersion } from "@/v4/taskListMembershipVersion.js";
import { useGlobalTaskList } from "@/hooks/useGlobalTaskList.js";
import { selectWorkspaceKnorviaState, useKnorviaSessionStore } from "@/store/sessionStore.js";
import { buildTaskWorkspaceKey } from "@/lib/taskQueryCache.js";
import {
  useWorkspaceTaskOptimisticOverlayByWorkspaceKey,
} from "@/hooks/workspaceTaskListOptimisticOverlay.js";
import { areStabilizedValuesEquivalent } from "@/v4/taskListItemStabilization.js";
import {
  GroupedRemoteDataSingleFlight, readCachedGroupedView, writeCachedGroupedView,
} from "@/workspace-grouped-tasks/groupedRemoteDataCache.js";
import { GroupedTaskViewRefreshOwner } from "@/workspace-grouped-tasks/groupedRefreshOwner.js";
import {
  mergeGroupedTaskViewWithOptimistic, reconcileGroupedOptimisticTaskKeys,
} from "@/workspace-grouped-tasks/groupedOptimisticProjection.js";
import { GroupedTaskMutationOwner } from "@/workspace-grouped-tasks/groupedMutationOwner.js";
import { GroupedPromotionPersistenceOwner, planGroupedPromotions } from "@/workspace-grouped-tasks/groupedPromotionPersistence.js";

function buildWorkspaceScopes(workspaceTabs: WorkspaceTabState[]) {
  return workspaceTabs.map((tab) => ({
    workspacePath: tab.workspacePath,
    workspaceIdentity: tab.workspaceIdentity,
    workspacePurpose: tab.workspacePurpose,
  }));
}

export function shouldHideGroupedTaskContent(params: {
  initialized: boolean;
  loading: boolean;
  hasNodes: boolean;
  /**
   * 门禁只该拦首屏。已经画出过列表之后再回到隐藏态，就是用户看到的
   * 「grouped 整块闪一下」——祖先重挂载和后台刷新都会走到这里。
   * 画过一次之后一律继续渲染上一份列表：旧数据优于空白。
   */
  hasPaintedOnce?: boolean;
}): boolean {
  if (params.hasPaintedOnce) {
    return false;
  }
  return !params.initialized || (params.loading && !params.hasNodes);
}

function isGroupedTaskViewInitialized(params: {
  remoteDataInitialized: boolean;
  hydratingEndpointKeys: readonly string[];
  /**
   * 这个门禁只负责首屏。以前它直接读当前的 hydrating 状态，运行中任务每输出一次 tool
   * 结果都会让 Controller 列表重查一轮（loading=true），门禁随之关门、grouped 主体整棵卸载再
   * 重挂载——表现为左侧分组列表抖动。就绪一次之后永久保持就绪，后台刷新不再回到首屏态。
   */
  previouslyInitialized?: boolean;
}): boolean {
  if (params.previouslyInitialized) {
    return true;
  }
  return params.remoteDataInitialized && params.hydratingEndpointKeys.length === 0;
}

function groupedNodeIdentityKey(node: KnorviaGroupedTaskView["nodes"][number]): string {
  if (node.type === "group") {
    return `group:${node.group.id}`;
  }
  return `task:${buildTaskWorkspaceKey(node.task.workspacePath, node.task.workspaceIdentity)}:${node.task.taskId}`;
}

function areGroupedNodesEquivalent(
  previous: KnorviaGroupedTaskView["nodes"][number],
  next: KnorviaGroupedTaskView["nodes"][number],
): boolean {
  if (previous.type !== next.type || previous.sortOrder !== next.sortOrder) {
    return false;
  }
  if (previous.type === "group" && next.type === "group") {
    // 用结构比较而非 JSON.stringify：group meta 经 IPC/join 重建后 key 顺序不保证稳定，
    // 字符串比较会让等价判断恒为 false，节点稳定化静默退化成每帧全新引用。
    if (!areStabilizedValuesEquivalent(previous.group, next.group)) {
      return false;
    }
    // 任务对象来自 sessions-index 聚合层（引用已稳定化）+ joinTaskListUnreadAt（未变则保引用），
    // 引用逐位相同即内容等价。
    return (
      previous.tasks.length === next.tasks.length &&
      next.tasks.every((task, index) => task === previous.tasks[index])
    );
  }
  return previous.type === "task" && next.type === "task" && previous.task === next.task;
}

/**
 * grouped refresh 每轮都重建整棵视图对象树，即使内容没变（或只变了一条），
 * 所有 group/task 行都会拿到新引用整体重渲染——表现为侧栏分组列表"重新加载"。
 * 这里做节点级引用稳定化：等价节点复用旧对象；整树等价时返回旧视图（setState 同引用直接 bail）。
 */
function stabilizeGroupedView(
  previous: KnorviaGroupedTaskView,
  next: KnorviaGroupedTaskView,
): KnorviaGroupedTaskView {
  if (previous.nodes.length === 0) {
    return next;
  }
  const previousByKey = new Map(previous.nodes.map((node) => [groupedNodeIdentityKey(node), node]));
  let identical = previous.nodes.length === next.nodes.length;
  const nodes = next.nodes.map((node, index) => {
    const previousNode = previousByKey.get(groupedNodeIdentityKey(node));
    if (previousNode && areGroupedNodesEquivalent(previousNode, node)) {
      if (identical && previous.nodes[index] !== previousNode) {
        identical = false;
      }
      return previousNode;
    }
    identical = false;
    return node;
  });
  return identical ? previous : { nodes };
}

export function useGroupedTaskView(params: { workspaceTabs: WorkspaceTabState[] }) {
  const services = useBaseWorkspaceServices();
  // grouped 仍是本地 workspace-only，但 task facts 也必须来自窗口 Controller，不能在
  // Renderer 另起 sessions-index join。分组结构/顺序继续走本地 task service，避免能力扩张。
  const localWorkspaceTabs = useLocalWorkspaceScopes({
    workspaceTabs: params.workspaceTabs,
  });
  // scopes 过去 memo 在 tabs 数组身份上。父级重建同值数组就会换掉 refresh 身份，
  // 让「refresh 变化即刷新」的 effect 再跑一轮 setState，进而触发下一次渲染——自激刷新环，
  // 每帧都在发 RPC 并让门禁/空态有机会闪。这里改成值签名，和 useGlobalTaskList 保持一致。
  const localWorkspaceScopeSignature = JSON.stringify(
    localWorkspaceTabs
      .map(
        (tab) =>
          [
            buildTaskWorkspaceKey(tab.workspacePath, tab.workspaceIdentity),
            tab.workspacePath,
            tab.workspaceIdentity ?? null,
            tab.workspacePurpose ?? null,
          ] as const,
      )
      .sort(
        (
          [leftKey, leftPath, leftIdentity, leftPurpose],
          [rightKey, rightPath, rightIdentity, rightPurpose],
        ) =>
          // 逐级 tie-break：只按 workspaceKey 排序时，同 key 不同 purpose 的两个 tab 比较结果为 0，
          // 稳定排序保留输入顺序——tabs 数组里互换位置就会换出新签名并触发一次多余 refresh。
          String(leftKey).localeCompare(String(rightKey)) ||
          String(leftPath).localeCompare(String(rightPath)) ||
          String(leftIdentity ?? "").localeCompare(String(rightIdentity ?? "")) ||
          String(leftPurpose ?? "").localeCompare(String(rightPurpose ?? "")),
      ),
  );
  const scopes = useMemo(
    () => buildWorkspaceScopes(localWorkspaceTabs),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 值签名等价即复用，避免父级数组换身份触发刷新环。
    [localWorkspaceScopeSignature],
  );
  const sessionsIndexScopes = useMemo(
    () =>
      scopes.map((scope) => ({
        workspacePath: scope.workspacePath,
        ...(scope.workspaceIdentity ? { workspaceIdentity: scope.workspaceIdentity } : {}),
      })),
    [scopes],
  );
  const [view, setView] = useState<KnorviaGroupedTaskView>(
    () => readCachedGroupedView(localWorkspaceScopeSignature) ?? { nodes: [] },
  );
  const viewRef = useRef(view);
  viewRef.current = view;
  const [loading, setLoading] = useState(false);
  const [remoteDataInitialized, setRemoteDataInitialized] = useState(
    () => readCachedGroupedView(localWorkspaceScopeSignature) !== undefined,
  );
  const [saving, setSaving] = useState(false);
  const taskListVersionSignature = useKnorviaSessionStore((state) =>
    JSON.stringify(
      params.workspaceTabs.map((tab) => {
        const workspaceKey = buildTaskWorkspaceKey(tab.workspacePath, tab.workspaceIdentity);
        const workspaceState = selectWorkspaceKnorviaState(
          state,
          tab.workspacePath,
          tab.workspaceIdentity,
        );
        return [workspaceKey, workspaceState.taskListVersion] as const;
      }),
    ),
  );
  const controllerTaskFacts = useGlobalTaskList({
    kind: "active",
    workspaceTabs: localWorkspaceTabs,
    sortBy: "updated",
    searchQuery: "",
    expanded: true,
    collapsedLimit: 1,
  });
  const sessionsIndexItems = controllerTaskFacts.items;
  // 缓存命中即视为已初始化：重挂载后 Controller 列表会重新进入 loading，若不把闩锁一起
  // 从缓存种下，第一帧仍会关门闪一下。
  const initializedLatchRef = useRef(
    readCachedGroupedView(localWorkspaceScopeSignature) !== undefined,
  );
  const initialized = isGroupedTaskViewInitialized({
    remoteDataInitialized,
    hydratingEndpointKeys: controllerTaskFacts.loading ? ["window-controller"] : [],
    previouslyInitialized: initializedLatchRef.current,
  });
  // 渲染期写 ref 的前提（禁止照搬到非单调状态）：本 ref 是单调闩锁（false→true，永不回落），
  // 且新值完全由本次渲染的输入推导。React 18 concurrent 下被丢弃的渲染同样会执行这次赋值，
  // 但对单调闩锁而言「提前置位」等价于「提前就绪」，只会让门禁更早开门，不会产生错误状态。
  // 换成任何可回落 / 依赖提交顺序的状态，这个写法就会漏帧且不可复现——那种状态必须用 effect。
  initializedLatchRef.current = initialized;
  const sessionsIndexItemsRef = useRef(sessionsIndexItems);
  sessionsIndexItemsRef.current = sessionsIndexItems;
  // pin/archive 归属版本：mutation 后 bump，grouped 视图（非 pinned 非 archived）随之权威 re-filter。
  const membershipVersion = useTaskListMembershipVersion();
  const optimisticTaskOverlayByWorkspaceKey = useWorkspaceTaskOptimisticOverlayByWorkspaceKey(
    params.workspaceTabs,
  );
  const clearPromotedGroupedDraftTask = useKnorviaSessionStore(
    (state) => state.clearPromotedGroupedDraftTask,
  );
  const visibleMissingTaskKeysRef = useRef<Set<string>>(new Set());
  const displayedViewRef = useRef<KnorviaGroupedTaskView>({ nodes: [] });
  const displayedView = useMemo(() => {
    const optimisticOverlays = [...optimisticTaskOverlayByWorkspaceKey.values()];
    const visibleMissingTaskKeys = reconcileGroupedOptimisticTaskKeys({
      view,
      optimisticOverlays,
      previousVisibleMissingTaskKeys: visibleMissingTaskKeysRef.current,
    });
    visibleMissingTaskKeysRef.current = visibleMissingTaskKeys;
    // overlay 帧（运行中任务的 optimistic meta 回写）会绕过 view 的节点稳定化，
    // 每次都产出新的 group/task 节点对象，让侧栏整棵列表重渲染并重测量虚拟器。
    // 展示视图再过一遍同一套节点级稳定化，等价时连数组身份都保持不变。
    const nextDisplayedView = stabilizeGroupedView(
      displayedViewRef.current,
      mergeGroupedTaskViewWithOptimistic({
        view,
        optimisticOverlays,
        visibleMissingTaskKeys,
      }),
    );
    displayedViewRef.current = nextDisplayedView;
    return nextDisplayedView;
  }, [optimisticTaskOverlayByWorkspaceKey, view]);

  // 差量更新：grouped structure（分组/排序）与 membership（pin/archive/unread）都不随
  // sessions-index 内容帧（title/status）变化。按「membershipVersion + 结构版本 + scope 签名」
  // 缓存，内容帧触发的 refresh 只做内存 join，不发 RPC。分组 mutation 路径显式失效。
  const [remoteDataLoader] = useState(
    () =>
      new GroupedRemoteDataSingleFlight<{
        structure: KnorviaGroupedTaskViewStructure;
        membership: Awaited<ReturnType<typeof fetchTaskListMembershipSets>>;
      }>(),
  );
  const invalidateRemoteData = useCallback(() => {
    remoteDataLoader.invalidate();
  }, [remoteDataLoader]);

  const [refreshOwner] = useState(() => new GroupedTaskViewRefreshOwner());
  const refresh = useCallback((canPublish?: () => boolean) => {
    const remoteDataKey = [membershipVersion, taskListVersionSignature,
      scopes.map((scope) => buildTaskWorkspaceKey(scope.workspacePath, scope.workspaceIdentity)).join("|"),
    ].join("::");
    return refreshOwner.run({
      hasNodes: () => viewRef.current.nodes.length > 0,
      setLoading,
      initialize: () => setRemoteDataInitialized(true),
      onError: (error) => logger.error("[useGroupedTaskView] 加载 grouped task 视图失败", error),
      load: () => remoteDataLoader.load(remoteDataKey, async () => {
        const [structure, membership] = await Promise.all([
          services.taskService.listGroupedTaskViewStructure({ workspaceScopes: scopes }),
          fetchTaskListMembershipSets({ service: services.taskService, scopes: sessionsIndexScopes }),
        ]);
        return { structure, membership };
      }),
      isCurrent: (remoteData) => (canPublish?.() ?? true) && remoteDataLoader.isCurrent(remoteDataKey, remoteData),
      accept: ({ structure, membership }) => {
        const nextView = buildGroupedTaskViewFromSessions({
          structure, taskIndexItems: membership.taskIndexItems, sessions: sessionsIndexItemsRef.current,
          pinnedIds: membership.pinnedIds, archivedIds: membership.archivedIds, deletedIds: membership.deletedIds,
        });
        const stabilizedView = stabilizeGroupedView(viewRef.current, nextView);
        writeCachedGroupedView(localWorkspaceScopeSignature, stabilizedView);
        setView(stabilizedView);
      },
    });
  }, [localWorkspaceScopeSignature, membershipVersion, refreshOwner, remoteDataLoader,
    scopes, sessionsIndexScopes, services.taskService, taskListVersionSignature]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const [mutationOwner] = useState(() => new GroupedTaskMutationOwner({
    setView, setSaving, invalidate: () => remoteDataLoader.invalidate(),
    refreshCurrent: (canPublish) => refreshRef.current(canPublish),
    log: (message, error) => logger.error(message, error),
  }));

  const clearPromotedRef = useRef(clearPromotedGroupedDraftTask);
  clearPromotedRef.current = clearPromotedGroupedDraftTask;
  const [promotionOwner] = useState(() => new GroupedPromotionPersistenceOwner({
    clear: (path, taskId, identity) => clearPromotedRef.current(path, taskId, identity),
    invalidate: () => remoteDataLoader.invalidate(), refreshCurrent: () => refreshRef.current(),
    log: (message, error) => logger.error(message, error),
  }));

  useEffect(() => {
    const deactivate = refreshOwner.activate();
    const deactivateMutation = mutationOwner.activate();
    const deactivatePromotion = promotionOwner.activate();
    return () => {
      deactivatePromotion();
      deactivateMutation();
      deactivate();
      remoteDataLoader.invalidate();
    };
  }, [localWorkspaceScopeSignature, mutationOwner, promotionOwner, refreshOwner, remoteDataLoader, services.taskService]);

  useEffect(() => {
    promotionOwner.reconcile(planGroupedPromotions({
      view, displayedView, overlays: optimisticTaskOverlayByWorkspaceKey.values(),
      visibleMissing: visibleMissingTaskKeysRef.current,
    }), displayedView, services.taskService);
  }, [clearPromotedGroupedDraftTask, displayedView, optimisticTaskOverlayByWorkspaceKey, promotionOwner, services.taskService, view]);

  useEffect(() => {
    const disposables = scopes.map((scope) =>
      services.taskService.onDynamicWorkspaceEvent(scope)((event) => {
        if (event.type !== "workspace_task_list_changed" || event.reason !== "task_created") {
          return;
        }
        // sessions-index 可见帧可能早于 SQLite grouped sort_order 写入。
        // task_created 是首次排序已经提交的边界，必须丢弃旧 structure 缓存并重拉；
        // 否则运行中会按缺序节点补到末尾，只有重启重建缓存后才恢复。
        invalidateRemoteData();
        void refreshRef.current();
      }),
    );
    return () => disposables.forEach((disposable) => disposable.dispose());
  }, [invalidateRemoteData, scopes, services.taskService]);

  // 唯一的自动刷新入口。refresh 身份已经包含 membership/structure/scope 版本，
  // sessions-index 内容变化再触发内存 join；避免 mount effect 与 index effect 首帧重复发起请求。
  useEffect(() => {
    void refresh();
  }, [refresh, sessionsIndexItems]);

  const createGroup = useCallback((): Promise<KnorviaTaskGroup> =>
    mutationOwner.create(services.taskService, refresh), [mutationOwner, refresh, services.taskService]);
  const renameGroup = useCallback((groupId: string, title: string) =>
    mutationOwner.edit(view, groupId, { title }, services.taskService), [mutationOwner, services.taskService, view]);
  const updateGroupColor = useCallback((groupId: string, color: KnorviaTaskGroupColor) =>
    mutationOwner.edit(view, groupId, { color }, services.taskService), [mutationOwner, services.taskService, view]);
  const applyOrder = useCallback((nextView: KnorviaGroupedTaskView, options?: { canPublish?: () => boolean }) =>
    mutationOwner.order(view, nextView, services.taskService, refresh, options?.canPublish), [mutationOwner, refresh, services.taskService, view]);
  const ungroupGroup = useCallback((groupId: string) =>
    mutationOwner.ungroup(view, groupId, services.taskService, refresh), [mutationOwner, refresh, services.taskService, view]);

  return {
    scopeSignature: localWorkspaceScopeSignature,
    view: displayedView,
    setView,
    loading,
    initialized,
    saving,
    refresh,
    createGroup,
    renameGroup,
    updateGroupColor,
    ungroupGroup,
    applyOrder,
  };
}
