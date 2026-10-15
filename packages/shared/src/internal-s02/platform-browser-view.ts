// SPDX-License-Identifier: Apache-2.0
// browser-use 视图的投递载荷与 residency/截图表面契约（B39 域件）。
import type { BrowserViewportSize } from "../browser-use/command-metadata.js";

export type TaskNotificationPayload = {
  taskId: /* 目标任务 */ string;
  status: /* 通知状态 */ | "completed"
    | "failed"
    | "permission_request"
    | "elicitation_request"
    | "feedback_update";
  requestId?: /* 关联请求 */ string;
  title: /* 通知标题 */ string;
  body: /* 通知正文 */ string;
};

// Main 将一次能定位真实 tab 的 browser-use 操作投递给它的 origin renderer。
export type BrowserViewOperationPayload = {
  workspaceKey: /* 路由键 */ string;
  remoteSessionId?: /* 远程会话标识 */ string;
  sessionId: /* 所属会话 */ string;
  tabId: /* 目标 tab */ string;
  browserId: /* browser 实例 */ string;
  browserGeneration: /* browser 代数 */ number;
  // 当前模型命令会打开、激活或改变 Browser 布局，renderer 应重建 resize observation baseline。
  resetsResizeBaseline?: boolean;
};

const RESIDENCY_STATE_TABLE = {
  liveVisible: "live-visible",
  liveBackground: "live-background",
  suspendPending: "suspend-pending",
  suspended: "suspended",
  restoring: "restoring",
} as const;
export type BrowserTabResidencyState =
  (typeof RESIDENCY_STATE_TABLE)[keyof typeof RESIDENCY_STATE_TABLE];

// 只用于创建尚未提交首个 navigation entry 的 residency restore guest。
export const BROWSER_VIEW_RESTORE_BOOTSTRAP_URL = "knorvia-browser-restore://pending";

// Renderer 上报 tab shell 的展示事实；windowId 必须由 main 绑定可信 IPC sender。
export type BrowserViewResidencyReportPayload = {
  tabId: /* 目标 tab */ string;
  workspaceKey: /* 路由键 */ string;
  remoteSessionId?: /* 远程会话标识 */ string;
  sessionId: /* 所属会话 */ string;
  selected: /* 是否选中 */ boolean;
  visible: /* 是否可见 */ boolean;
  currentTask: /* 是否当前任务 tab */ boolean;
  loading: /* 是否加载中 */ boolean;
  restoreUrl?: /* 恢复用 URL */ string | null;
  title?: /* 标题快照 */ string | null;
  faviconUrl?: /* 图标 URL */ string | null;
};

export type BrowserViewResidencyTransitionPayload = {
  tabId: /* 目标 tab */ string;
  workspaceKey: /* 路由键 */ string;
  remoteSessionId: /* 远程会话标识 */ string | undefined;
  sessionId: /* 所属会话 */ string;
  browserId: /* browser 实例 */ string;
  browserGeneration: /* browser 代数 */ number;
  generation: /* residency 代数 */ number;
  residency: /* 迁移目标态 */ Extract<
    BrowserTabResidencyState,
    "live-visible" | "live-background" | "suspended" | "restoring"
  >;
};

export type BrowserViewCloseTabRequest = {
  tabId: /* 目标 tab */ string;
  workspaceKey: /* 路由键 */ string;
  remoteSessionId?: /* 远程会话标识 */ string;
  sessionId: /* 所属会话 */ string;
};

/**
 * main→renderer 的关闭通知。
 *
 * 旧 payload 只带 tabId：renderer 只能在「当前活跃 workspace」的 side pane 状态里找，
 * 用户切走后通知被静默丢弃，原 workspace 的持久化状态留下关不掉的幽灵 tab。
 * 现在带 owner scope，renderer 直接定位对应 workspace 的 side pane 内存删掉该 tab；
 * scope 可缺省——recovery-orphan 等内部路径只有 tabId，此时退回「仅当前 workspace」语义。
 */
export type BrowserViewCloseTabNotification = {
  tabId: /* 目标 tab */ string;
  workspaceKey?: /* owner 路由键 */ string;
  remoteSessionId?: /* 远程会话标识 */ string;
  sessionId?: /* owner 会话 */ string;
  reason?: /* 关闭原因 */ "recovery-orphan";
};

// 跨重启先恢复 logical shell；renderer 初始不得一次 mount 全部 guest。
export type BrowserViewRestoredTabShell = {
  tabId: /* 目标 tab */ string;
  workspaceKey: /* 路由键 */ string;
  remoteSessionId?: /* 远程会话标识 */ string;
  sessionId: /* 所属会话 */ string;
  browserId: /* browser 实例 */ string;
  browserGeneration: /* browser 代数 */ number;
  origin: /* 打开方 */ "agent" | "user";
  restoreUrl: /* 恢复 URL */ string | null;
  title: /* 标题快照 */ string | null;
  faviconUrl: /* 图标 URL */ string | null;
  openedAt: /* 首开毫秒时间戳 */ number;
  lastSelectedAt: /* 最近选中时间 */ number | null;
};

export type BrowserViewRestoreTabsRequest = {
  workspaceKey: /* 路由键 */ string;
  remoteSessionId?: /* 远程会话标识 */ string;
  sessionId?: /* 所属会话 */ string;
};

// Main 将 Agent viewport 变更定向投递给目标 tab 的 origin renderer。
export type BrowserViewViewportChangedPayload = BrowserViewOperationPayload & {
  viewport: /* 新 viewport；null 表示恢复自然尺寸 */ BrowserViewportSize | null;
};

// 旧默认预算 1500ms 在慢机器/后台窗口等不到连续稳定帧；main 与 renderer 共用这个默认值，
// prepare payload 再传实际覆盖值，避免两端 deadline 漂移。
export const BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS = 3_000;

/** 截图/录制握手对 renderer 预览比例的瞬时要求；缺失时沿用用户当前预览。 */
export type BrowserViewSurfaceScaleMode = "current" | "unscaled";

// Main 请求 owner renderer 在截图前准备后台 guest 合成表面。
export type BrowserViewScreenshotSurfacePreparePayload = BrowserViewOperationPayload & {
  requestId: /* 本次握手请求 */ string;
  webContentsId: /* 目标 webContents */ number;
  viewport: /* 截图 viewport */ BrowserViewportSize;
  // 自然 viewport 不使用 metrics 的 guest 布局补偿；缺失时保持原仿真行为（含录制）。
  viewportMode?: "natural" | "emulated";
  // unscaled 只在 lease 生命周期内强制真实 100% surface，不写回用户的 Fit/固定比例。
  surfaceScaleMode?: BrowserViewSurfaceScaleMode;
  // Main 当前实际用的 prepare 超时；旧 payload 缺失时 renderer 回退共享默认值。
  timeoutMs?: number;
};

// Owner renderer 确认目标 guest 的逻辑 viewport 与原生预览 surface 比例均已稳定。
export type BrowserViewScreenshotSurfaceReadyPayload =
  BrowserViewScreenshotSurfacePreparePayload & {
    surfaceScale: /* 实际 surface 比例 */ number;
  };

// Main 通知 owner renderer 释放临时后台截图合成表面。
export type BrowserViewScreenshotSurfaceReleasePayload = Omit<
  BrowserViewScreenshotSurfacePreparePayload,
  "viewport" | "viewportMode" | "surfaceScaleMode" | "timeoutMs"
>;

const ATTACH_REJECT_TABLE = {
  notFound: "not-found",
  destroyed: "destroyed",
  notWebview: "not-webview",
  closed: "closed",
  windowMismatch: "window-mismatch",
  workspaceMismatch: "workspace-mismatch",
  sessionMismatch: "session-mismatch",
  remoteSessionMismatch: "remote-session-mismatch",
  residencySuspended: "residency-suspended",
  residencyGenerationMismatch: "residency-generation-mismatch",
} as const;
export type BrowserGuestAttachRejectReason =
  (typeof ATTACH_REJECT_TABLE)[keyof typeof ATTACH_REJECT_TABLE];

// Renderer 上报 guest 后 main 返回的绑定结果；拒绝不能再伪装成无返回的 ready timeout。
export type BrowserGuestAttachResult =
  | { ok: true; guestGeneration: /* guest 代数 */ number }
  | {
      ok: false;
      reason: /* 拒绝原因 */ BrowserGuestAttachRejectReason;
      recoveryRequested: /* 是否请求恢复流程 */ boolean;
    };

export type EmbeddedBrowserOpenUrlRequest = {
  url: /* 目标 URL */ string;
  disposition: /* 打开方式 */ | "default"
    | "foreground-tab"
    | "background-tab"
    | "new-window"
    | "other";
  // 触发 popup 的 browser-use tab 归属；旧版事件缺失时由 renderer 按当前 scope 兼容处理。
  workspaceKey?: string;
  remoteSessionId?: /* 远程会话标识 */ string;
  sessionId?: /* 所属会话 */ string;
  browserId?: /* browser 实例 */ string;
  browserGeneration?: /* browser 代数 */ number;
  sourceTabId?: /* 来源 tab */ string;
};
