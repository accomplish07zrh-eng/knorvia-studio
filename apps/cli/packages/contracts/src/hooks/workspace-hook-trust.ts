import { z } from "zod";

export const WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_HOOK_REVIEW_TIMEOUT_MS = 10 * 60 * 1000;

/** 字段清单写成一段以空格分隔的文本再切开：字段名只有一处来源，改字段只改这一行。 */
function fieldList(source: string): readonly string[] {
  return source.split(" ");
}

/** hook 配置里各层允许出现的字段名。 */
export const WORKSPACE_HOOK_SCHEMA_FIELDS = {
  root: fieldList("enabled timeoutMs maxOutputBytes events"),
  matcher: fieldList("matcher hooks"),
  events: fieldList(
    "SessionStart UserPromptSubmit PreToolUse PermissionRequest PostToolUse PostToolUseFailure Stop",
  ),
  process: fieldList("type command enabled args timeoutMs statusMessage"),
  command: fieldList("type command enabled async shell timeout timeoutMs statusMessage"),
};

/** 取值 → 常量键：`pending_trust` → `PendingTrust`。 */
function toPascalKey(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

/** 由取值清单建常量表；键由取值推导，顺序即清单顺序。 */
function buildValueTable<const Values extends readonly string[]>(
  values: Values,
): {
  readonly [Value in Values[number] as Capitalize<Value> extends string ? string : string]: Value;
} {
  return Object.fromEntries(values.map((value) => [toPascalKey(value), value])) as never;
}

/** 信任状态的取值清单：常量表与 schema 都由它推出。 */
const WORKSPACE_HOOK_TRUST_STATE_NAMES = [
  "not_applicable",
  "pending_trust",
  "trusted_persistent",
  "blocked_untrusted",
  "blocked_policy",
  "revoked",
  "stale_digest",
] as const;

export const WorkspaceHookTrustState = Object.fromEntries(
  WORKSPACE_HOOK_TRUST_STATE_NAMES.map((value) => [toPascalKey(value), value]),
) as unknown as {
  readonly NotApplicable: "not_applicable";
  readonly PendingTrust: "pending_trust";
  readonly TrustedPersistent: "trusted_persistent";
  readonly BlockedUntrusted: "blocked_untrusted";
  readonly BlockedPolicy: "blocked_policy";
  readonly Revoked: "revoked";
  readonly StaleDigest: "stale_digest";
};
export type WorkspaceHookTrustState = (typeof WORKSPACE_HOOK_TRUST_STATE_NAMES)[number];

export const workspaceHookTrustStateSchema = z.enum(WORKSPACE_HOOK_TRUST_STATE_NAMES);

export const workspaceHookAdmissionClassSchema = z.enum([
  "not_applicable",
  "admitted",
  "pending",
  "blocked",
]);
export type WorkspaceHookAdmissionClass = z.infer<typeof workspaceHookAdmissionClassSchema>;

// 原因码取值。读取失败与写入失败必须可区分：config_write_failed 曾被 mutation 在
// readFile / JSON.parse 失败时抛出，误导用户去重试「写入」。
/** 原因码的字面量联合：按域分组，新增原因码只改这里与下面的清单文本。 */
export type WorkspaceHookReasonCode =
  // 准入与信任状态
  | "workspace_hooks_no_enabled_hooks"
  | "workspace_hooks_not_applicable"
  | "workspace_hooks_pending_trust"
  | "workspace_hooks_trusted_persistent"
  | "workspace_hooks_blocked_untrusted"
  | "workspace_hooks_blocked_by_policy"
  | "workspace_hooks_policy_requires_pretrust"
  | "workspace_hooks_revoked"
  | "workspace_hooks_feature_disabled"
  // 声明与 bundle 快照
  | "workspace_hook_declaration_changed"
  | "workspace_hooks_bundle_changed"
  | "workspace_hooks_snapshot_mismatch"
  | "workspace_hooks_unknown_execution_field"
  // 复核流程与宿主能力
  | "workspace_hooks_require_trust_capable_host"
  | "workspace_hooks_interaction_timeout"
  | "workspace_hooks_review_superseded"
  // 信任存储与配置读写
  | "workspace_hooks_trust_store_corrupt"
  | "workspace_hooks_config_write_failed"
  | "workspace_hooks_config_unreadable"
  | "workspace_hooks_config_rebuild_failed";

/** 原因码清单：一段以空格分隔的文本，顺序即联合里声明的顺序。 */
const WORKSPACE_HOOK_REASON_CODE_NAMES = (
  "workspace_hooks_no_enabled_hooks workspace_hooks_not_applicable workspace_hooks_pending_trust " +
  "workspace_hooks_trusted_persistent workspace_hooks_blocked_untrusted workspace_hooks_blocked_by_policy " +
  "workspace_hooks_policy_requires_pretrust workspace_hooks_revoked workspace_hooks_feature_disabled " +
  "workspace_hook_declaration_changed workspace_hooks_bundle_changed workspace_hooks_snapshot_mismatch " +
  "workspace_hooks_unknown_execution_field workspace_hooks_require_trust_capable_host " +
  "workspace_hooks_interaction_timeout workspace_hooks_review_superseded " +
  "workspace_hooks_trust_store_corrupt workspace_hooks_config_write_failed " +
  "workspace_hooks_config_unreadable workspace_hooks_config_rebuild_failed"
).split(" ") as readonly WorkspaceHookReasonCode[];

export const workspaceHookReasonCodeSchema = z.enum(
  WORKSPACE_HOOK_REASON_CODE_NAMES as unknown as readonly [
    WorkspaceHookReasonCode,
    ...WorkspaceHookReasonCode[],
  ],
);

/** 准入结论的形状：状态 → 准入类别 + 是否可运行 + 原因码。 */
interface StateAdmission {
  admissionClass: WorkspaceHookAdmissionClass;
  effectiveRunnable: false | "configured";
  reasonCode: WorkspaceHookReasonCode;
}

/** 准入结论元组表：`[状态, 准入类别, 是否可运行, 原因码]`，一行一个状态。 */
const STATE_ADMISSION_ENTRIES: ReadonlyArray<
  readonly [
    WorkspaceHookTrustState,
    WorkspaceHookAdmissionClass,
    false | "configured",
    WorkspaceHookReasonCode,
  ]
> = [
  ["not_applicable", "not_applicable", false, "workspace_hooks_not_applicable"],
  ["pending_trust", "pending", false, "workspace_hooks_pending_trust"],
  ["trusted_persistent", "admitted", "configured", "workspace_hooks_trusted_persistent"],
  ["blocked_untrusted", "blocked", false, "workspace_hooks_blocked_untrusted"],
  ["blocked_policy", "blocked", false, "workspace_hooks_blocked_by_policy"],
  ["revoked", "pending", false, "workspace_hooks_revoked"],
  ["stale_digest", "pending", false, "workspace_hook_declaration_changed"],
];

/** 状态 → 准入结论；由元组表一次归约出来。 */
export const WORKSPACE_HOOK_STATE_ADMISSION_MAP = Object.fromEntries(
  STATE_ADMISSION_ENTRIES.map(([state, admissionClass, effectiveRunnable, reasonCode]) => [
    state,
    { admissionClass, effectiveRunnable, reasonCode },
  ]),
) as Record<WorkspaceHookTrustState, StateAdmission>;

// 基础字段类型：四个常量在本文件与 workspace-hook-trust-store.ts 之间保持同名同义。
const trimmedNonEmptyText = z.string().trim().min(1);
const hexDigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const strictlyPositiveIntSchema = z.number().int().positive();
const nonNegativeIntSchema = z.number().int().nonnegative();

/** 布尔字段；集中一处便于后续统一加描述。 */
function booleanSchema(): z.ZodBoolean {
  return z.boolean();
}

/** 加一条自定义 issue；四处校验只有 path 与 message 不同，骨架共用。 */
function addMismatchIssue(context: z.RefinementCtx, path: string, message: string): void {
  context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
}

export const workspaceHookEffectiveStateSchema = z
  .object({
    reviewItemId: trimmedNonEmptyText,
    sourceRootEnabled: booleanSchema(),
    declarationEnabled: booleanSchema(),
    runtimeHooksEnabled: booleanSchema(),
    configuredEnabled: booleanSchema(),
    editable: booleanSchema(),
    trustState: workspaceHookTrustStateSchema,
    admissionClass: workspaceHookAdmissionClassSchema,
    effectiveRunnable: booleanSchema(),
    workspaceIdentity: trimmedNonEmptyText.optional(),
    bundleDigest: hexDigestSchema.optional(),
    hookDeclarationDigest: hexDigestSchema.optional(),
    sourcePaths: z.array(trimmedNonEmptyText),
    reasonCode: workspaceHookReasonCodeSchema.optional(),
  })
  .strict()
  .superRefine((state, context) => {
    const expected = WORKSPACE_HOOK_STATE_ADMISSION_MAP[state.trustState];
    if (state.admissionClass !== expected.admissionClass) {
      addMismatchIssue(
        context,
        "admissionClass",
        `admissionClass must be ${expected.admissionClass} for ${state.trustState}`,
      );
    }
    if (state.reasonCode !== undefined && state.reasonCode !== expected.reasonCode) {
      addMismatchIssue(
        context,
        "reasonCode",
        `reasonCode must be ${expected.reasonCode} for ${state.trustState}`,
      );
    }
    if (expected.effectiveRunnable === false && state.effectiveRunnable) {
      addMismatchIssue(context, "effectiveRunnable", `${state.trustState} cannot be runnable`);
    }
    if (!state.configuredEnabled && state.effectiveRunnable) {
      addMismatchIssue(
        context,
        "effectiveRunnable",
        "a configured-disabled hook cannot be runnable",
      );
    }
  });
export type WorkspaceHookEffectiveState = z.infer<typeof workspaceHookEffectiveStateSchema>;

/** hook 事件名取值清单；schema 与配置字段清单共用它。 */
const WORKSPACE_HOOK_EVENT_NAMES = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
] as const;

export const workspaceHookEventNameSchema = z.enum(WORKSPACE_HOOK_EVENT_NAMES);

const canonicalEntryBaseShape = {
  reviewItemId: trimmedNonEmptyText,
  event: workspaceHookEventNameSchema,
  matcherIndex: nonNegativeIntSchema,
  hookIndex: nonNegativeIntSchema,
  sourceFileIndex: nonNegativeIntSchema,
  sourceRelativePath: trimmedNonEmptyText,
  matcher: z.string().nullable(),
  command: trimmedNonEmptyText,
  resolvedTimeoutMs: strictlyPositiveIntSchema,
  resolvedMaxOutputBytes: strictlyPositiveIntSchema,
  statusMessage: trimmedNonEmptyText.optional(),
  sourceRootEnabled: booleanSchema(),
  declarationEnabled: booleanSchema(),
  runtimeHooksEnabled: booleanSchema(),
  configuredEnabled: booleanSchema(),
  editable: booleanSchema(),
  declarationDigestAlgorithm: z.literal("sha256"),
  hookDeclarationDigest: hexDigestSchema,
} as const;

export const canonicalWorkspaceHookEntrySchema = z.discriminatedUnion("type", [
  z
    .object({
      ...canonicalEntryBaseShape,
      type: z.literal("command"),
      async: z.boolean().optional(),
      shell: z.union([z.literal(true), trimmedNonEmptyText]).optional(),
    })
    .strict(),
  z
    .object({
      ...canonicalEntryBaseShape,
      type: z.literal("process"),
      args: z.array(z.string()).optional(),
    })
    .strict(),
]);
export type CanonicalWorkspaceHookEntry = z.infer<typeof canonicalWorkspaceHookEntrySchema>;

export const workspaceHookBundleSnapshotSchema = z
  .object({
    schemaVersion: z.literal(WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION),
    workspaceIdentity: trimmedNonEmptyText,
    discoveredAt: z.string().datetime(),
    sourceFiles: z.array(
      z
        .object({
          canonicalPath: trimmedNonEmptyText,
          baseDir: trimmedNonEmptyText,
          discoveryOrder: nonNegativeIntSchema,
          configFileKind: z.enum(["knorvia.json", ".knorvia-studio/config.json", "explicit"]),
          explicitProjectConfig: booleanSchema(),
          editable: booleanSchema(),
          hooksRoot: z
            .object({
              enabled: z.boolean().optional(),
              timeoutMs: z.number().finite().positive().optional(),
              maxOutputBytes: z.number().finite().positive().optional(),
            })
            .strict(),
        })
        .strict(),
    ),
    hooks: z.array(canonicalWorkspaceHookEntrySchema),
    digestAlgorithm: z.literal("sha256"),
    bundleDigest: hexDigestSchema,
  })
  .strict();
export type WorkspaceHookBundleSnapshot = Readonly<
  z.infer<typeof workspaceHookBundleSnapshotSchema>
>;

export function createWorkspaceHookBundleSnapshot(value: unknown): WorkspaceHookBundleSnapshot {
  return deepFreeze(workspaceHookBundleSnapshotSchema.parse(value)) as WorkspaceHookBundleSnapshot;
}

export const workspaceHookReviewFlowStateSchema = z
  .object({
    reviewFlowId: trimmedNonEmptyText,
    generation: strictlyPositiveIntSchema,
    interactionId: trimmedNonEmptyText,
    sessionId: trimmedNonEmptyText,
    workspaceIdentity: trimmedNonEmptyText,
    bundleDigest: hexDigestSchema,
    state: z.enum(["pending", "resolved", "superseded", "cancelled", "timed_out"]),
    supersededByInteractionId: trimmedNonEmptyText.optional(),
    createdAt: nonNegativeIntSchema,
    deadlineAt: nonNegativeIntSchema,
  })
  .strict()
  .superRefine((flow, context) => {
    if (flow.deadlineAt < flow.createdAt) {
      addMismatchIssue(context, "deadlineAt", "deadlineAt must not precede createdAt");
    }
    const hasReplacement = Boolean(flow.supersededByInteractionId);
    if (flow.state === "superseded" && !hasReplacement) {
      addMismatchIssue(
        context,
        "supersededByInteractionId",
        "superseded flow requires its replacement interaction id",
      );
    }
    if (flow.state !== "superseded" && hasReplacement) {
      addMismatchIssue(
        context,
        "supersededByInteractionId",
        "only a superseded flow may reference a replacement interaction",
      );
    }
  });
export type WorkspaceHookReviewFlowState = z.infer<typeof workspaceHookReviewFlowStateSchema>;

export const workspaceHookSecurityRevisionSchema = z
  .object({ coordinatorEpoch: trimmedNonEmptyText, counter: nonNegativeIntSchema })
  .strict();
export type WorkspaceHookSecurityRevision = z.infer<typeof workspaceHookSecurityRevisionSchema>;

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
