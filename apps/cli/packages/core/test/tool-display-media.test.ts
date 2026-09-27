// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { CUA_REQUEST_ACCESS_STATUS_META_KEY } from "@knorvia/cua/request-access-contract";
import {
  CUA_TARGET_APP_DISPLAY_META_KEY,
  KNORVIA_MCP_NODE_REPL_CUA_APP_META_KEY,
  toolResultDisplayPayloadSchema,
} from "@knorvia/contracts";
import {
  createToolResultDisplay,
  MAX_NODE_REPL_DISPLAY_IMAGE_BASE64_BYTES,
} from "../src/tool/executor/result-display.js";

const cua = (output: unknown, officialCua = false) =>
  createToolResultDisplay("mcp__computer_use__observe", output, { officialCua });
const image = (bytes: number) => ({
  type: "image",
  mimeType: "image/png",
  data: Buffer.alloc(bytes, 61).toString("base64"),
});
const app = { appKey: "windows-exe:fixture.exe", displayName: " Fixture " };

test("CUA names are normalized for presentation without granting source authority", () => {
  const name = " MCP__PLUGIN_CUA_COMPUTER-USE__REQUEST-ACCESS ";
  assert.deepEqual(createToolResultDisplay(name, null), {
    kind: "cua",
    schemaVersion: 1,
    toolName: "request_access",
    status: "success",
  });
  assert.equal(createToolResultDisplay("computer_use", {}), undefined);
  assert.equal(createToolResultDisplay("mcp__computer_use__", {}), undefined);
  assert.equal(createToolResultDisplay("mcp__computer_user__click", {})?.kind, "cua");
});

test("CUA text, structured JSON and error fields retain ordering and omission semantics", () => {
  const output = {
    isError: true,
    structuredContent: { error: { code: "E", suggested_action: "retry" }, value: 1 },
    content: [
      null,
      { type: "text", text: "a" },
      { type: "text", text: "" },
      { type: "text", text: "b" },
      { type: "text", text: 8 },
    ],
  };
  const display = cua(output);
  assert.deepEqual(display, {
    kind: "cua",
    schemaVersion: 1,
    toolName: "observe",
    status: "failed",
    structuredContent: JSON.stringify(output.structuredContent),
    text: "a\n\nb",
    errorCode: "E",
    suggestedAction: "retry",
  });
  assert.ok(toolResultDisplayPayloadSchema.safeParse(display).success);
  assert.deepEqual(cua({ structuredContent: null, isError: "true" }), {
    kind: "cua",
    schemaVersion: 1,
    toolName: "observe",
    status: "success",
    structuredContent: "null",
  });
});

test("CUA structured encoding falls back only on thrown serialization failures", () => {
  const circular: { self?: unknown } = {};
  circular.self = circular;
  for (const structuredContent of [circular, 1n]) {
    const display = cua({ structuredContent });
    assert.ok(display?.kind === "cua" && display.structuredContent === "null");
  }
  assert.throws(() => cua({ structuredContent: Symbol("fixture") }), TypeError);
  assert.throws(() => cua({ structuredContent: () => null }), TypeError);
  const large = cua({
    content: [{ type: "text", text: "中".repeat(12000) }],
    structuredContent: "x".repeat(34000),
  });
  assert.ok(large?.kind === "cua" && large.truncated);
  assert.ok(Buffer.byteLength(large.text!) <= 32768);
  assert.ok(Buffer.byteLength(large.structuredContent!) <= 32768);
});

test("CUA image limits apply to decoded bytes and skip oversized images without losing later valid ones", () => {
  const oversized = image(256 * 1024 + 1),
    exact = image(256 * 1024),
    small = image(1);
  const actual = cua({
    content: [{ type: "text", text: "ahead" }, oversized, exact, exact, small],
  });
  assert.ok(actual?.kind === "cua" && actual.media?.length === 2 && actual.truncated);
  assert.equal(actual.media[0].data, exact.data);
  assert.ok(toolResultDisplayPayloadSchema.safeParse(actual).success);
  const fits = cua({ content: [exact, exact] });
  assert.ok(fits?.kind === "cua" && fits.media?.length === 2 && fits.truncated === undefined);
});

test("CUA media count ignores text and artifact links; a fifth usable image stops scanning", () => {
  const value = image(1);
  const unread = {
    type: "image",
    get mimeType() {
      return assert.fail("must stop after fifth image");
    },
  };
  const display = cua({
    content: [
      { type: "text", text: "first" },
      { type: "image", mimeType: "image/png", artifactUri: "artifact:fixture" },
      value,
      value,
      value,
      value,
      value,
      unread,
    ],
  });
  assert.ok(display?.kind === "cua" && display.media?.length === 4 && display.truncated);
  const permissive = cua({ content: [{ type: "image", mimeType: "unusual", data: "" }] });
  assert.ok(permissive?.kind === "cua" && permissive.media?.[0].data === "");
});

test("CUA target metadata is parsed only under the explicit official flag", () => {
  const target = {
    schemaVersion: 1,
    displayName: " Fixture ",
    iconLocators: [{ kind: "windows-executable-path", value: " fixture.exe " }],
  };
  const output = { _meta: { [CUA_TARGET_APP_DISPLAY_META_KEY]: target } };
  assert.deepEqual(cua(output), {
    kind: "cua",
    schemaVersion: 1,
    toolName: "observe",
    status: "success",
  });
  const trusted = cua(output, true);
  assert.ok(trusted?.kind === "cua" && trusted.targetApp);
  assert.equal(trusted.targetApp.displayName, "Fixture");
  assert.equal(trusted.targetApp.iconLocators[0].value, "fixture.exe");
  assert.ok(toolResultDisplayPayloadSchema.safeParse(trusted).success);
  const rejected = cua(
    { _meta: { [CUA_TARGET_APP_DISPLAY_META_KEY]: { ...target, extra: true } } },
    true,
  );
  assert.ok(rejected?.kind === "cua" && rejected.targetApp === undefined);
});

test("the installed CUA permission contract still omits unsupported status", () => {
  const permission = {
    schemaVersion: 1,
    platform: "darwin",
    grantOwner: "fixture",
    accessibility: "granted",
    screenRecording: "granted",
  };
  const display = createToolResultDisplay(
    "mcp__computer_use__request_access",
    { _meta: { [CUA_REQUEST_ACCESS_STATUS_META_KEY]: permission } },
    { officialCua: true },
  );
  assert.ok(display?.kind === "cua" && display.permissionStatus === undefined);
});

test("REPL image candidates preserve order, nullish encoding precedence and data URL handling", () => {
  const display = createToolResultDisplay("js", {
    images: [
      { mimeType: "image/PNG", base64: "data:image/png;base64,AAAA" },
      { mimeType: "image/png", base64: "", data: "BBBB" },
    ],
    content: [
      { type: "not-image", mimeType: "image/svg+xml", data: "data:missing-comma" },
      image(1),
    ],
  });
  assert.deepEqual(display, {
    kind: "node_repl_images",
    images: [
      { base64: "AAAA", mimeType: "image/PNG" },
      { base64: "data:missing-comma", mimeType: "image/svg+xml" },
    ],
    truncated: true,
  });
  assert.ok(toolResultDisplayPayloadSchema.safeParse(display).success);
  assert.equal(
    createToolResultDisplay("JS", { images: [{ mimeType: "image/png", base64: "AAAA" }] }),
    undefined,
  );
});

test("REPL limits encoded UTF-8 bytes independently from CUA decoded byte limits", () => {
  assert.equal(MAX_NODE_REPL_DISPLAY_IMAGE_BASE64_BYTES, 200 * 1024);
  const exact = "A".repeat(200 * 1024);
  const display = createToolResultDisplay("mcp__node_repl__js", {
    images: [
      { mimeType: "image/png", base64: exact + "A" },
      { mimeType: "image/png", base64: exact },
      { mimeType: "not-image", base64: "AAAA" },
    ],
  });
  assert.deepEqual(display, {
    kind: "node_repl_images",
    images: [{ base64: exact, mimeType: "image/png" }],
    truncated: true,
  });
  assert.equal(
    createToolResultDisplay("js", { images: [{ mimeType: "image/png", base64: exact + "A" }] }),
    undefined,
  );
  assert.equal(
    createToolResultDisplay(
      "js",
      { images: [{ mimeType: "image/png", base64: exact + "A" }] },
      { mcp: { serverName: "s", toolName: "t" } },
    )?.kind,
    "mcp_tool",
  );
});

test("REPL app-only actions use the host key and never revive producer association metadata", () => {
  const host = createToolResultDisplay("js", {
    _meta: { [KNORVIA_MCP_NODE_REPL_CUA_APP_META_KEY]: app },
  });
  assert.deepEqual(host, {
    kind: "node_repl_images",
    app: { appKey: app.appKey, displayName: "Fixture" },
  });
  assert.ok(toolResultDisplayPayloadSchema.safeParse(host).success);
  assert.equal(
    createToolResultDisplay("js", { _meta: { "knorvia.cua/app-associations-v1": app } }),
    undefined,
  );
  const onlyApp = createToolResultDisplay("js", {
    images: [{ mimeType: "image/png", base64: "" }],
    _meta: { [KNORVIA_MCP_NODE_REPL_CUA_APP_META_KEY]: app },
  });
  assert.deepEqual(onlyApp, { ...host, truncated: true });
});
