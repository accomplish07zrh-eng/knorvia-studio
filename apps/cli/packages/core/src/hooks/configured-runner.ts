// SPDX-License-Identifier: Apache-2.0
// 配置装配层：把 HooksRuntimeConfig 与 workspace 快照翻译成登记项列表，并按事件确定执行顺序。
// 这一层不触碰 I/O，也不持有状态；装配完成后执行只依赖登记项。
import {
  HookEventName,
  type CanonicalWorkspaceHookEntry,
  type HookConfig,
  type HookMatcherConfig,
  type HookSourceKind,
} from "@knorvia/contracts";
import { resolveWorkspaceHookMaxOutputBytes } from "@knorvia/shared/workspace-hook-discovery";
import { createConfiguredHookCallback } from "./configured-runner-callback.js";
import { expandPluginVariables, resolveHookTimeoutMs } from "./configured-runner-input.js";
import { createHookExecutionDescriptor } from "./display-metadata.js";
import { InMemoryHookRunner } from "./runner.js";
import type { ConfiguredHookRunnerOptions, HookRegistration, HookRunner } from "./types.js";

const USER_SOURCE_KIND: HookSourceKind = "user";

interface Budget {
  maxOutputBytes: number;
  timeoutMs: number;
}

function configSource(
  event: HookEventName,
  matcherIndex: number,
  hookIndex: number,
  plugin?: HookConfig["plugin"],
): string {
  return plugin
    ? `plugin.${plugin.id}.${event}.${matcherIndex}.${hookIndex}`
    : `config.${event}.${matcherIndex}.${hookIndex}`;
}

/** 登记项输入形状的本地别名：类型本体在 configured-runner-types.ts，避免动导入块。 */
type HookRegistrationInput = import("./configured-runner-types.js").HookRegistrationInput;

/** 单条配置 Hook → 登记项。`async` 只对 command 类型成立。 */
function registrationFromHook(input: HookRegistrationInput): HookRegistration {
  const { budget, event, hook, hookIndex, matcher, matcherIndex, options } = input;
  return {
    ...(input.admission ? { admission: input.admission } : {}),
    async: hook.type === "command" && hook.async === true,
    callback: createConfiguredHookCallback({
      budget,
      event,
      hook,
      hookIndex,
      matcherIndex,
      options,
    }),
    descriptor: (hookInput) =>
      createHookExecutionDescriptor(hook, budget.timeoutMs, (value) => {
        try {
          return expandPluginVariables(
            value,
            hook.plugin,
            hookInput,
            options.getWorkingDirectory(),
          );
        } catch {
          // 展示元数据不得引入新的执行失败。
          return value;
        }
      }),
    event,
    matcher,
    source: input.source,
    sourceKind: input.sourceKind,
    timeoutMs: budget.timeoutMs,
  };
}

function registrationsForMatcher(
  options: ConfiguredHookRunnerOptions,
  event: HookEventName,
  matcherConfig: HookMatcherConfig,
  matcherIndex: number,
): HookRegistration[] {
  const maxOutputBytes = resolveWorkspaceHookMaxOutputBytes(options.config.maxOutputBytes);
  return matcherConfig.hooks.flatMap((hook, hookIndex) => {
    if (hook.enabled === false) return [];
    const sourceKind = hook.plugin ? "plugin" : (hook.source?.kind ?? "internal");
    return [
      registrationFromHook({
        budget: { maxOutputBytes, timeoutMs: resolveHookTimeoutMs(hook, options.config.timeoutMs) },
        event,
        hook,
        hookIndex,
        matcher: matcherConfig.matcher,
        matcherIndex,
        options,
        source: configSource(event, matcherIndex, hookIndex, hook.plugin),
        sourceKind,
      }),
    ];
  });
}

function configuredRegistrations(options: ConfiguredHookRunnerOptions): HookRegistration[] {
  if (!options.config.enabled) return [];
  const registrations: HookRegistration[] = [];
  for (const [eventName, matcherConfigs] of Object.entries(options.config.events)) {
    const event = eventName as HookEventName;
    for (const [matcherIndex, matcherConfig] of (matcherConfigs ?? []).entries()) {
      registrations.push(...registrationsForMatcher(options, event, matcherConfig, matcherIndex));
    }
  }
  return registrations;
}

/** 两种类型的字段集合不同：按 `entry.type` 查表构造，公共字段先归约成条目。 */
const WORKSPACE_ENTRY_BUILDERS = new Map<
  string,
  (entry: CanonicalWorkspaceHookEntry, common: Record<string, unknown>) => HookConfig
>([
  [
    "command",
    (entry, common) => {
      const extra: (readonly [string, unknown])[] = [["type", "command"]];
      if (entry.async !== undefined) extra.push(["async", entry.async]);
      if (entry.shell !== undefined) extra.push(["shell", entry.shell]);
      return Object.assign({}, common, Object.fromEntries(extra)) as HookConfig;
    },
  ],
  [
    "process",
    (entry, common) => {
      const extra: (readonly [string, unknown])[] = [["type", "process"]];
      if (entry.args) extra.push(["args", [...entry.args]]);
      return Object.assign({}, common, Object.fromEntries(extra)) as HookConfig;
    },
  ],
]);

/** workspace 快照条目 → HookConfig。 */
function workspaceEntryConfig(
  snapshot: NonNullable<ConfiguredHookRunnerOptions["workspaceHookSnapshot"]>,
  entry: CanonicalWorkspaceHookEntry,
): HookConfig {
  const sourcePath = snapshot.sourceFiles[entry.sourceFileIndex]?.canonicalPath;
  const commonEntries: (readonly [string, unknown])[] = [
    ["command", entry.command],
    ["source", { kind: "project", ...(sourcePath ? { path: sourcePath } : {}) }],
    ["timeoutMs", entry.resolvedTimeoutMs],
  ];
  if (entry.statusMessage) commonEntries.push(["statusMessage", entry.statusMessage]);
  const common = Object.fromEntries(commonEntries);

  const build = WORKSPACE_ENTRY_BUILDERS.get(entry.type);
  if (build === undefined) throw new Error(`Unsupported workspace Hook entry type: ${entry.type}`);
  return build(entry, common);
}

function workspaceRegistrations(options: ConfiguredHookRunnerOptions): HookRegistration[] {
  const { workspaceHookAdmission: admission, workspaceHookSnapshot: snapshot } = options;
  if (!admission || !snapshot) return [];

  return snapshot.hooks.flatMap((entry) => {
    const hook = workspaceEntryConfig(snapshot, entry);
    return [
      registrationFromHook({
        admission: () =>
          admission.evaluateDispatch({
            hookDeclarationDigest: entry.hookDeclarationDigest,
            reviewItemId: entry.reviewItemId,
          }),
        budget: {
          maxOutputBytes: entry.resolvedMaxOutputBytes,
          timeoutMs: entry.resolvedTimeoutMs,
        },
        event: entry.event,
        hook,
        hookIndex: entry.hookIndex,
        matcher: entry.matcher ?? undefined,
        matcherIndex: entry.matcherIndex,
        options,
        source: `project.${entry.reviewItemId}`,
        sourceKind: "project",
      }),
    ];
  });
}

/**
 * 项目 Hook 的相对顺序：同事件内插到「第一个非 user 登记项」之前；没有这样的项则追加到末尾。
 * 即项目 Hook 先于内部/插件配置项，但不会越过用户自己的 Hook。
 */
function withWorkspaceOrdering(
  configured: HookRegistration[],
  workspace: HookRegistration[],
): HookRegistration[] {
  const ordered = [...configured];
  for (const event of new Set(workspace.map((registration) => registration.event))) {
    const forEvent = workspace.filter((registration) => registration.event === event);
    const insertAt = ordered.findIndex(
      (registration) =>
        registration.event === event && registration.sourceKind !== USER_SOURCE_KIND,
    );
    if (insertAt < 0) ordered.push(...forEvent);
    else ordered.splice(insertAt, 0, ...forEvent);
  }
  return ordered;
}

/** 装配运行器；没有任何登记项时返回 undefined，让调用方跳过 hooks 执行路径。 */
export function createConfiguredHookRunner(
  options: ConfiguredHookRunnerOptions,
): HookRunner | undefined {
  const hooks = withWorkspaceOrdering(
    configuredRegistrations(options),
    workspaceRegistrations(options),
  );
  if (hooks.length === 0) return undefined;

  return new InMemoryHookRunner({
    defaultTimeoutMs: options.config.timeoutMs,
    emitEvent: options.emitEvent,
    hooks,
    logger: options.logger,
  });
}
