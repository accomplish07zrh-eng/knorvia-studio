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
import type { Budget, HookRunnerSetup, HookSourceEvent } from "./configured-runner-types.js";

const USER_SOURCE_KIND: HookSourceKind = "user";

function configSource(input: {
  event: HookSourceEvent;
  hookIndex: number;
  matcherIndex: number;
  plugin?: HookConfig["plugin"];
}): string {
  const { event, hookIndex, matcherIndex, plugin } = input;
  return plugin
    ? `plugin.${plugin.id}.${event}.${matcherIndex}.${hookIndex}`
    : `config.${event}.${matcherIndex}.${hookIndex}`;
}

/** 登记项输入形状的本地别名：类型本体在 configured-runner-types.ts，避免动导入块。 */
type HookRegistrationInput = import("./configured-runner-types.js").HookRegistrationInput;

/** 单条配置 Hook → 登记项。`async` 只对 command 类型成立。 */
function registrationFromHook(input: HookRegistrationInput): HookRegistration {
  const { budget, event, hook, hookIndex, matcher, matcherIndex, options } = input;
  const registrationEntries: Array<[string, unknown]> = [
    ["async", hook.type === "command" && hook.async === true],
    [
      "callback",
      createConfiguredHookCallback({
        budget,
        event: event,
        hook: hook,
        hookIndex: hookIndex,
        matcherIndex: matcherIndex,
        options: options,
      }),
    ],
    ["event", event],
    ["matcher", matcher],
    ["source", input.source],
    ["sourceKind", input.sourceKind],
    ["timeoutMs", budget.timeoutMs],
  ];
  if (input.admission) registrationEntries.push(["admission", input.admission]);
  return {
    ...(Object.fromEntries(registrationEntries) as Omit<HookRegistration, "descriptor">),
    descriptor: (hookInput) => {
      const workingDirectory = options.getWorkingDirectory();
      const expandDisplayValue = (value: string): string => {
        try {
          return expandPluginVariables(value, hook.plugin, hookInput, workingDirectory);
        } catch {
          // 展示元数据不得引入新的执行失败：展不开就按原样展示。
          return String(value);
        }
      };
      return createHookExecutionDescriptor(hook, budget.timeoutMs, expandDisplayValue);
    },
  };
}

function registrationsForMatcher(input: {
  options: HookRunnerSetup;
  event: HookSourceEvent;
  matcherConfig: HookMatcherConfig;
  matcherIndex: number;
}): HookRegistration[] {
  const { options, event, matcherConfig, matcherIndex } = input;
  const maxBytes = resolveWorkspaceHookMaxOutputBytes(options.config.maxOutputBytes);
  const matcherHooks = matcherConfig.hooks;
  return matcherHooks.flatMap((hook, hookIndex) => {
    const disabledHook = hook.enabled === false;
    if (disabledHook) return [];
    const pluginSource = hook.plugin ? "plugin" : undefined;
    const sourceKind = pluginSource ?? hook.source?.kind ?? "internal";
    return [
      registrationFromHook({
        budget: {
          maxOutputBytes: maxBytes,
          timeoutMs: resolveHookTimeoutMs(hook, options.config.timeoutMs),
        },
        event,
        hook,
        hookIndex,
        matcher: matcherConfig.matcher,
        matcherIndex,
        options,
        source: configSource({
          event: event,
          hookIndex: hookIndex,
          matcherIndex: matcherIndex,
          plugin: hook.plugin,
        }),
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
      registrations.push(
        ...registrationsForMatcher({
          options: options,
          event: event,
          matcherConfig: matcherConfig,
          matcherIndex: matcherIndex,
        }),
      );
    }
  }
  return registrations;
}

/** workspace 快照条目 → HookConfig（两种类型的字段集合不同，分开构造）。 */
function workspaceEntryConfig(
  snapshot: NonNullable<ConfiguredHookRunnerOptions["workspaceHookSnapshot"]>,
  entry: CanonicalWorkspaceHookEntry,
): HookConfig {
  const entrySourcePath = snapshot.sourceFiles[entry.sourceFileIndex]?.canonicalPath;
  const commonFields: Array<[string, unknown]> = [["command", entry.command]];
  commonFields.push([
    "source",
    { kind: "project" as const, ...(entrySourcePath ? { path: entrySourcePath } : {}) },
  ]);
  if (entry.statusMessage) commonFields.push(["statusMessage", entry.statusMessage]);
  commonFields.push(["timeoutMs", entry.resolvedTimeoutMs]);
  const common = Object.fromEntries(commonFields) as Omit<
    Extract<HookConfig, { type: "process" }>,
    "type" | "args"
  >;
  const buildCommand = (
    commandEntry: Extract<CanonicalWorkspaceHookEntry, { type: "command" }>,
    base: typeof common,
  ): HookConfig => {
    const extra: Array<[string, unknown]> = [["type", "command"]];
    if (commandEntry.async !== undefined) extra.push(["async", commandEntry.async]);
    if (commandEntry.shell !== undefined) extra.push(["shell", commandEntry.shell]);
    return { ...base, ...Object.fromEntries(extra) } as unknown as HookConfig;
  };

  const buildProcess = (
    processEntry: Extract<CanonicalWorkspaceHookEntry, { type: "process" }>,
    base: typeof common,
  ): HookConfig => {
    const extra: Array<[string, unknown]> = [["type", "process"]];
    if (processEntry.args) extra.push(["args", [...processEntry.args]]);
    return { ...base, ...Object.fromEntries(extra) } as unknown as HookConfig;
  };

  if (entry.type === "command") return buildCommand(entry, common);
  if (entry.type === "process") return buildProcess(entry, common);
  // 快照条目的 type 由契约限定为两种，走到这里说明上游多出了未支持的类型。
  throw new Error("Unsupported workspace Hook entry type");
}

function workspaceRegistrations(options: ConfiguredHookRunnerOptions): HookRegistration[] {
  const { workspaceHookAdmission: admission, workspaceHookSnapshot: snapshot } = options;
  const hasWorkspaceHooks = admission !== undefined && snapshot !== undefined;
  if (!hasWorkspaceHooks) return [];

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
