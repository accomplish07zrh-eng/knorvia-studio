// Exposed-source behavioral replacement; retained contracts are documented in
// specs/knorvia-skill-tool-execution.md. No new license determination.
import {
  CoreErrorType,
  SkillInputSchema,
  createCoreError,
  type SkillContent,
  type SkillLoadRequest,
  type SkillTelemetryMetadata,
} from "@knorvia/contracts";
import type { ToolExecutionContext, ToolHandler } from "../types.js";
import { projectSkillInstructions } from "./skill-instructions.js";

export const SKILL_CONTENT_LIMIT = 100_000;

/**
 * Local effect contract: request and metadata reads are deferred to their owner.
 * The interpreter supplies SkillContent only after load succeeds; observation has
 * no reply. No operation is retried and no state survives a call.
 */
type SkillEffect =
  | { kind: "load"; request: () => SkillLoadRequest }
  | { kind: "observe"; metadata: () => SkillTelemetryMetadata };

function* skillTransaction(
  input: unknown,
  context: ToolExecutionContext,
): Generator<SkillEffect, string, SkillContent | undefined> {
  const admitted = SkillInputSchema.parse(input);
  const loaded = (yield {
    kind: "load",
    request: () => ({
      name: admitted.skill,
      workingDirectory: context.workingDirectory,
      maxBytes: SKILL_CONTENT_LIMIT,
      trace: {
        traceId: context.traceId,
        spanId: context.spanId,
        parentSpanId: context.parentSpanId,
        sessionId: context.sessionId,
        turnId: context.turnId,
      },
    }),
  }) as SkillContent;

  yield {
    kind: "observe",
    metadata: () => {
      const metadata: SkillTelemetryMetadata = {};
      if (loaded.metadata.qualifiedName) metadata.qualifiedName = loaded.metadata.qualifiedName;
      if (loaded.metadata.pluginId) metadata.pluginId = loaded.metadata.pluginId;
      metadata.source = loaded.metadata.source;
      return metadata;
    },
  };
  return projectSkillInstructions(loaded);
}

/** The only asynchronous boundary here is the existing SkillPort. */
export const executeSkill: ToolHandler = async (input, context) => {
  const transaction = skillTransaction(input, context);
  let step = transaction.next();
  while (!step.done) {
    const effect = step.value;
    if (effect.kind === "observe") {
      context.recordSkillTelemetryMetadata?.(effect.metadata());
      step = transaction.next();
      continue;
    }

    const port = context.skillPort;
    if (!port) {
      throw createCoreError(
        CoreErrorType.ConfigurationError,
        "SkillPort is not configured for Skill tool",
        {
          recoverable: false,
          context: { toolCallId: context.toolCallId, toolName: "Skill" },
        },
      );
    }
    const content = await port.loadSkill(effect.request(), { signal: context.abortSignal });
    step = transaction.next(content);
  }
  return step.value;
};
