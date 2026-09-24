import type { TuiReadClipboardImage, TuiWriteClipboardText } from "@knorvia/tui";
import type { UiLocale } from "@knorvia/i18n";
import type { Logger } from "@knorvia/contracts";
import type {
  createManagedCdpBrowserRuntime,
  ManagedCdpBrowserRuntimeOptions,
} from "@knorvia/adapters/browser";
import type {
  createModelAdapter,
  createKnorviaApp,
  CreateModelAdapterOptions,
  inspectKnorviaSkill,
  inspectWorkspaceHookTrust,
  grantWorkspaceHookTrust,
  revokeWorkspaceHookTrustCli,
  inspectKnorviaCustomCommand,
  InspectKnorviaCustomCommandOptions,
  InspectKnorviaSkillOptions,
  listKnorviaCustomCommands,
  ListKnorviaCustomCommandsOptions,
  loadKnorviaCustomCommand,
  listKnorviaSessions,
  listKnorviaSkills,
  ListKnorviaSessionsOptions,
  ListKnorviaSkillsOptions,
  resolveLatestSession,
  ResolveLatestSessionOptions,
  RunKnorviaProtocolAgentOptions,
  prepareKnorviaTelemetryEnv,
  startProcessProviderRegistryRuntime,
  shutdownKnorviaTelemetry,
  KnorviaAppOptions,
} from "@knorvia/bootstrap";
import type { CliEnv, DotenvLoadResult, LoadCliDotenvOptions } from "./env.js";
import type { PluginsCommandOverrides } from "./plugins-command.js";
import type { CliShutdownProcess } from "./shutdown.js";
import type { resolveWorkspaceGitBranch } from "./tui-workspace-git.js";

export type BootstrapModule = typeof import("@knorvia/bootstrap");

export interface RunDependencies extends PluginsCommandOverrides {
  protocolLifecycle?: RunKnorviaProtocolAgentOptions["lifecycle"];
  protocolInput?: NodeJS.ReadableStream;
  createManagedCdpBrowserRuntime?: (
    options?: ManagedCdpBrowserRuntimeOptions,
  ) => ReturnType<typeof createManagedCdpBrowserRuntime>;
  createModelAdapter?: (
    options?: CreateModelAdapterOptions,
  ) => ReturnType<typeof createModelAdapter>;
  createKnorviaApp?: (
    options?: KnorviaAppOptions,
  ) => Awaited<ReturnType<typeof createKnorviaApp>> | ReturnType<typeof createKnorviaApp>;
  /**
   * Session-event shaper for --output-format stream-json. Defaults to the
   * bootstrap module's, which is also what the protocol server uses; injectable
   * so a caller that supplies its own `createKnorviaApp` (tests, embedders) can
   * still stream, since the bootstrap module is not loaded on that path.
   */
  mapSessionEvent?: BootstrapModule["mapSessionEvent"];
  cwd?: () => string;
  env?: CliEnv;
  inspectSkill?: (options: InspectKnorviaSkillOptions) => ReturnType<typeof inspectKnorviaSkill>;
  inspectWorkspaceHookTrust?: typeof inspectWorkspaceHookTrust;
  grantWorkspaceHookTrust?: typeof grantWorkspaceHookTrust;
  revokeWorkspaceHookTrustCli?: typeof revokeWorkspaceHookTrustCli;
  inspectCustomCommand?: (
    options: InspectKnorviaCustomCommandOptions,
  ) => ReturnType<typeof inspectKnorviaCustomCommand>;
  loadDotenv?: (options?: LoadCliDotenvOptions) => DotenvLoadResult;
  prepareKnorviaTelemetryEnv?: typeof prepareKnorviaTelemetryEnv;
  projectConfigPath?: string;
  listSessions?: (options: ListKnorviaSessionsOptions) => ReturnType<typeof listKnorviaSessions>;
  listCustomCommands?: (
    options: ListKnorviaCustomCommandsOptions,
  ) => ReturnType<typeof listKnorviaCustomCommands>;
  loadCustomCommand?: (
    options: InspectKnorviaCustomCommandOptions,
  ) => ReturnType<typeof loadKnorviaCustomCommand>;
  // headless slash 路由要和 app facade 的保留名 gate 用同一个判据；默认取 bootstrap 的，
  // 注入点只为让单测不必拉起整个 bootstrap 模块。见 prompt-command.ts。
  isReservedSlashCommandName?: BootstrapModule["isReservedKnorviaSlashCommandName"];
  listSkills?: (options: ListKnorviaSkillsOptions) => ReturnType<typeof listKnorviaSkills>;
  logger?: Logger;
  readClipboardImage?: TuiReadClipboardImage;
  writeClipboardText?: TuiWriteClipboardText;
  resolveLatestSession?: (
    options: ResolveLatestSessionOptions,
  ) => ReturnType<typeof resolveLatestSession>;
  resolveWorkspaceGitBranch?: typeof resolveWorkspaceGitBranch;
  runKnorviaProtocolAgent?: (options?: RunKnorviaProtocolAgentOptions) => Promise<void>;
  runTui?: typeof import("@knorvia/tui").runTui;
  skipUserConfig?: boolean;
  userConfigPath?: string;
  exitProcess?: (code: number) => void;
  shutdownCleanupTimeoutMs?: number;
  shutdownProcess?: CliShutdownProcess;
  startProcessProviderRegistryRuntime?: typeof startProcessProviderRegistryRuntime;
  shutdownKnorviaTelemetry?: typeof shutdownKnorviaTelemetry;
}

export type CliPermissionMode = "build" | "plan" | "edit" | "yolo";
export type CliRuntimeMode = CliPermissionMode | "auto";

export interface CliModeState {
  current?: CliRuntimeMode;
  override?: CliPermissionMode;
}

export interface CliTargetRequest {
  objective: string;
  replaceExisting: boolean;
}

export type ModeCapableApp = Awaited<ReturnType<typeof createKnorviaApp>> & {
  getMode?: () => CliRuntimeMode;
  setLocale?: (locale: UiLocale) => Promise<{ locale: "en-US" | "zh-CN" }>;
  setMode?: (mode: CliRuntimeMode) => Promise<{ mode: CliRuntimeMode }>;
};

export interface CliResumeRequest {
  continueSession: boolean;
  resumeSessionId?: string;
}
