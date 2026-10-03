// Source-exposed compatibility fixture. Every response port is synthetic.
import { readFile } from "node:fs/promises";
import type { PermissionBrokerPort } from "@knorvia/contracts";
import type { ToolEntry as LocalToolEntry, ToolExecutionContext } from "../src/tool/types.js";
import { invocation } from "./tool-invocation-fixture.js";

const emitted = process.env.KNORVIA_ASK_QUESTION_TEST_EMITTED === "1";
const extension = emitted ? "js" : "ts";
const coreRoot = emitted ? "../dist/" : "../src/";
const bootstrapRoot = emitted ? "../../bootstrap/dist/" : "../../bootstrap/src/";
const moduleAt = (root: string, path: string) =>
  import(new URL(`${root}${path}.${extension}`, import.meta.url).href);
export const { askUserQuestionToolEntry: entry } = (await moduleAt(
  coreRoot,
  "tool/handlers/ask-user-question",
)) as { askUserQuestionToolEntry: LocalToolEntry };
export const handlers = await moduleAt(coreRoot, "tool/handlers/index");
export const registryModule = await moduleAt(coreRoot, "tool/registry");
export const { executeToolCall } = await moduleAt(coreRoot, "tool/executor/call-runner");
export const { PermissionService } = await moduleAt(coreRoot, "permission/service");
export const { PermissionPreparation } = await moduleAt(coreRoot, "permission/prepared-request");
export const { ToolDeadline } = await moduleAt(coreRoot, "tool/executor/timeout");
export const protocol = (await moduleAt(
  bootstrapRoot,
  "protocol/interaction-question-response",
)) as typeof import("../../bootstrap/src/protocol/interaction-question-response.js");
export const ui = await import("../../../../../packages/ui/src/lib/askUserQuestion.js");

export const frozen = JSON.parse(
  await readFile(new URL("./ask-user-question-contract.json", import.meta.url), "utf8"),
) as {
  baseline: string;
  entryKeys: string[];
  declaration: Record<string, unknown>;
  cases: {
    label: string;
    input?: unknown;
    output?: unknown;
    modelContent?: string;
    error?: Record<string, unknown>;
  }[];
  rawCases: {
    label: string;
    output?: unknown;
    modelContent?: string;
    error?: Record<string, unknown>;
  }[];
};

export function errorShape(error: unknown): Record<string, unknown> {
  const value = error as Error & {
    type?: string;
    code?: string;
    context?: unknown;
    recoverable?: boolean;
    retryable?: boolean;
  };
  return JSON.parse(
    JSON.stringify({
      name: value.name,
      type: value.type,
      code: value.code,
      message: value.message,
      context: value.context,
      recoverable: value.recoverable,
      retryable: value.retryable,
    }),
  );
}

export function directContext(): ToolExecutionContext {
  return { toolCallId: "example-question-call" } as ToolExecutionContext;
}

export function questionInvocation(
  input: unknown = frozen.cases.find((c) => c.label === "complete")!.input,
) {
  const { handler, ...declaration } = entry;
  const f = invocation(declaration);
  f.behavior.handler = handler;
  f.call.input = structuredClone(input);
  f.behavior.decision = "ask";
  f.behavior.reply = { decision: "modify", modifiedInput: structuredClone(input) };
  const requests: {
    request: Parameters<PermissionBrokerPort["preparePermission"]>[0];
    options: Parameters<PermissionBrokerPort["preparePermission"]>[1];
  }[] = [];
  const response = { read: async () => f.behavior.reply };
  f.deps.permissionBroker = {
    async requestPermission() {
      throw new Error("Use synthetic preparePermission");
    },
    async preparePermission(request, options) {
      f.timeline.push("prepare");
      requests.push({ request, options });
      return new PermissionPreparation({
        signal: options?.signal,
        cancelled: () => new Error("Example question interaction cancelled"),
        activate: async (owner: { resolve: (value: typeof f.behavior.reply) => void }) => {
          f.timeline.push("activate");
          owner.resolve(await response.read());
        },
      });
    },
  };
  return {
    ...f,
    requests,
    response,
    execute: (options?: Parameters<typeof f.run>[0]) => f.run(options, executeToolCall),
  };
}
