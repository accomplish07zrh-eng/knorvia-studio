import assert from "node:assert/strict";
import { mock, test } from "node:test";

test("synthetic head preserves visible data, first workspace and extended-array semantics", async () => {
  const titles: unknown[][] = [];
  mock.module(new URL("../src/session/sessionTitle.ts", import.meta.url).href, {
    namedExports: {
      deriveSessionTitle: (text: string, attachments: unknown[]) => {
        titles.push([text, attachments]);
        return text.length > 50 ? `${text.slice(0, 50)}...` : text;
      },
    },
  });
  const owner = await import("../src/session/claude-native/claudeNativeSessionHeadParser.js");
  const hidden = {
    type: "user",
    cwd: "/synthetic-hidden",
    isMeta: true,
    message: { content: "invisible" },
  };
  const assistant = {
    type: "assistant",
    message: {
      cwd: " /synthetic-first ",
      content: [
        { type: "text", text: "visible" },
        { type: "tool_use", text: "hidden" },
      ],
    },
  };
  const user = {
    type: "user",
    isSidechain: true,
    cwd: "/synthetic-later",
    timestamp: "invalid",
    createdAt: "1700000000.125",
    message: {
      content: [
        "<IDE_OPENED_FILE>hidden</ide_opened_file> first\r\nline ",
        { type: "tool_result", text: "secret tool result" },
        { text: " ", content: "<command-a>hidden</local-command-b> second" },
      ],
    },
  };
  const before = structuredClone([hidden, assistant, user]);
  const result = owner.extractClaudeNativeSessionHeadInfo([hidden, assistant, user]);
  assert.deepEqual(result, {
    workspacePath: "/synthetic-first",
    previewTitle: "first\nline\n\nsecond",
    createdAt: 1700000000125,
  });
  assert.deepEqual(Object.keys(result), ["workspacePath", "previewTitle", "createdAt"]);
  assert.deepEqual([hidden, assistant, user], before);
  assert.deepEqual(titles[0], ["first\nline\n\nsecond", []]);
  assert.equal(owner.hasClaudeNativeSidechainMarker([hidden, assistant, user]), true);
  const holes: Record<string, unknown>[] = [];
  holes.length = 2;
  holes[1] = { request: { isSidechain: "true" } };
  assert.equal(owner.hasClaudeNativeSidechainMarker(holes), false);
  assert.throws(() => owner.extractClaudeNativeSessionHeadInfo(holes), TypeError);

  const changes = ["first", "second"];
  Object.defineProperty(changes, "0", {
    get() {
      delete changes[1];
      changes.push("out of starting range");
      return "first";
    },
  });
  assert.equal(
    owner.extractClaudeNativeSessionHeadInfo([{ type: "user", message: { content: changes } }])
      .previewTitle,
    "first",
  );
  const observed: string[] = [];
  const extended = new Proxy(["x", "y"], {
    get(target, key, receiver) {
      observed.push(String(key));
      return Reflect.get(target, key, receiver);
    },
    has(target, key) {
      observed.push(`has:${String(key)}`);
      return Reflect.has(target, key);
    },
  });
  assert.equal(
    owner.extractClaudeNativeSessionHeadInfo([{ type: "user", message: { content: extended } }])
      .previewTitle,
    "x\n\ny",
  );
  assert.deepEqual(observed, ["flatMap", "length", "constructor", "has:0", "0", "has:1", "1"]);
  const customized: string[] = ["visible"];
  customized.flatMap = ((callback: (value: string) => unknown) => {
    assert.deepEqual(callback("visible"), ["visible"]);
    assert.deepEqual(callback(" "), []);
    return [
      { length: 0, toString: () => "discarded" },
      { length: 1, toString: () => "retained" },
    ];
  }) as never;
  assert.equal(
    owner.extractClaudeNativeSessionHeadInfo([{ type: "user", message: { content: customized } }])
      .previewTitle,
    "retained",
  );
  const emptyCustom: string[] = [];
  emptyCustom.flatMap = (() => ({
    filter: () => ({
      length: 0,
      join() {
        throw new Error("zero-length custom result must not be joined");
      },
    }),
  })) as never;
  assert.deepEqual(
    owner.extractClaudeNativeSessionHeadInfo([{ type: "user", message: { content: emptyCustom } }]),
    { workspacePath: undefined },
  );
  const emptyJoined: string[] = [];
  emptyJoined.flatMap = (() => ({ filter: () => ({ length: 1, join: () => "" }) })) as never;
  assert.deepEqual(
    owner.extractClaudeNativeSessionHeadInfo([
      { type: "user", cwd: "/hidden", message: { content: emptyJoined } },
    ]),
    { workspacePath: undefined },
  );
  const getterFailure = new Error("synthetic public getter failure");
  assert.throws(
    () =>
      owner.extractClaudeNativeSessionHeadInfo([
        {
          type: "user",
          isMeta: true,
          get message() {
            throw getterFailure;
          },
        },
      ]),
    (error) => error === getterFailure,
  );
  let messageReads = 0;
  let requestReads = 0;
  assert.equal(
    owner.hasClaudeNativeSidechainMarker([
      {
        isSidechain: true,
        get message() {
          messageReads++;
          return {};
        },
        get request() {
          requestReads++;
          return {};
        },
      },
    ]),
    true,
  );
  assert.deepEqual([messageReads, requestReads], [2, 2]);
  const failure = new Error("synthetic species denied");
  class Extended extends Array<string> {
    static get [Symbol.species](): ArrayConstructor {
      throw failure;
    }
  }
  assert.throws(
    () =>
      owner.extractClaudeNativeSessionHeadInfo([
        { type: "user", message: { content: new Extended("visible") } },
      ]),
    (error) => error === failure,
  );
});
