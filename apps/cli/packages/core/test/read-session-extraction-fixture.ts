// Source-exposed compatibility fixture; all sessions and model responses are synthetic.
import assert from "node:assert/strict";
import { mock } from "node:test";
import { getCurrentModelInvocationContext } from "@knorvia/contracts";
import type {
  SessionContextMaterial,
  TranscriptChunk,
} from "../src/session-context/read-session-context.js";
import type { ToolEntry, ToolExecutionContext } from "../src/tool/types.js";

const emitted = process.env.KNORVIA_SESSION_EXTRACTION_TARGET === "dist";
const root = emitted ? "../dist/" : "../src/";
const ext = emitted ? "js" : "ts";
const materialUrl = new URL(`${root}session-context/read-session-context.${ext}`, import.meta.url)
  .href;
export const actualMaterial = await import(materialUrl);
export const active = { material: undefined as SessionContextMaterial | undefined };
mock.module(materialUrl, {
  namedExports: {
    ...actualMaterial,
    buildSessionContextMaterial: (input: unknown) =>
      active.material ?? actualMaterial.buildSessionContextMaterial(input),
  },
});
export const handlerUrl = new URL(
  `${root}tool/handlers/read-session-context.${ext}`,
  import.meta.url,
).href;
export const entry = (await import(handlerUrl)).readSessionContextToolEntry as ToolEntry;
export const valid = { sessionId: "sess_owned", query: "fixed query evidence" };
export function material(count = 0): SessionContextMaterial {
  const chunks: TranscriptChunk[] = Array.from({ length: count }, (_, index) => ({
    index,
    startMessageIndex: index * 2,
    endMessageIndex: index * 2 + 1,
    messageCount: 2,
    content: `owned material ${index}`,
    searchText: "owned",
    score: 1,
    references: [],
  }));
  return {
    allContent: "owned cleaned transcript",
    allContentChars: count ? 80001 : 80000,
    chunks,
    selectedChunks: chunks,
    localContent: "owned local fallback",
    messageCount: 15,
    readableMessageCount: 10,
    selectedMessageCount: 5,
    truncated: false,
    references: [],
  };
}
export function fixture(m = material()) {
  active.material = m;
  const calls: { input: any; invocation: any }[] = [];
  const order: string[] = [];
  const controller = new AbortController();
  const responses: (string | Error | (() => Promise<string> | string))[] = [];
  const session = { id: "sess_owned", title: "Owned fixture", directory: "/example/project" };
  const store = {
    async getSession(id: string) {
      assert.equal(this, store);
      assert.equal(id, session.id);
      order.push("get");
      return session;
    },
    async messages(input: unknown) {
      assert.equal(this, store);
      assert.deepEqual(input, { sessionID: session.id });
      order.push("messages");
      return [];
    },
  };
  const model = {
    optionSpecs: { reasoningLevel: { values: ["low", "high"] }, maxOutputTokens: { max: 9000 } },
    async generateText(input: any) {
      assert.equal(this, model);
      order.push("model");
      calls.push({ input, invocation: getCurrentModelInvocationContext() });
      const value = responses.shift() ?? "owned extracted answer";
      if (value instanceof Error) throw value;
      return { text: typeof value === "function" ? await value() : value };
    },
  };
  const context = {
    sessionStore: store,
    model,
    abortSignal: controller.signal,
    sessionId: "sess_caller",
    toolCallId: "call_owned",
    traceId: "trace_owned",
    spanId: "span_owned",
    parentSpanId: "parent_owned",
    turnId: "turn_owned",
  } as unknown as ToolExecutionContext;
  return {
    m,
    calls,
    order,
    controller,
    responses,
    session,
    store,
    model,
    context,
    run: (input: unknown = valid) => entry.handler(input, context) as Promise<any>,
  };
}
