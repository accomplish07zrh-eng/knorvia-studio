// SPDX-License-Identifier: Apache-2.0
// 桌面窗口/chrome 导入/远程会话事件与窗口命令词表（B39 域件）。
import type { RemoteTarget } from "../remoteTarget.js";

export type WSLDistro = {
  name: /* 发行版名 */ string;
  isDefault: /* 是否默认发行版 */ boolean;
  state: /* 运行状态文本 */ string;
  version: /* WSL 版本 */ 1 | 2 | null;
};

export type DockerContainerInfo = {
  id: /* 容器 ID */ string;
  image: /* 镜像名 */ string;
  name: /* 容器名 */ string;
  state: /* 状态文本 */ string;
  status: /* 状态描述 */ string;
};

export type SSHConfigAliasOption = {
  alias: /* ssh config 别名 */ string;
  host?: /* 别名解析出的主机 */ string;
  port?: /* 别名解析出的端口 */ number;
  username?: /* 别名解析出的用户 */ string;
  privateKeyPath?: /* 别名解析出的私钥路径 */ string;
  source?: /* 来源配置文件 */ string;
};

export type KnorviaStdioTapDevState = {
  enabled: /* 开关是否打开 */ boolean;
  visible: /* 菜单是否可见 */ boolean;
  logDir: /* 日志目录 */ string;
  statePath: /* 状态文件路径 */ string;
};

const TITLE_BAR_THEME_TABLE = { light: "light", dark: "dark", system: "system" } as const;
export type DesktopTitleBarTheme =
  (typeof TITLE_BAR_THEME_TABLE)[keyof typeof TITLE_BAR_THEME_TABLE];

export type WindowScreenshotResult = {
  dataBase64: /* PNG base64 */ string;
  filename: /* 建议文件名 */ string;
  contentType: /* MIME 类型 */ string;
  size: /* 字节数 */ number;
};

const CHROME_IMPORT_ERROR_TABLE = {
  chromeProfileNotFound: "chrome_profile_not_found",
  chromeProfileAmbiguous: "chrome_profile_ambiguous",
  chromeExecutableNotFound: "chrome_executable_not_found",
  chromeCookieAccessDenied: "chrome_cookie_access_denied",
  chromeCookieElevationRequired: "chrome_cookie_elevation_required",
  chromeCookieElevationCancelled: "chrome_cookie_elevation_cancelled",
  chromeCookieHelperVerificationFailed: "chrome_cookie_helper_verification_failed",
  chromeCookieAppBoundDecryptionFailed: "chrome_cookie_app_bound_decryption_failed",
  chromeCookieProtectionUnsupported: "chrome_cookie_protection_unsupported",
  chromeProfileLocked: "chrome_profile_locked",
  chromeLocalStorageImportFailed: "chrome_local_storage_import_failed",
  chromeImportNotSupported: "chrome_import_not_supported",
  chromeBrowserDataImportUnavailable: "chrome_browser_data_import_unavailable",
  chromeDataImportFailed: "chrome_data_import_failed",
  chromeDefaultProfileNotFound: "chrome_default_profile_not_found",
} as const;
export type ChromeBrowserDataImportError =
  (typeof CHROME_IMPORT_ERROR_TABLE)[keyof typeof CHROME_IMPORT_ERROR_TABLE];

export type ChromeBrowserDataImportOptions = {
  // Windows App-Bound Cookie 只能在本次显式确认后触发 UAC；不得持久化为全局授权。
  allowElevatedChromeDecryption?: boolean;
};

// Chrome 浏览器数据导入只返回数量和状态；Cookie/LocalStorage 值和解密材料不得跨进程。
export type ChromeBrowserDataImportResult = {
  success: /* 是否整体成功 */ boolean;
  cookies: {
    imported: /* 导入成功数 */ number;
    skipped: /* 跳过数 */ number;
    failed: /* 失败数 */ number;
  };
  localStorage: {
    originsImported: /* 导入的 origin 数 */ number;
    entriesImported: /* 导入的条目数 */ number;
    originsSkipped: /* 跳过的 origin 数 */ number;
    originsFailed: /* 失败的 origin 数 */ number;
    error?: /* 该阶段错误码 */ ChromeBrowserDataImportError;
  };
  /** 部分成功时保留可操作问题；不得包含 Profile 绝对路径或站点数据。 */
  issues?: ChromeBrowserDataImportError[];
  error?: /* 整体错误码 */ ChromeBrowserDataImportError;
};

export type EmbeddedBrowserDataClearResult = {
  success: /* 是否成功 */ boolean;
  error?: /* 可读错误文本 */ string;
};

export type WindowControlsOverlayMetrics = {
  leftPaddingPx?: /* 左安全边距 */ number;
  rightPaddingPx?: /* 右安全边距 */ number;
  titleBarHeightPx?: /* 标题栏高度 */ number;
};

export type WindowControlsOverlayReadyPayload = {
  zoomLevel: /* 当前缩放档位 */ number;
  metrics: /* 安全边距 */ WindowControlsOverlayMetrics;
};

export type DesktopZoomState = {
  zoomLevel: /* 缩放档位 */ number;
};

export type DesktopWindowChromeState = {
  isMaximized: /* 是否最大化 */ boolean;
  /** 本机 macOS 主版本；非 macOS 或无法解析时为 null。 */
  macOSMajorVersion?: number | null;
  supportsNativeRoundedCorners: /* 系统是否支持原生圆角 */ boolean;
};

export type RemoteServiceSession = {
  sessionId: /* 远程会话标识 */ string;
};

export type RemoteConnectionRuntimeLog = {
  label: /* 日志分类标签 */ string;
  requestId?: /* 关联请求 */ string;
  sessionId?: /* 关联会话 */ string;
  level: /* 级别 */ "info" | "warn" | "error";
  source: /* 来源模块 */ string;
  message: /* 日志正文 */ string;
  timestamp: /* 时间戳文本 */ string;
};

export type RemoteSessionClosedEvent = {
  sessionId: /* 远程会话标识 */ string;
  reason: /* 关闭原因 */ "host-exit";
  exitCode: /* 进程退出码 */ number | null;
  signal: /* 信号名 */ string | null;
};

export type ConnectRemoteRequest = {
  target: /* 连接目标 */ RemoteTarget;
  requestId?: /* 请求标识 */ string;
  workspacePath?: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  connectTrigger?: import("../remoteUsageTelemetry.js").RemoteWorkspaceConnectTrigger;
};

export type CancelPendingRemoteConnectionRequest = {
  requestId?: /* 被取消的请求标识 */ string;
};

export type BindRemoteWorkspaceSessionContextRequest = {
  remoteSessionId: /* 远程会话标识 */ string;
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
};

// 桌面窗口级命令词表：键名与取值逐字冻结（B39 DesktopCommandIds 28 项）。
const DESKTOP_COMMAND_TABLE = {
  NewTask: /* 新建任务 */ "newTask",
  OpenWorkspace: /* 打开工作区 */ "openWorkspace",
  CloseActiveContext: /* 关闭当前上下文 */ "closeActiveContext",
  CloseWindow: /* 关闭窗口 */ "closeWindow",
  MinimizeWindow: /* 最小化窗口 */ "minimizeWindow",
  ToggleMaximizeWindow: /* 切换最大化 */ "toggleMaximizeWindow",
  ToggleFullScreen: /* 切换全屏 */ "toggleFullScreen",
  ResetWindowSize: /* 复位窗口尺寸 */ "resetWindowSize",
  ResetZoom: /* 复位缩放 */ "resetZoom",
  ZoomIn: /* 放大 */ "zoomIn",
  ZoomOut: /* 缩小 */ "zoomOut",
  ShowAbout: /* 打开关于 */ "showAbout",
  OpenChangelog: /* 打开更新日志 */ "openChangelog",
  CheckForUpdates: /* 检查更新 */ "checkForUpdates",
  RelaunchApp: /* 重启应用 */ "relaunchApp",
  OpenFeedback: /* 打开反馈 */ "openFeedback",
  OpenCommunity: /* 打开社群 */ "openCommunity",
  ExportLogs: /* 导出日志 */ "exportLogs",
  ToggleDevTools: /* 切换开发者工具 */ "toggleDevTools",
  OpenResourceManager: /* 打开资源管理器 */ "openResourceManager",
  ToggleKnorviaStdioTapDevProxy: /* 切换 stdio tap 代理 */ "toggleKnorviaStdioTapDevProxy",
  SetKnorviaEndpointProduction: /* 切到生产端点 */ "setKnorviaEndpointProduction",
  SetKnorviaEndpointTest: /* 切到测试端点 */ "setKnorviaEndpointTest",
  SetKnorviaEndpointCustom: /* 切到自定义端点 */ "setKnorviaEndpointCustom",
  ResetKnorviaEndpoint: /* 复位端点 */ "resetKnorviaEndpoint",
  ClearAllData: /* 清空全部数据 */ "clearAllData",
  ClearCodingPlanWebviewStorage: /* 清 Coding Plan webview 存储 */ "clearCodingPlanWebviewStorage",
  GetCuaOsSupport: /* 查询 CUA 系统支持态 */ "getCuaOsSupport",
} as const;

export const DesktopCommandIds = DESKTOP_COMMAND_TABLE;

export type DesktopCommandId = (typeof DESKTOP_COMMAND_TABLE)[keyof typeof DESKTOP_COMMAND_TABLE];

/**
 * CUA Helper 的操作系统支持态（macOS 版本门槛判定结果，主进程经 GetCuaOsSupport 下发给 renderer）：
 * - supported：满足门槛（含非版本因素，如解析失败时按宽松处理）。
 * - macos-below-minimum：macOS 低于承诺地板（Helper LSMinimumSystemVersion 12.0）；
 *   低版本上 Helper 会被 LaunchServices -10825 拒启，表象是授权反复无响应。
 * - not-applicable：非 darwin 平台，没有 macOS 版本门槛概念。
 */
export type CuaOsSupport =
  | { kind: /* 满足门槛 */ "supported" }
  | {
      kind: /* 低于最低 macOS 版本 */ "macos-below-minimum";
      minimumMacOs: /* 承诺地板版本 */ string;
      currentMacOs: /* 当前版本 */ string;
    }
  | { kind: /* 非 darwin 平台 */ "not-applicable" };
