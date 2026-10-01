// Frozen after source exposure; this fixture makes no license determination.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { ModelCatalogEntry, ModelCatalogPort } from "@knorvia/contracts";
import type { ToolEntry, ToolExecutionContext } from "../src/tool/types.js";
import { invocation } from "./tool-invocation-fixture.js";

const emitted = process.env.KNORVIA_MODEL_CATALOG_TEST_EMITTED === "1";
const root = emitted ? "../dist/" : "../src/";
const extension = emitted ? "js" : "ts";
const moduleAt = (path: string) =>
  import(new URL(`${root}${path}.${extension}`, import.meta.url).href);
export const { listModelsToolEntry: entry } = (await moduleAt("tool/handlers/list-models")) as {
  listModelsToolEntry: ToolEntry;
};
export const reference = (await moduleAt(
  "tool/handlers/model-reference",
)) as typeof import("../src/tool/handlers/model-reference.js");
export const handlers = await moduleAt("tool/handlers/index");
export const registryModule = await moduleAt("tool/registry");
export const { executeToolCall } = await moduleAt("tool/executor/call-runner");
export const createSource = (await moduleAt(
  "tool/handlers/create-workflow-source",
)) as typeof import("../src/tool/handlers/create-workflow-source.js");
export const amendSource = (await moduleAt(
  "tool/handlers/amend-workflow-resolve",
)) as typeof import("../src/tool/handlers/amend-workflow-resolve.js");
export const permissionModule = await moduleAt("permission/service");
export const frozen = JSON.parse(
  await readFile(new URL("./model-catalog-contract.json", import.meta.url), "utf8"),
) as {
  baseline: string;
  entryKeys: string[];
  declaration: Record<string, unknown>;
  moduleExports: string[];
  missingPort: unknown;
  catalogs: Record<string, ModelCatalogEntry[]>;
  listCases: {
    label: string;
    entries: ModelCatalogEntry[];
    output: unknown;
    modelContent: string;
  }[];
  referenceCases: {
    label: string;
    catalog: string;
    text: string;
    result: ReturnType<typeof reference.resolveModelReference>;
    entryIndex?: number;
    candidateIndices?: number[];
  }[];
  parseCases: {
    canonical: string;
    selection?: unknown;
    error?: { name: string; message: string; causeName: string; causeMessage: string };
  }[];
};

export function catalogFixture(initial: ModelCatalogEntry[] = []) {
  const calls: unknown[][] = [];
  const state = { entries: initial, read: () => state.entries };
  const port: ModelCatalogPort = {
    listModels(...args: []) {
      assert.equal(this, port);
      calls.push(args);
      return state.read();
    },
  };
  const context: ToolExecutionContext = {
    toolCallId: "example-catalog-call",
    traceId: "example-catalog-trace",
    sessionId: "example-catalog-session",
    workingDirectory: "/example/workspace",
    workspaceRoot: "/example/workspace",
    abortSignal: new AbortController().signal,
    modelCatalogPort: port,
  };
  return { port, state, calls, context };
}

export function catalogExecutor(initial: ModelCatalogEntry[] = []) {
  const { handler, ...declaration } = entry;
  const f = invocation(declaration);
  f.behavior.handler = handler;
  const direct = catalogFixture(initial);
  f.call.input = {};
  f.deps.modelCatalogPort = direct.port;
  return {
    ...f,
    direct,
    execute: (options?: Parameters<typeof f.run>[0]) => f.run(options, executeToolCall),
  };
}
