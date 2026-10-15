import type { RemoteAssetInstallMode } from "./remoteAssetInstallMode.js";
import type { RemoteResourcePackageSelection } from "./remoteResourcePackages.js";
import type { ProviderFamilyDomain } from "./model-provider-family.js";
import type { ProviderFamilyConnectionSelectionSettings } from "./provider-family-connection-selection.js";
import type { WorkspacePurpose } from "./workspacePurpose.js";
import type { EmbeddedBrowserViewportPreference } from "./browser-use/command-metadata.js";

// ── Domain types ──。

export interface FileEntry {
  // 字段面
  isSymbolicLink?: /* 旧远端服务端可能不返回；调用方应按 false 处理。 */ boolean;
  name: /* 文本 */ string;
  path: /* 文本 */ string;
  type: /* 联合 */ "file" | "directory";
}

export interface FileStat {
  // 字段面
  mtimeMs?: /* 文件最后修改时间；分享分块读取用它检测读取期间的并发改写。 */ number;
  path: /* 文本 */ string;
  type: /* 联合 */ "file" | "directory";
  size?: /* 文件字节数；旧远端服务端可能不返回，调用方需按 undefined 处理。 */ number;
}

// 文件系统变更事件（目录级粒度）。
export interface FileWatchEvent {
  // 字段面
  changedPath?: /* 文本 */ string;
  dirPath: /* 发生变更的目录路径 */ string;
  // 能由底层 watcher 确认时返回发生变化的完整路径。 旧 Host、平台未返回 filename 或同一防抖窗口包含多个路径时省略，调用方应保守刷新。。
}

export interface FileTextSlice {
  // 字段面
  isBinary: /* 布尔 */ boolean;
  path: /* 文本 */ string;
  content: /* 文本 */ string;
  offset: /* 数值 */ number;
  bytesRead: /* 数值 */ number;
  totalBytes: /* 数值 */ number;
  truncated: /* 布尔 */ boolean;
}

export interface FileMediaPreview {
  // 字段面
  totalBytes: /* 数值 */ number;
  path: /* 文本 */ string;
  mediaType: /* 文本 */ string;
  dataBase64: /* 文本 */ string;
}

export interface FileBinaryPreview {
  // 字段面
  totalBytes: /* 数值 */ number;
  path: /* 文本 */ string;
  dataBase64: /* 文本 */ string;
}

export interface WorkspaceFileEntry {
  // 字段面
  type: /* 联合 */ "file" | "directory";
  name: /* 文本 */ string;
  path: /* 文本 */ string;
  relativePath: /* 文本 */ string;
}

export interface SystemInfo {
  // 字段面
  platform: /* 文本 */ string;
  homedir: /* 文本 */ string;
}

// 支持的语言。
export type Locale = "zh-CN" | "en-US"; // 类型面

// 界面语言偏好；system 表示跟随当前运行端系统语言。。
export type LocalePreference = "system" | Locale; // 类型面

// Knorvia 运行中继续输入时的交互行为。
export type KnorviaInteractionBehavior = "queue" | "guide"; // 类型面

// 桌面端 Electron 自动更新发布通道。。
export type ElectronReleaseChannel = "stable" | "preview"; // 类型面

// Windows Bash 工具可使用的集成终端 shell 方言。。
export type IntegratedTerminalShellDialect = "cmd" | "git-bash"; // 类型面

// 设置页中 Windows Bash shell 的用户选择。。
export type IntegratedTerminalShellSelection =
  | { mode: "auto" } // 分支形态
  | {
      // 分支形态
      mode: /* 结构引用 */ "shell";
      dialect: /* 结构引用 */ IntegratedTerminalShellDialect;
      id: /* 文本 */ string;
      label: /* 文本 */ string;
      path: /* 文本 */ string;
    };

// 当前 host 可识别的 Windows shell 选项。。
export interface IntegratedTerminalShellOption {
  // 字段面
  source: /* 联合 */ "system" | "path";
  dialect: /* 结构引用 */ IntegratedTerminalShellDialect;
  id: /* 文本 */ string;
  label: /* 文本 */ string;
  path: /* 文本 */ string;
}

// 默认语言。
export const DEFAULT_LOCALE: Locale = "zh-CN"; // 常量面

// ── Workspace / Tab ──。

// 标签页唯一标识。
export type TabId = string; // 类型面

// 单个标签页的状态。
export interface TabState {
  // 字段面
  label: /* 显示名称，通常为路径最后一段 */ string;
  id: /* 结构引用 */ TabId;
  workspacePath: /* workspace 绝对路径 */ string;
}

export interface SSHRemoteTargetSnapshot {
  // 字段面
  privateKeyPassphraseCredentialKey?: /* 文本 */ string;
  kind: /* 结构引用 */ "ssh";
  host: /* 文本 */ string;
  port?: /* 数值 */ number;
  username: /* 文本 */ string;
  sshConfigAlias?: /* 用户建立连接时选择的 SSH config Host alias，仅用于 UI 展示。 */ string;
  privateKeyPath?: /* 文本 */ string;
  assetInstallMode?: /* 结构引用 */ RemoteAssetInstallMode;
  resourcePackages?: /* 结构引用 */ RemoteResourcePackageSelection;
  // SSH 密码不会写入 setting.json。 这里只保存 credentialService 的键名，恢复时再去安全存储读取真实密码。。
  passwordCredentialKey?: /* 文本 */ string;
  // 私钥口令不会写入 setting.json。 这里只保存 credentialService 的键名，恢复时再去安全存储读取真实口令。。
}

export interface WSLRemoteTargetSnapshot {
  // 字段面
  user?: /* 文本 */ string;
  kind: /* 结构引用 */ "wsl";
  distro?: /* 文本 */ string;
}

export interface DockerRemoteTargetSnapshot {
  // 字段面
  container: /* 文本 */ string;
  kind: /* 结构引用 */ "docker";
}

export type RemoteTargetSnapshot =
  | SSHRemoteTargetSnapshot // 分支形态
  | WSLRemoteTargetSnapshot // 分支形态
  | DockerRemoteTargetSnapshot; // 分支形态

export interface RemoteWorkspaceSessionSnapshot {
  // 字段面
  lastConnectionError?: /* 最近一次失败原因；成功后清空 */ string;
  workspacePath: /* 远程 workspace 的真实绝对路径 */ string;
  localWorkspacePath?: /* 发起远程连接时的本机 workspace 路径，仅用于 MCP filesystem 路径改写。 */ string;
  workspaceIdentity?: /* 远程 workspace 的稳定身份键（authority + canonicalPath）。 */ string;
  target: /* 远程连接目标的可恢复快照 */ RemoteTargetSnapshot;
  lastOpenedAt: /* 最近一次成功打开该 workspace 的时间戳 */ number;
  lastConnectionStatus: /* 最近一次恢复/重连结果 */ "connected" | "failed";
}

export interface LocalWorkspaceSessionEntry {
  // 字段面
  workspacePurpose?: /* 项目展示分类；旧数据缺省为 project，conversation 仍使用真实 workspacePath 作为 cwd/key。 */ WorkspacePurpose;
  kind: /* 结构引用 */ "local";
  workspacePath: /* 文本 */ string;
}

export interface RemoteWorkspaceSessionEntry extends RemoteWorkspaceSessionSnapshot {
  kind: /* 结构引用 */ "remote";
}

export type PersistedWorkspaceSessionEntry =
  | LocalWorkspaceSessionEntry // 分支形态
  | RemoteWorkspaceSessionEntry; // 分支形态

// ── Process Monitor ──。

// 资源管理器分类：基础服务 / 内置插件 / 社区插件。
export type ResourceUsageCategory = "base" | "builtin-plugin" | "community-plugin"; // 类型面

// 基础服务分组键；插件分组键为插件名或 MCP server name。
export type ResourceUsageBaseGroupKey = "main" | "gpu" | "renderer" | "host" | "cli" | "utility"; // 类型面

// 资源管理器中的一个进程行（CPU 为整机归一化百分比，内存为字节）。
export interface ResourceUsageProcess {
  // 字段面
  sampled: /* false 表示只知道拓扑，指标尚未采到（显示为 —） */ boolean;
  pid: /* 数值 */ number;
  name: /* 进程显示名，如 knorvia-main / agent-knorvia-demo / node_repl */ string;
  category: /* 结构引用 */ ResourceUsageCategory;
  groupKey: /* 文本 */ string;
  groupLabel: /* 文本 */ string;
  cpuPercent: /* 数值 */ number;
  memoryBytes: /* 数值 */ number;
}

// Host 侧采样得到的外部进程行（Agent / MCP / 终端等），由 main 合并进快照。
export type HostResourceUsageProcess = Omit<ResourceUsageProcess, "sampled">; // 类型面

// 资源管理器一次完整快照，由 main 进程合并 Electron 指标、系统总量与 Host 采样后返回。
export interface ResourceUsageSnapshot {
  // 字段面
  processes: /* 数组 */ ResourceUsageProcess[];
  sampledAt: /* 数值 */ number;
  logicalCpuCount: /* 数值 */ number;
  system: {
    cpuPercent: /* 数值 */ number;
    memoryTotalBytes: /* 数值 */ number;
    memoryUsedBytes: /* 数值 */ number;
  };
  app: {
    cpuPercent: /* 数值 */ number;
    memoryBytes: /* 数值 */ number;
  };
}

export interface AppSettings {
  // 字段面
  knorviaEndpointOrigin?: /* 设置页里的临时 endpoint override；正式/测试默认 base url 由 KNORVIA_BASE_URL env 管理。 */ string;
  releaseInfoUrl?: /* Read-only release metadata endpoint; empty means no update source and no request. */ string;
  releaseChecksEnabled?: /* Disabling this suppresses both scheduled and manual release requests. */ boolean;
  startPlanRecommendationDismissed?: /* 当前 App/Host 不再显示提交前体验套餐推荐；不改变任何入口的模型选择。 */ boolean;
  recentProjects: string[]; // 最近项目列表，最多保留 10 个
  locale: Locale; // 界面语言
  // 用户覆盖的快捷键绑定（命令 ID → 绑定串数组，格式见 shortcutCommands.ts）。 只存用户覆盖：未覆盖的命令不落盘，读取时与 SHORTCUT_COMMANDS 默认绑定合并； 覆盖语义为整组替换（如 openCommandCenter 的双默认绑定被覆盖时同时失效）。。
  shortcutBindings?: /* 文本 */ Record<string, string[]>;
  localePreference?: /* 界面语言偏好；locale 保存偏好解析后的实际语言，供 main/menu/远控等非浏览器上下文使用。 */ LocalePreference;
  terminalInheritSystemProfile?: /* 是否尽量继承系统终端 profile、shell 环境和字体 */ boolean;
  terminalFontFamily?: /* 用户显式覆盖的终端字体；为空时从系统终端配置自动探测 */ string;
  integratedTerminalShell?: /* Windows 下 Bash 工具使用的本机 shell；未配置时自动选择。 */ IntegratedTerminalShellSelection;
  httpProxy?: /* HTTP/HTTPS 出口代理，例如 http://127.0.0.1:7890；为空时直连。下次启动 app/agent 生效。 */ string;
  httpProxyNoProxy?: /* 代理绕过规则，例如 localhost,127.0.0.1,.example.com；只在 httpProxy 存在时影响 renderer，agent/tool 仍按显式环境使用。 */ string;
  httpProxyCaCertPath?: /* 自定义 PEM 根证书路径；下次启动 app/agent 时用于 renderer 校验与 agent NODE_EXTRA_CA_CERTS。 */ string;
  // 内置浏览器忽略 HTTPS 证书校验错误（自签名、过期、域名不匹配等），用于访问内网测试站点。 只影响内置浏览器出口，不影响 Knorvia 自身对后端与模型 API 的请求。默认关闭，重启后生效。。
  embeddedBrowserAllowInsecureCertificates?: /* 布尔 */ boolean;
  embeddedBrowserViewportPreference?: /* 人类用户主动打开 Browser tab 时的一次性显示偏好；Agent Browser Use 不读写。 */ EmbeddedBrowserViewportPreference;
  // 用户已在设置页关闭输入框的「电脑操作」按钮（内部 hidden 态）。 取 hidden 语义而非 visible：undefined 即默认显示，老用户无需数据迁移。 关闭后按钮不再渲染，且不因重启或版本更新自愈，仅能在设置页重新开启。。
  computerUseComposerEntryHidden?: /* 布尔 */ boolean;
  taskAutoArchiveEnabled?: /* 自动归档已完成旧任务的总开关 */ boolean;
  taskAutoArchiveOlderThanDays?: /* 自动归档阈值；当任务最后更新时间早于该天数时允许被归档 */ number;
  closeToTrayOnWindows?: /* Windows 桌面端关闭窗口时隐藏到托盘；其它平台忽略 */ boolean;
  keepAwakeWhileRunning?: /* 存在执行中的闲时任务时阻止系统闲置休眠（手动开关，防不了合盖）。 */ boolean;
  closeToTrayOnWindowsMigrationInitialized?: /* Windows 关闭到托盘默认值是否已执行过一次性迁移；只用于设置迁移，不参与业务判断。 */ boolean;
  desktopZoomLevel?: /* 桌面端全局页面缩放档位；用于重启后恢复界面缩放，Web/手机端忽略。 */ number;
  // 桌面主窗口最近一次非最大化宽高及最大化状态；Web/手机端忽略。。
  desktopWindowSize?: {
    width: /* 数值 */ number;
    height: /* 数值 */ number;
    maximized: /* 布尔 */ boolean;
  };
  desktopChromiumHardwareAccelerationEnabled?: /* 桌面端 Chromium 硬件加速开关；只在下次启动 main 进程早期生效，Web/手机端忽略。 */ boolean;
  messageStreamShowReasoning?: /* 是否在消息流中展示模型思考过程 */ boolean;
  // TODO(settings-schema-version): 能证明所有受支持升级路径都已执行本次迁移后，改用统一 settings schema version，并一起删除此 marker、迁移函数和持久化判断。。
  messageStreamShowReasoningMigrationInitialized?: /* 显示模型思考过程的默认值是否已执行过一次性迁移；只用于设置迁移，不参与消息渲染判断。 */ boolean;
  messageStreamShowTodos?: /* 是否在消息流中展示 todo 工具渲染；不影响摘要面板的 todo */ boolean;
  toolGroupingExploreEnabled?: /* 是否把连续的只读工具调用聚合成 Explore。 */ boolean;
  toolGroupingTerminalEnabled?: /* 是否把连续的非只读 Shell 工具调用聚合成 Terminal。 */ boolean;
  toolGroupingChangesEnabled?: /* 是否把连续的 Write/Edit/ApplyPatch 工具调用聚合成 Changes。 */ boolean;
  knorviaInteractionBehavior?: /* Knorvia 运行中继续输入时，是排队到下一轮，还是引导到下一次工具调用后运行 */ KnorviaInteractionBehavior;
  askUserQuestionAutoResolutionEnabled?: /* Agent 提问五分钟无人回答时是否允许自动继续；缺失按开启兼容旧配置。 */ boolean;
  modelIoFullRetentionEnabled?: /* 是否完整保留 Model I/O；开启后不轮转、不限额重置、不压缩或裁剪，鉴权信息仍会脱敏。 */ boolean;
  providerFamilyConnectionSelections?: /* 设置页中每个 Provider Family 当前唯一的结构化连接选择。 */ ProviderFamilyConnectionSelectionSettings;
  providerFamilyDomain?: /* 用户通过 WelcomeScreen 成功连接后确认的 ZAI / BigModel provider family 运行域。 */ ProviderFamilyDomain;
  providerFamilyDomainUpdatedAt?: /* 最近一次设置或清空 providerFamilyDomain 的时间。 */ number;
  providerFamilyDomainMigrated?: /* 旧 oauth/provider 状态是否已经尝试迁移到 providerFamilyDomain。 */ boolean;
  nativeSearchEnhancementsEnabled?: /* 新建或冷恢复 Session 是否为 Bash 注入 bfs/ugrep 增强；默认启用。 */ boolean;
  memoryEnabled?: /* 新建或冷恢复 Session 是否启用 Memory；默认关闭。 */ boolean;
  onboardingOccupation?: /* 字段类型 */
    | "office" // 分支形态
    | "developer" // 分支形态
    | "independent" // 分支形态
    | "infrastructure" // 分支形态
    | "product" // 分支形态
    | "design" // 分支形态
    | "student" // 分支形态
    | "creator" // 分支形态
    | "operations" // 分支形态
    | "marketing" // 分支形态
    | "finance" // 分支形态
    | "accounting" // 分支形态
    | "legal" // 分支形态
    | "other" // 分支形态
    | null; // 分支形态
  studioFirstRunGuideStatus?: /* 本机首次接入引导；legacy 表示升级前已有设置，不补弹新手引导。 */ | "pending"
    | "deferred" // 分支形态
    | "complete" // 分支形态
    | "legacy"; // 分支形态
  proactiveSuggestionsEnabled?: /* 布尔 */ boolean;
  lastWorkspaceSession?: /* 上次关闭时的完整 workspace 会话（含本地与远端 workspace） */ PersistedWorkspaceSessionEntry[];
  lastActiveTabIndex?: /* 上次关闭时激活的 tab 索引 */ number;
  lastActiveTaskByWorkspace?: /* 每个 workspace 的最后活跃 taskId，下次打开自动恢复 */ Record<
    string,
    string
  >;
  dataBaseDir?: /* 数据目录的根路径（替代 homedir），默认为 os.homedir()；.knorvia-studio/v2 后缀不变 */ string;
  // 自动更新安装完成后，等待首次启动展示的版本说明。
  pendingPostUpdateReleaseNotes?: {
    version: /* 文本 */ string;
    title: /* 文本 */ string;
    markdown: /* 文本 */ string;
    releaseDate?: /* 文本 */ string;
    releaseNotesByLocale?: /* 文本 */ Partial<Record<Locale, { title: string; markdown: string }>>;
  };
  receivePreviewUpdates?: /* 设置页“接收 preview 自动更新”偏好；仅桌面端自动更新读取。 */ boolean;
  autoDownloadAndInstallUpdates?: /* 设置页/更新弹窗“以后自动下载并安装更新”偏好；仅桌面端自动更新读取。 */ boolean;
  skippedElectronUpdateVersions?: /* 用户跳过的 Electron 自动更新版本；按通道隔离，避免 stable / preview 互相遮挡。 */ Partial<
    Record<ElectronReleaseChannel, string>
  >;
  settingsSyncFirstRunPromptHandled?: /* 首次启动设置同步提示是否已消费；只表示弹窗不再出现，不代表导入成功。 */ boolean;
}
