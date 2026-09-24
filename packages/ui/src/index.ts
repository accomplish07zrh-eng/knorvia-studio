export { App } from "./App.js";
export {
  AssistantCodeCommentFeatureProvider,
  useAssistantCodeCommentFeatureEnabled,
} from "./AssistantCodeCommentFeatureProvider.js";
export { Button, buttonVariants } from "./components/ui/button.js";
export { ConfirmDialogHost } from "./ConfirmDialog.js";
export { DesktopWindowFrame } from "./DesktopWindowFrame.js";
export { AppErrorBoundary, ScopedErrorBoundary } from "./ErrorBoundary.js";
export type { ScopedErrorBoundaryVariant } from "./ErrorBoundary.js";
export { GitGraphPane } from "./git-graph/GitGraphPane.js";
export { layoutGitGraph } from "./git-graph/layout.js";
export type {
  GitGraphCommit,
  GitGraphLayout,
  GitGraphLayoutEdge,
  GitGraphLayoutOptions,
  GitGraphLayoutRow,
  GitGraphRef,
  GitGraphRefKind,
} from "./git-graph/layout.js";
export {
  REMOTE_WORKSPACE_DISCONNECTED_ERROR_CODE,
  createRemoteWorkspaceDisconnectedError,
} from "./lib/remoteWorkspaceServiceError.js";
export { Root } from "./Root.js";
export { RemoteConnectionDialog, SSHDialog } from "./SSHDialog.js";
export type { KnorviaState } from "./store/index.js";
export {
  bindRemoteWorkspacePath,
  getRemoteWorkspaceSession,
  registerBaseWorkspaceServices,
  registerRemoteWorkspaceSession,
  unbindRemoteWorkspacePath,
  unregisterRemoteWorkspaceSession,
  useRemoteWorkspaceSessionStore,
} from "./store/remoteWorkspaceSessionStore.js";
export { StoreProvider, useKnorviaStore } from "./store/StoreProvider.js";
export { Terminal } from "./Terminal.js";
export { useTestActions } from "./test-actions.js";
export type { TestActions } from "./test-actions.js";
export { useTheme } from "./useTheme.js";
export type { Theme } from "./useTheme.js";

// Hooks —— 统一的服务和平台操作访问层
export {
  PlatformProvider,
  ServiceProvider,
  useConfirmDialog,
  useConnectRemote,
  useGitActions,
  useGitRepository,
  useIntranetProbe,
  usePlatform,
  useReaddir,
  useRecentProjects,
  useSelectDirectory,
  useServices,
  useSettings,
  useSystemInfo,
  useTerminal,
  useWorkspaceServices,
} from "./hooks/index.js";

export { LocaleSwitcher, KnorviaIntlProvider, useKnorviaIntl } from "./i18n/index.js";
export type { IntlInstance } from "./i18n/index.js";
export { recordArmsCustomEventForE2E } from "./lib/armsCustomEventObservability.js";
export {
  FileDisplayInline,
  createFileDisplayDom,
  getFileDisplayPath,
  resolveFileDisplayDescriptor,
  setDefaultFileDisplayBasePath,
} from "./lib/fileDisplay.js";
export type { FileDisplayDescriptor, FileDisplayOptions } from "./lib/fileDisplay.js";
export { setReactErrorArmsReporter } from "./lib/reactErrorArmsTelemetry.js";
export { generateMobileDeviceFingerprint, setStreamClientId } from "./lib/streamClientId.js";
export { playTaskNotificationSound } from "./lib/taskNotificationSound.js";
export {
  applyUiFontSizePx,
  loadUiFontSizePx,
  subscribeToUiFontSizeStorageChanges,
} from "./lib/uiFontSize.js";
export { reportUiLaunchToInput } from "./lib/uiPerfArmsTelemetry.js";
export {
  RendererUserActionTelemetry,
  runUserAction,
  runUserActionAsync,
  setUserActionTelemetry,
  startUserAction,
} from "./lib/userActionTelemetry.js";
export {
  CORE_USER_ACTION_FEATURES,
  SETTINGS_USER_ACTION_FEATURES,
  USER_ACTION_CATALOG,
} from "./lib/userActionTraceCatalog.js";
export { ResourceManagerApp } from "./resource-manager/ResourceManagerApp.js";
export type {
  ResourceManagerAppProps,
  ResourceManagerTab,
} from "./resource-manager/ResourceManagerApp.js";
export { GlobalDatabaseStartupLoading } from "./root/GlobalDatabaseStartupLoading.js";

export { LocalTtftObserver, setLocalTtftObserver } from "@/v4/telemetry/localTtftObserver.js";
