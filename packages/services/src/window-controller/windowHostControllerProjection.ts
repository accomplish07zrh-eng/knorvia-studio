/* eslint-disable max-lines -- 投影状态、V4 帧与离线替换属于同一个一致性边界。 */
// 窗口宿主 Controller 的列表投影。
//
// 设计取舍：
//   · 投影不保存「行」，只保存来源事实（tasks-index 成员关系 + sessions-index overlay）；
//     行永远由事实派生，因此不存在「行与事实不一致」的中间态。
//   · 每次事实变化后把派生的行集与上一次广播出去的行集比对，差异落在一个 delta 帧里。
//     换 source 时旧行消失与新行出现因此天然同帧，订阅者看不到「两边都没有」的空档。
//   · 投影只读：写操作按地址路由回 source 注册时注入的 mutate，投影自身不是写入路径。
//   · 两个 Controller topic 各自是一条 channel（独立订阅者表与 seq/logEpoch 水位），
//     帧的构造与扇出只在 channel 里写一次，topic 之间的差别只在 payload 判别式。

import { isDeepStrictEqual } from "node:util";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import {
  CONTROLLER_TASKS_INDEX_TOPIC,
  CONTROLLER_WORKSPACES_TOPIC,
  type ControllerSubscribeResult,
  type WindowHostControllerTaskDelta,
  type WindowHostControllerTaskFrame,
  type WindowHostControllerTaskRow,
  type WindowHostControllerTopic,
  type WindowHostControllerWorkspaceDelta,
  type WindowHostControllerWorkspaceFact,
  type WindowHostControllerWorkspaceFrame,
  type WindowHostTaskAddress,
} from "@knorvia/shared/protocol-v4";
import type { KnorviaArchivedTaskDeletionResult } from "../session/taskService.js";

/** 复合键分隔符：避免路径与 id 里的普通字符拼出碰撞的键。 */
const KEY_SEPARATOR = "\u0000";

/** 一个 source 的寻址范围：本地按 workspace，远程额外带 session。 */
export type WindowHostControllerSourceScope =
  | {
      kind: "local";
      workspacePath: string;
      workspaceIdentity?: string;
    }
  | {
      kind: "remote";
      remoteSessionId: string;
      workspacePath: string;
      workspaceIdentity: string;
    };

/**
 * sessions-index 下发的实时事实。
 *
 * 只携带「当前运行态」，不参与持久化：任务行存在与否仍由 tasks-index 成员关系决定，
 * overlay 仅覆盖标题、活跃时间、阻塞交互与运行状态这些会随时变化的字段。
 */
export interface WindowHostControllerSessionOverlay {
  taskId: string;
  liveStatus: WindowHostControllerTaskRow["liveStatus"];
  title?: string;
  titleSource?: "default" | "generated" | "custom";
  updatedAt?: number;
  pendingInteraction?: KnorviaTaskMeta["pendingInteraction"];
  activity?: NonNullable<WindowHostControllerTaskRow["activity"]>;
}

export type WindowHostControllerMutation =
  | { kind: "pin"; pinned: boolean }
  | { kind: "archive"; archived: boolean }
  | { kind: "delete" }
  | { kind: "delete-archived" }
  | { kind: "delete-archived-batch"; taskIds: string[] }
  | { kind: "mark-read"; expectedUnreadAt?: number }
  | { kind: "mark-unread" }
  | { kind: "open" }
  | { kind: "resume" };

export type WindowHostControllerMutationResult = void | boolean | KnorviaArchivedTaskDeletionResult;

/** tasks-index 的一条成员关系记录：任务本身 + 它在列表里的归属。 */
interface TaskIndexRecord {
  meta: KnorviaTaskMeta;
  membership: {
    pinned: boolean;
    archived: boolean;
    active: boolean;
  };
  searchSnippets?: string[];
}

/** 写操作转发句柄：由 source 的持有者提供，投影只负责寻址。 */
type MutationRouter = (
  address: WindowHostTaskAddress,
  mutation: WindowHostControllerMutation,
) => Promise<WindowHostControllerMutationResult> | WindowHostControllerMutationResult;

/**
 * source 的寻址与写路由。
 *
 * 二者一一对应（同一 scope 的写必须回到同一 owner），所以放在一起而不是并列两个字段，
 * 避免出现「登记了新 scope、却仍指向旧 router」的组合。
 */
interface SourceTarget {
  scope: WindowHostControllerSourceScope;
  route: MutationRouter;
}

/** 一个 source 的全部可变量；行不在这里，行是它的派生结果。 */
interface SourceFacts {
  target: SourceTarget;
  /**
   * 连接态是唯一真源：sourceAvailability 由它派生。
   *
   * 两者若各存一份，就可能出现「offline 但 connectionState=online」这种 workspace fact
   * 的 superRefine 会拒绝的组合（offline 必须是 disconnected 或 failed）。
   */
  connectionState: WindowHostControllerWorkspaceFact["connectionState"];
  /** 是否已对外公布过：仅登记、尚未拿到首个快照的 source 不出现在 workspace 事实里。 */
  announced: boolean;
  entries: Map<string, TaskIndexRecord>;
  overlays: Map<string, WindowHostControllerSessionOverlay>;
}

/** 只有 connecting/online 算在线；其余连接态一律视为离线。 */
function availabilityOf(
  state: WindowHostControllerWorkspaceFact["connectionState"],
): WindowHostControllerWorkspaceFact["sourceAvailability"] {
  return state === "connecting" || state === "online" ? "online" : "offline";
}

type ControllerFrame = WindowHostControllerTaskFrame | WindowHostControllerWorkspaceFrame;

type SubscriberSink = (frame: ControllerFrame) => void;

interface SourceRegistration {
  scope: WindowHostControllerSourceScope;
  mutate: MutationRouter;
}

interface SnapshotRequest {
  scope: WindowHostControllerSourceScope;
  taskIndex: TaskIndexRecord[];
  sessionsIndex: WindowHostControllerSessionOverlay[];
  replacesScope?: WindowHostControllerSourceScope;
}

interface SubscriptionRequest {
  topic: WindowHostControllerTopic;
  onFrame: SubscriberSink;
}

/** subscribe 的返回值：ack 既平铺也挂在 ack 字段上，dispose 用于释放订阅。 */
type SubscriptionHandle = ControllerSubscribeResult["ack"] & {
  ack: ControllerSubscribeResult["ack"];
  dispose(): void;
};

/** 帧信封里除 topic/subscriptionId/payload 之外的字段。 */
interface FrameEnvelope {
  logEpoch: string;
  fromSeq: number;
  toSeq: number;
  sentAt: number;
}

/**
 * 一条 topic channel：自己的订阅者表与水位。
 *
 * 泛型参数把「这条 channel 只能发这种 frame」写进类型，避免把 task delta 发到
 * workspace topic 上。payload 的构造仍由调用方给出，因为两个 topic 的判别式不同。
 */
interface TopicChannel<Frame extends ControllerFrame> {
  topic: Frame["topic"];
  listeners: Map<string, SubscriberSink>;
  watermark: { logEpoch: string; seq: number };
}

/** 组内身份口径与全仓一致：有 identity 用 identity，否则退回路径。 */
function workspaceKeyOf(scope: { workspacePath: string; workspaceIdentity?: string }): string {
  return scope.workspaceIdentity?.trim() || scope.workspacePath;
}

/** source 身份键：kind + 远程 session（本地为空）+ workspace 身份。 */
function sourceKeyOf(kind: string, discriminator: string, workspaceKey: string): string {
  return [kind, discriminator, workspaceKey].join(KEY_SEPARATOR);
}

function scopeKey(scope: WindowHostControllerSourceScope): string {
  const discriminator = scope.kind === "remote" ? scope.remoteSessionId : "";
  return sourceKeyOf(scope.kind, discriminator, workspaceKeyOf(scope));
}

/** 由 address 反推 source 键：remoteSessionId 决定它属于哪个远程 source。 */
function addressKey(address: WindowHostTaskAddress): string {
  return sourceKeyOf(
    address.remoteSessionId === undefined ? "local" : "remote",
    address.remoteSessionId ?? "",
    workspaceKeyOf(address),
  );
}

/**
 * scope 的寻址字段。
 *
 * 可缺省字段必须「缺席」而不是「值为 undefined」：Controller 的 address/fact schema 都是
 * strict，而窗口级 mutation 的地址还会被 UI 深比较，多一个 undefined 键就会让两端不相等。
 * address、workspace fact、workspace removal 的寻址部分完全一致，只在这里写一次。
 */
function scopeFields(scope: WindowHostControllerSourceScope) {
  const { workspacePath, workspaceIdentity } = scope;
  const identity = workspaceIdentity === undefined ? {} : { workspaceIdentity };
  return scope.kind === "remote"
    ? { remoteSessionId: scope.remoteSessionId, workspacePath, ...identity }
    : { workspacePath, ...identity };
}

function addressOf(scope: WindowHostControllerSourceScope, taskId: string): WindowHostTaskAddress {
  return { ...scopeFields(scope), taskId };
}

function workspaceFactOf(source: SourceFacts): WindowHostControllerWorkspaceFact {
  return {
    ...scopeFields(source.target.scope),
    sourceAvailability: availabilityOf(source.connectionState),
    connectionState: source.connectionState,
  };
}

/**
 * workspace.removed 的载荷：只保留寻址字段，丢弃 sourceAvailability / connectionState。
 * 从已公布的事实里摘字段，因此 remote source 的 remoteSessionId 不会丢。
 */
function workspaceRemovalOf(
  fact: WindowHostControllerWorkspaceFact,
): WindowHostControllerWorkspaceDelta {
  const { remoteSessionId, workspacePath, workspaceIdentity } = fact;
  return {
    op: "workspace.removed",
    ...(remoteSessionId === undefined ? {} : { remoteSessionId }),
    workspacePath,
    ...(workspaceIdentity === undefined ? {} : { workspaceIdentity }),
  };
}

/**
 * 持久化状态到运行态的降级映射。
 *
 * 只认「已完成 / 失败」两个终态：meta.status 里的 running 是上次落盘的残留，
 * 不能当作当前仍在运行的证据，否则断连后会一直显示运行中。
 */
function persistedLiveStatus(meta: KnorviaTaskMeta): WindowHostControllerTaskRow["liveStatus"] {
  const status = meta.status;
  return status === "completed" || status === "error" ? status : "idle";
}

/** 成员关系的 meta 必须与 source 寻址一致，否则行 schema 的 identity 校验不成立。 */
function alignedMeta(
  meta: KnorviaTaskMeta,
  scope: WindowHostControllerSourceScope,
): KnorviaTaskMeta {
  const aligned: KnorviaTaskMeta = { ...meta, workspacePath: scope.workspacePath };
  if (scope.workspaceIdentity === undefined) delete aligned.workspaceIdentity;
  else aligned.workspaceIdentity = scope.workspaceIdentity;
  return aligned;
}

/**
 * 把实时 overlay 叠到持久化 meta 上。
 *
 * 标题规则：只有 v4 session store 明确标记 custom 时才承认 overlay 是新的手动标题；
 * 否则持久化的 titleOverridden 优先，避免运行中的自动标题把手动命名冲掉。
 * 阻塞交互以 sessions-index 为准 —— 它没有 pendingInteraction 就表示当前不阻塞，
 * 因此要显式清掉旧值而不是沿用。
 */
function overlayMeta(
  meta: KnorviaTaskMeta,
  overlay: WindowHostControllerSessionOverlay | undefined,
): KnorviaTaskMeta {
  if (overlay === undefined) return meta;
  const merged: KnorviaTaskMeta = { ...meta };
  const overlayIsManualTitle = overlay.titleSource === "custom";
  if (overlay.title !== undefined && (merged.titleOverridden !== true || overlayIsManualTitle)) {
    merged.title = overlay.title;
  }
  if (overlayIsManualTitle) merged.titleOverridden = true;
  if (overlay.updatedAt !== undefined) {
    merged.updatedAt = Math.max(merged.updatedAt, overlay.updatedAt);
  }
  if (overlay.pendingInteraction === undefined) delete merged.pendingInteraction;
  else merged.pendingInteraction = overlay.pendingInteraction;
  return merged;
}

function projectRow(
  source: SourceFacts,
  taskId: string,
  record: TaskIndexRecord,
): WindowHostControllerTaskRow {
  const overlay = source.overlays.get(taskId);
  const meta = overlayMeta(alignedMeta(record.meta, source.target.scope), overlay);
  const row: WindowHostControllerTaskRow = {
    address: addressOf(source.target.scope, taskId),
    meta,
    membership: record.membership,
    sourceAvailability: availabilityOf(source.connectionState),
    liveStatus: overlay === undefined ? persistedLiveStatus(meta) : overlay.liveStatus,
  };
  if (overlay?.activity !== undefined) row.activity = overlay.activity;
  if (record.searchSnippets !== undefined && record.searchSnippets.length > 0) {
    row.searchSnippets = [...record.searchSnippets];
  }
  return row;
}

/** 按 keyOf 建索引；同一键出现多次时以后者为准（与列表「后来者胜出」的口径一致）。 */
function indexBy<Item>(items: Item[], keyOf: (item: Item) => string): Map<string, Item> {
  const index = new Map<string, Item>();
  for (const item of items) index.set(keyOf(item), item);
  return index;
}

/** 同一 taskId 在单个 source 内唯一；重复条目以后出现的为准。 */
function indexRecords(records: TaskIndexRecord[]): Map<string, TaskIndexRecord> {
  return indexBy(records, (record) => record.meta.taskId);
}

function indexOverlays(
  overlays: WindowHostControllerSessionOverlay[],
): Map<string, WindowHostControllerSessionOverlay> {
  return indexBy(overlays, (overlay) => overlay.taskId);
}

function createChannel<Frame extends ControllerFrame>(
  topic: Frame["topic"],
  logEpoch: string,
): TopicChannel<Frame> {
  return { topic, listeners: new Map(), watermark: { logEpoch, seq: 0 } };
}

export function createWindowHostControllerProjection(options: { createId: () => string }) {
  const sources = new Map<string, SourceFacts>();
  const taskChannel = createChannel<WindowHostControllerTaskFrame>(
    CONTROLLER_TASKS_INDEX_TOPIC,
    options.createId(),
  );
  const workspaceChannel = createChannel<WindowHostControllerWorkspaceFrame>(
    CONTROLLER_WORKSPACES_TOPIC,
    options.createId(),
  );
  /** 上次广播出去的行，键为「source 键 + taskId」。 */
  let announcedRows = new Map<string, WindowHostControllerTaskRow>();
  /** 上次广播出去的 workspace 事实，键为 source 键。 */
  let announcedFacts = new Map<string, WindowHostControllerWorkspaceFact>();

  /**
   * 推进水位并给出这一帧的信封。
   *
   * 快照帧按 schema 必须从 seq 0 起且不推进水位；增量帧才把水位 +1。
   * 两种语义在这里显式区分，避免快照把 seq 抬高后客户端误判缺口。
   */
  function envelope(channel: TopicChannel<ControllerFrame>, advance: boolean): FrameEnvelope {
    const watermark = channel.watermark;
    if (!advance) {
      return { logEpoch: watermark.logEpoch, fromSeq: 0, toSeq: watermark.seq, sentAt: Date.now() };
    }
    const fromSeq = watermark.seq;
    watermark.seq = fromSeq + 1;
    return { logEpoch: watermark.logEpoch, fromSeq, toSeq: watermark.seq, sentAt: Date.now() };
  }

  /**
   * 构造一帧并发给订阅者。
   *
   * `only` 用于单播（subscribe / resync 的快照）；不给则扇出给该 topic 的全部订阅者。
   * 这里的断言是 TypeScript 无法把「泛型 topic + 对应 payload」收敛成具体 frame 的
   * 唯一代价，换来的是四个发送点不再各写一遍 topic/subscriptionId/payload 骨架。
   */
  function send<Frame extends ControllerFrame>(
    channel: TopicChannel<Frame>,
    advance: boolean,
    makePayload: (envelope: FrameEnvelope) => Frame["payload"],
    only?: string,
  ): void {
    if (channel.listeners.size === 0) return;
    const frameEnvelope = envelope(channel as TopicChannel<ControllerFrame>, advance);
    for (const [subscriptionId, deliver] of channel.listeners) {
      if (only !== undefined && only !== subscriptionId) continue;
      deliver({
        topic: channel.topic,
        subscriptionId,
        ...frameEnvelope,
        payload: makePayload(frameEnvelope),
      } as Frame);
    }
  }

  /**
   * 派生全部行。
   *
   * 派生顺序是 source 登记顺序 + 各自索引顺序，因此 getTasks 的结果在同一事实集上稳定。
   */
  function deriveRows(): Map<string, WindowHostControllerTaskRow> {
    const derived = new Map<string, WindowHostControllerTaskRow>();
    for (const [key, source] of sources) {
      for (const [taskId, record] of source.entries) {
        derived.set(`${key}${KEY_SEPARATOR}${taskId}`, projectRow(source, taskId, record));
      }
    }
    return derived;
  }

  function deriveFacts(): Map<string, WindowHostControllerWorkspaceFact> {
    const derived = new Map<string, WindowHostControllerWorkspaceFact>();
    for (const [key, source] of sources) {
      if (source.announced) derived.set(key, workspaceFactOf(source));
    }
    return derived;
  }

  /**
   * 把派生结果与上次广播的差异发出去。
   *
   * 只有真正变化的行才进 delta：sessions-index 会重复下发同样的 overlay，
   * 逐字段比较可以避免把无变化的重算变成广播风暴。
   */
  function publishRowChanges(): void {
    const derived = deriveRows();
    const deltas: WindowHostControllerTaskDelta[] = [];
    for (const [key, row] of derived) {
      const before = announcedRows.get(key);
      if (before !== undefined && isDeepStrictEqual(before, row)) continue;
      deltas.push({ op: "task.upserted", task: row });
    }
    for (const [key, row] of announcedRows) {
      if (!derived.has(key)) deltas.push({ op: "task.removed", address: row.address });
    }
    announcedRows = derived;
    if (deltas.length === 0) return;
    send(taskChannel, true, () => ({ kind: "deltas", deltas }));
  }

  function publishFactChanges(): void {
    const derived = deriveFacts();
    const deltas: WindowHostControllerWorkspaceDelta[] = [];
    for (const [key, fact] of derived) {
      if (isDeepStrictEqual(announcedFacts.get(key), fact)) continue;
      deltas.push({ op: "workspace.upserted", workspace: fact });
    }
    for (const [key, fact] of announcedFacts) {
      if (!derived.has(key)) deltas.push(workspaceRemovalOf(fact));
    }
    announcedFacts = derived;
    if (deltas.length === 0) return;
    send(workspaceChannel, true, () => ({ kind: "deltas", deltas }));
  }

  /** 一次事实变更的完整提交：先发行、再发事实，二者共用同一次重算。 */
  function commit(): void {
    publishRowChanges();
    publishFactChanges();
  }

  function deliverSnapshot(topic: WindowHostControllerTopic, subscriptionId: string): void {
    if (topic === CONTROLLER_TASKS_INDEX_TOPIC) {
      send(
        taskChannel,
        false,
        (frameEnvelope) => ({
          kind: "snapshot",
          snapshot: {
            protocolVersion: 1,
            logEpoch: frameEnvelope.logEpoch,
            tasks: [...announcedRows.values()],
          },
        }),
        subscriptionId,
      );
      return;
    }
    send(
      workspaceChannel,
      false,
      (frameEnvelope) => ({
        kind: "snapshot",
        snapshot: {
          protocolVersion: 1,
          logEpoch: frameEnvelope.logEpoch,
          workspaces: [...announcedFacts.values()],
        },
      }),
      subscriptionId,
    );
  }

  function acknowledge(
    topic: WindowHostControllerTopic,
    subscriptionId: string,
  ): ControllerSubscribeResult["ack"] {
    const channel = topic === CONTROLLER_TASKS_INDEX_TOPIC ? taskChannel : workspaceChannel;
    return { subscriptionId, mode: "snapshot", logEpoch: channel.watermark.logEpoch };
  }

  /**
   * 找不到 source 时的统一失败。
   *
   * 两个入口（按 scope 读、按 address 写）都必须 fail-closed：静默忽略会让写操作
   * 落在错误的 source 上，或让读操作返回空列表冒充「确实没有任务」。
   */
  function missingSource(detail: string): Error {
    return new Error(`Controller 投影找不到对应 source：${detail}`);
  }

  function requireSource(scope: WindowHostControllerSourceScope): SourceFacts {
    const source = sources.get(scopeKey(scope));
    if (source === undefined) {
      throw missingSource(`kind=${scope.kind}, workspace=${workspaceKeyOf(scope)}`);
    }
    return source;
  }

  return {
    registerSource(params: SourceRegistration) {
      const key = scopeKey(params.scope);
      const existing = sources.get(key);
      if (existing !== undefined) {
        // 同一 source 重连后重新登记：保留已冻结的事实，只更新路由与最新寻址。
        existing.target = { scope: params.scope, route: params.mutate };
        return;
      }
      sources.set(key, {
        target: { scope: params.scope, route: params.mutate },
        connectionState: "connecting",
        announced: false,
        entries: new Map(),
        overlays: new Map(),
      });
    },

    replaceSourceSnapshot(params: SnapshotRequest) {
      const source = requireSource(params.scope);
      const replaced = params.replacesScope;
      if (replaced !== undefined && scopeKey(replaced) !== scopeKey(params.scope)) {
        // 换 source：旧一代直接摘掉，其行在同一次 commit 的 delta 里被移除。
        sources.delete(scopeKey(replaced));
      }
      source.entries = indexRecords(params.taskIndex);
      source.overlays = indexOverlays(params.sessionsIndex);
      source.connectionState = "online";
      source.announced = true;
      commit();
    },

    replaceSourceSessionOverlays(
      scope: WindowHostControllerSourceScope,
      sessionsIndex: WindowHostControllerSessionOverlay[],
    ) {
      // 实时 overlay 属于增强信息：source 已被移除时静默忽略，
      // 不让观察者回调里的迟到事件把 Host 打断。
      const source = sources.get(scopeKey(scope));
      if (source === undefined) return;
      source.overlays = indexOverlays(sessionsIndex);
      publishRowChanges();
    },

    disconnectSource(scope: WindowHostControllerSourceScope) {
      const source = sources.get(scopeKey(scope));
      if (source === undefined) return;
      if (availabilityOf(source.connectionState) === "offline") return;
      // 行保留（冻结最后一次可信快照），只把连接态推到断连。
      source.connectionState = "disconnected";
      commit();
    },

    removeSource(scope: WindowHostControllerSourceScope) {
      if (!sources.delete(scopeKey(scope))) return;
      commit();
    },

    getTasks: (): WindowHostControllerTaskRow[] => [...announcedRows.values()],

    /**
     * 分组消费用的同一份事实，按 (workspace 身份, taskId) 排序。
     *
     * getTasks 保持投影顺序（source 登记顺序 + 索引顺序），适合按地址查找；
     * 分组渲染需要同一 workspace 的行连续且顺序稳定，所以在事实集不变的前提下重排。
     */
    getGroupedTaskFacts(): WindowHostControllerTaskRow[] {
      const decorated = [...announcedRows.values()].map((row) => ({
        row,
        sortKey: [workspaceKeyOf(row.address), row.address.taskId].join(KEY_SEPARATOR),
      }));
      decorated.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
      return decorated.map((entry) => entry.row);
    },

    async mutate(
      address: WindowHostTaskAddress,
      mutation: WindowHostControllerMutation,
    ): Promise<WindowHostControllerMutationResult> {
      const source = sources.get(addressKey(address));
      if (source === undefined) {
        throw missingSource(`taskId=${address.taskId}, workspace=${workspaceKeyOf(address)}`);
      }
      return await source.target.route(address, mutation);
    },

    subscribe(params: SubscriptionRequest): SubscriptionHandle {
      const subscriptionId = options.createId();
      const channel =
        params.topic === CONTROLLER_TASKS_INDEX_TOPIC ? taskChannel : workspaceChannel;
      channel.listeners.set(subscriptionId, params.onFrame);
      // 订阅即给全量快照：调用方拿到 ack 时状态已经一致，不必再等下一次变更。
      deliverSnapshot(params.topic, subscriptionId);
      const ack = acknowledge(params.topic, subscriptionId);
      return {
        ...ack,
        ack,
        dispose() {
          channel.listeners.delete(subscriptionId);
        },
      };
    },

    resync(subscriptionId: string): ControllerSubscribeResult["ack"] {
      const topic = taskChannel.listeners.has(subscriptionId)
        ? CONTROLLER_TASKS_INDEX_TOPIC
        : workspaceChannel.listeners.has(subscriptionId)
          ? CONTROLLER_WORKSPACES_TOPIC
          : undefined;
      if (topic === undefined) {
        throw new Error(`Controller 订阅已失效，无法 resync：${subscriptionId}`);
      }
      // 客户端只在发现缺口时 resync；这里直接重发快照，让它的水位回到当前 seq。
      deliverSnapshot(topic, subscriptionId);
      return acknowledge(topic, subscriptionId);
    },
  };
}
