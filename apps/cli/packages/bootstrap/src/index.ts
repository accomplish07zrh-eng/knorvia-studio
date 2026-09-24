// Bootstrap public API surface.

export * from "./app/create-app.js";
export type {
  ListKnorviaSessionsOptions,
  PromptInput,
  ResolveLatestSessionOptions,
  ResumeOptions,
  RunKnorviaProtocolAgentOptions,
  SendInputOptions,
  SendInputResult,
  SetLocaleResult,
  SteerTurnOptions,
  SubmitPromptOptions,
  UserPromptInput,
  KnorviaApp,
  KnorviaAppOptions,
  KnorviaModelOption,
} from "./app/types.js";
export {
  inspectKnorviaCustomCommand,
  listKnorviaCustomCommands,
  loadKnorviaCustomCommand,
} from "./custom-commands.js";
export type {
  InspectKnorviaCustomCommandOptions,
  ListKnorviaCustomCommandsOptions,
  KnorviaCustomCommandInspection,
} from "./custom-commands.js";
export { createModelAdapter } from "./model-factory.js";
export type { CreateModelAdapterOptions } from "./model-factory.js";
export { startProcessProviderRegistryRuntime } from "./app/process-provider-registry-runtime.js";
export type { ProcessProviderRegistryRuntimeOptions } from "./app/process-provider-registry-runtime.js";
export {
  addKnorviaPluginMarketplace,
  getKnorviaPluginsOverview,
  installKnorviaMarketplacePlugin,
  listKnorviaPlugins,
  removeKnorviaPluginMarketplace,
  resolveKnorviaPlugins,
  setKnorviaPluginEnabled,
  uninstallKnorviaMarketplacePlugin,
  updateKnorviaMarketplacePlugin,
  updateKnorviaPluginMarketplace,
  validateKnorviaPluginPath,
} from "./plugins.js";
export type {
  AddKnorviaMarketplaceOptions,
  InstallKnorviaMarketplacePluginOptions,
  ListKnorviaPluginsOptions,
  RemoveKnorviaMarketplaceOptions,
  ResolveKnorviaPluginsOptions,
  SetKnorviaPluginEnabledOptions,
  SetKnorviaPluginEnabledResult,
  UninstallKnorviaMarketplacePluginOptions,
  UpdateKnorviaMarketplaceOptions,
  UpdateKnorviaMarketplacePluginOptions,
  ValidateKnorviaPluginPathOptions,
  KnorviaAvailablePluginData,
  KnorviaInstalledPluginData,
  KnorviaMarketplaceSummaryData,
  KnorviaMarketplaceUpdateData,
  KnorviaPluginInstallData,
  KnorviaPluginUpdateData,
  KnorviaPluginsOverviewData,
} from "./plugins.js";
export { runKnorviaProtocolAgent } from "./protocol-entrypoint.js";
// Exposed for the CLI's --output-format stream-json: it needs the same event
// shape the protocol server emits, rather than inventing a second one.
export { mapSessionEvent } from "./protocol/session-mapper.js";
export { prepareKnorviaTelemetryEnv, shutdownKnorviaTelemetry } from "./telemetry-bootstrap.js";
export type { SessionTranscriptMessage, SessionTranscriptPart } from "./session-transcript.js";
export { listKnorviaSessions, resolveLatestSession } from "./sessions.js";
export { inspectKnorviaSkill, listKnorviaSkills } from "./skills.js";
export type {
  InspectKnorviaSkillOptions,
  ListKnorviaSkillsOptions,
  KnorviaSkillInspection,
} from "./skills.js";
// Exposed for the CLI's headless slash routing: it must decide "is this a real
// custom command?" with the *same* reserved-name gate the app facade's
// customCommandPromptResolver applies, or the two disagree and a reserved name
// reaches the model as literal prompt text. See prompt-command.ts.
export { isReservedKnorviaSlashCommandName } from "./slash-command-surface.js";
export {
  grantWorkspaceHookTrust,
  inspectWorkspaceHookTrust,
  revokeWorkspaceHookTrustCli,
} from "./workspace-hook-trust-cli.js";
export type {
  WorkspaceHookTrustCliItem,
  WorkspaceHookTrustCliStatus,
  WorkspaceHookTrustCliTarget,
} from "./workspace-hook-trust-cli.js";
