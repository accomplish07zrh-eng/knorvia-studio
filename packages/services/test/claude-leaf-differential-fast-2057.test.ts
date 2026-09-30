// Differential observations supplement the explicit old-source contract fixtures.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const oldRoot = process.env.KNORVIA_CLAUDE_OLD_ROOT;
const target = process.env.KNORVIA_CLAUDE_LEAF_TARGET ?? "src";
const newRoot = process.env.KNORVIA_CLAUDE_LEAF_ROOT;

test(
  "deterministic old/new Claude leaf observations and public declarations",
  { skip: !oldRoot },
  async (t) => {
    const oldFolder = pathToFileURL(`${resolve(oldRoot!)}/`);
    const newFolder = newRoot
      ? pathToFileURL(`${resolve(newRoot)}/`)
      : new URL("../", import.meta.url);
    const names = [
      "jsonLineRecord",
      "sessionHistoryJsonl",
      "importedClaudeTaskFileFilter",
      "claudeNativeSessionHeadParser",
      "buildImportedClaudeTaskFile",
    ];
    const oldModules = await Promise.all(
      names.map((name) => import(new URL(`dist/session/claude-native/${name}.js`, oldFolder).href)),
    );
    const newModules = await Promise.all(
      names.map(
        (name) =>
          import(
            new URL(
              `${target}/session/claude-native/${name}.${target === "src" ? "ts" : "js"}`,
              newFolder,
            ).href
          ),
      ),
    );
    const dir = await mkdtemp(join(tmpdir(), "knorvia-claude-diff-2057-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const priorCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    });
    t.after(() => {
      if (priorCrypto) Object.defineProperty(globalThis, "crypto", priorCrypto);
    });

    let observations = 0;
    function capture(fn: () => unknown) {
      try {
        return { ok: true, value: fn() };
      } catch (value) {
        const error = value as Error & { code?: string };
        return { ok: false, name: error.name, message: error.message, code: error.code };
      }
    }
    async function captureAsync(fn: () => Promise<unknown>) {
      try {
        return { ok: true, value: await fn() };
      } catch (value) {
        const error = value as Error & { code?: string };
        return { ok: false, name: error.name, message: error.message, code: error.code };
      }
    }
    function compare(label: string, oldCall: () => unknown, newCall: () => unknown) {
      assert.deepEqual(capture(newCall), capture(oldCall), label);
      observations++;
    }
    let seed = 2057;
    const choose = <T>(values: readonly T[]): T => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return values[seed % values.length]!;
    };
    const texts = [
      "",
      " \r\n ",
      "雪🙂",
      " A<command-x>secret</local-command-y>B ",
      "<ide_opened_file>hidden</ide_opened_file>",
      "x".repeat(80),
    ];
    const clocks = [
      undefined,
      1,
      1000000000,
      1000000001,
      1000000000000,
      1700000000123.4,
      NaN,
      Infinity,
      "1700000000.5",
      "2026-01-01T00:00:00Z",
      "bad",
    ];
    for (let index = 0; index < 100; index++) {
      const entries = Array.from({ length: 3 }, () => ({
        type: choose(["user", "assistant", "progress", undefined]),
        cwd: choose([" /a ", "/b", "", undefined]),
        isMeta: choose([true, false, 1]),
        isApiErrorMessage: choose([true, false, 1]),
        model: choose(["<synthetic>", "m", "", undefined]),
        timestamp: choose(clocks),
        createdAt: choose(clocks),
        message: {
          content: choose([
            choose(texts),
            [
              choose(texts),
              {
                type: choose(["text", "tool_result", "other"]),
                text: choose(texts),
                content: choose(texts),
              },
              null,
            ],
            null,
            1,
          ]),
          cwd: choose(["/message", "", undefined]),
          timestamp: choose(clocks),
          isSidechain: choose([true, false, 1]),
        },
        request: {
          prompt: choose(texts),
          cwd: "/request",
          timestamp: choose(clocks),
          isSidechain: choose([true, false, 1]),
        },
        unknown: { keep: index },
      }));
      if (index % 13 === 0) delete entries[1];
      if (index % 17 === 0) entries[0] = null as never;
      compare(
        `head ${index}`,
        () => oldModules[3].extractClaudeNativeSessionHeadInfo(entries),
        () => newModules[3].extractClaudeNativeSessionHeadInfo(entries),
      );
      compare(
        `sidechain ${index}`,
        () => oldModules[3].hasClaudeNativeSidechainMarker(entries),
        () => newModules[3].hasClaudeNativeSidechainMarker(entries),
      );
    }
    const paths = [
      [],
      ["meta.mode", "messages[].model"],
      ["messages[]"],
      ["messages.0.model"],
      ["meta..mode", ""],
      ["[].x"],
      ["meta", "meta.mode"],
      ["self.meta.mode"],
      [null],
      null,
    ];
    for (let index = 0; index < 100; index++) {
      const value = {
        meta: { mode: "build", model: "m", keep: index },
        messages: [{ model: "m", text: "x" }, null, { unknown: 2 }],
        "": [{ x: 1 }],
        self: null as unknown,
      };
      if (index % 3 === 0) value.self = value;
      if (index % 7 === 0) delete value.messages[1];
      const selection = choose(paths);
      compare(
        `filter ${index}`,
        () => oldModules[2].filterImportedClaudeTaskFilePaths(value, selection),
        () => newModules[2].filterImportedClaudeTaskFilePaths(value, selection),
      );
    }
    for (let index = 0; index < 100; index++) {
      const value = {
        provider: "claude",
        sessionId: `session-${index}`,
        sourcePath: "/synthetic/source",
        workspacePath: choose(["/w", "/a/../b", "雪🙂", ""]),
        title: choose([undefined, "", " explicit ", 1]),
        model: choose([undefined, "", "m", () => {}]),
        createdAt: choose(clocks.slice(0, 8)),
        updatedAt: choose(clocks.slice(0, 8)),
        messages: [
          {
            role: choose(["user", "assistant"]),
            content: choose(texts),
            timestamp: 1700000000123,
            turnIndex: 0,
            model: "m",
            unknown: { keep: index },
          },
        ],
        unknown: "ignored",
      };
      if (index % 11 === 0) value.messages.length = 0;
      if (index % 17 === 0) {
        value.messages.length = 1;
        delete value.messages[0];
      }
      const selection = choose(paths);
      const override = choose([undefined, "", "stable"]);
      compare(
        `builder ${index}`,
        () => oldModules[4].buildImportedClaudeTaskFile(value, selection, override),
        () => newModules[4].buildImportedClaudeTaskFile(value, selection, override),
      );
    }
    for (let index = 0; index < 50; index++) {
      const workspace = choose(["/a/../b", "雪🙂", "\ud800", "", null, 3]);
      const session = choose([" s ", "é", "\udc00", "", null, 5]);
      compare(
        `id ${index}`,
        () => oldModules[4].buildImportedClaudeTaskId(workspace, session),
        () => newModules[4].buildImportedClaudeTaskId(workspace, session),
      );
    }
    for (let index = 0; index < 60; index++) {
      const path = join(dir, `${index}.jsonl`);
      const separator = choose(["\n", "\r\n", "\r"]);
      const tokens = [
        choose(["", " ", "\ufeff"]),
        choose(['{"unknown":1}', "null", "[1,2]", "true", '"雪🙂"']),
        choose(["", '{"cut":', '\ufeff{"bom":1}', '{"valid":2}']),
      ];
      await writeFile(path, tokens.join(separator));
      const limit = choose([0, 1, 2.5, NaN, Infinity]);
      for (const [name, args] of [
        ["readJsonLinesFile", [path]],
        ["readJsonLinesFileHead", [path, limit]],
      ] as const) {
        assert.deepEqual(
          await captureAsync(() => newModules[1][name](...args)),
          await captureAsync(() => oldModules[1][name](...args)),
          `${name} ${index}`,
        );
        observations++;
      }
    }
    const printer = ts.createPrinter({ removeComments: true });
    for (const name of names) {
      const canonical = async (folder: URL) =>
        printer.printFile(
          ts.createSourceFile(
            `${name}.d.ts`,
            await readFile(new URL(`dist/session/claude-native/${name}.d.ts`, folder), "utf8"),
            ts.ScriptTarget.Latest,
            true,
          ),
        );
      assert.equal(await canonical(newFolder), await canonical(oldFolder), `declaration ${name}`);
      observations++;
    }
    t.diagnostic(`old/new observations=${observations}; seed=2057; public declarations=5`);
  },
);
