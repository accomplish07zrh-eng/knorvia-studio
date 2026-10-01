// Owned model, response, conversation, diff, logger and locale ports only.
import assert from "node:assert/strict";
import { beforeEach, mock } from "node:test";
import type { GitDiffResult, GitFileChange } from "@knorvia/shared";
import { projectionFixture, root, workspace } from "./git-read-projection-fixture-fast-20261001.js";
export { root, workspace };
export const ownedFile = (index = 0): GitFileChange => ({
  path: `${root}/work/owned-${index}.txt`,
  repoRelativePath: `work/owned-${index}.txt`,
  workspaceRelativePath: `owned-${index}.txt`,
  kind: "modified",
  section: "unstaged",
  added: index + 1,
  removed: index,
  isStaged: false,
  isUntracked: false,
  isConflicted: false,
});
export const ownedDiff = (index = 0): GitDiffResult => ({
  path: `owned/path-${index}.txt`,
  availability: "patch",
  patch: `owned patch ${index}`,
  summary: null,
  beforeContent: null,
  afterContent: null,
});
export const input = () => ({
  workspacePath: workspace,
  workspaceIdentity: "owned-identity",
  branchName: " owned-branch ",
  locale: "en-US" as const,
  files: [ownedFile()],
  diffs: [ownedDiff()],
});
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export async function messageFixture() {
  const f = await projectionFixture();
  const { GitCommitMessageGenerator } = await import(f.url("git/gitCommitMessageGenerator"));
  const runtime = { locale: "en-US", error: undefined as unknown, calls: 0 };
  mock.method(Intl, "DateTimeFormat", () => {
    runtime.calls++;
    if (runtime.error) throw runtime.error;
    return { resolvedOptions: () => ({ locale: runtime.locale }) };
  });
  beforeEach(() => {
    runtime.locale = "en-US";
    runtime.error = undefined;
    runtime.calls = 0;
  });
  function generator() {
    const state = {
      trace: [] as string[],
      logs: [] as { level: string; args: unknown[] }[],
      requests: [] as Record<string, any>[],
      lookups: [] as Record<string, any>[],
      selection: {
        providerId: " owned-provider ",
        modelId: " owned-model ",
        options: { owned: "value", nested: { synthetic: true } },
      } as any,
      response: {
        text: "fix: owned synthetic change",
        selection: { providerId: "ignored", modelId: "ignored" },
      } as any,
      read: undefined as undefined | (() => any),
      text: undefined as undefined | (() => any),
      info: undefined as undefined | (() => any),
      debug: undefined as undefined | (() => any),
    };
    const provider = {
      readCurrentModel(params: Record<string, unknown>) {
        assert.equal(this, provider);
        state.trace.push("lookup");
        state.lookups.push(params);
        return state.read ? state.read() : Promise.resolve(state.selection);
      },
    };
    const text = {
      generateText(params: Record<string, unknown>) {
        assert.equal(this, text);
        state.trace.push("text");
        state.requests.push(params);
        return state.text ? state.text() : Promise.resolve(state.response);
      },
    };
    const logger = {
      info(...args: unknown[]) {
        assert.equal(this, logger);
        state.trace.push("info");
        state.logs.push({ level: "info", args });
        return state.info?.();
      },
      debug(...args: unknown[]) {
        assert.equal(this, logger);
        state.trace.push("debug");
        state.logs.push({ level: "debug", args });
        return state.debug?.();
      },
      warn: () => assert.fail("no new warning event"),
      error: () => assert.fail("no new error event"),
    };
    const options = { currentModelProvider: provider, textGenerator: text, logger };
    const api = new GitCommitMessageGenerator(options);
    return { api, state, options, provider, text, logger };
  }
  return { ...f, runtime, generator };
}
