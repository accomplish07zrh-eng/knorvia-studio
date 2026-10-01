import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deferred,
  input,
  messageFixture,
  ownedDiff,
  ownedFile,
} from "./git-message-generator-fixture-fast-20261001.js";
const f = await messageFixture();
const exact = (failure: unknown) => (error: unknown) => error === failure;
function requestError(error: any, detail: string) {
  assert.equal(error.name, "GitCommitMessageGenerationError");
  assert.equal(error.reason, "request-failed");
  assert.equal(error.message, "模型请求失败。");
  assert.equal(error.detail, detail);
  assert.equal(Object.hasOwn(error, "cause"), false);
  return true;
}
for (const kind of ["diff", "conversation"])
  test(`sparse ${kind} preflight retains exact native TypeError`, async () => {
    const g = f.generator(),
      params: any = input();
    if (kind === "diff") {
      delete params.diffs[0];
    } else {
      const messages = [{ role: "user", content: "owned" }];
      delete messages[0];
      params.conversationContext = { messages };
    }
    await assert.rejects(g.api.generate(params), {
      name: "TypeError",
      message: `Cannot read properties of undefined (reading '${kind === "diff" ? "path" : "content"}')`,
    });
    assert.deepEqual(g.state.trace, ["lookup"]);
  });
test("trim order, shallow options copy, receiver and exact request/result shape", async () => {
  const g = f.generator(),
    reads: string[] = [],
    nested = { owned: true };
  g.state.selection = {
    get modelId() {
      reads.push("model");
      return " owned-model ";
    },
    get providerId() {
      reads.push("provider");
      return " owned-provider ";
    },
    get options() {
      reads.push("options");
      return { nested, owned: false };
    },
  };
  Object.defineProperty(g.state.response, "selection", {
    get: () => assert.fail("returned selection must be ignored"),
  });
  const result = await g.api.generate(input()),
    lookup = g.state.lookups[0]!,
    request = g.state.requests[0]!;
  assert.deepEqual(reads, ["model", "provider", "options"]);
  assert.deepEqual(lookup, {
    workspacePath: input().workspacePath,
    workspaceIdentity: "owned-identity",
  });
  assert.deepEqual(Object.keys(request), [
    "workspacePath",
    "workspaceIdentity",
    "selection",
    "prompt",
    "querySource",
  ]);
  assert.deepEqual(request.selection, {
    providerId: "owned-provider",
    modelId: "owned-model",
    options: { nested, owned: false },
  });
  assert.equal(request.selection.options.nested, nested);
  assert.equal(request.querySource, "git_commit_message");
  assert.deepEqual(result, {
    message: "fix: owned synthetic change",
    providerId: "owned-provider",
    model: "owned-model",
  });
});
for (const identity of [undefined, "", " ", "owned-identity"])
  test(`identity truthiness retains lookup/logger keys and text request propagation ${String(identity)}`, async () => {
    const g = f.generator();
    await g.api.generate({ ...input(), workspaceIdentity: identity });
    assert.equal(Object.hasOwn(g.state.lookups[0]!, "workspaceIdentity"), true);
    assert.equal(g.state.lookups[0]!.workspaceIdentity, identity);
    assert.equal(Object.hasOwn(g.state.requests[0]!, "workspaceIdentity"), Boolean(identity));
    const fields = g.state.logs[0]!.args[2] as any;
    assert.equal(Object.hasOwn(fields, "workspaceIdentity"), true);
    assert.equal(fields.workspaceIdentity, identity);
  });
for (const options of [undefined, null, false, 0, "", { owned: 1 }, ["owned"], "owned"])
  test(`truthy model options spread retained ${JSON.stringify(options)}`, async () => {
    const g = f.generator();
    g.state.selection.options = options;
    await g.api.generate(input());
    const selection = g.state.requests[0]!.selection;
    assert.equal(Object.hasOwn(selection, "options"), Boolean(options));
    if (options) {
      assert.notEqual(selection.options, options);
      assert.deepEqual(selection.options, { ...(options as any) });
    }
  });
for (const selection of [
  null,
  undefined,
  {},
  { modelId: " ", providerId: "owned" },
  { modelId: "owned", providerId: " " },
])
  test(`unavailable selection ${JSON.stringify(selection)}`, async () => {
    const g = f.generator();
    g.state.selection = selection;
    await assert.rejects(g.api.generate(input()), (error: any) => {
      assert.equal(error.name, "GitCommitMessageGenerationError");
      assert.equal(error.message, "未读取到当前模型。");
      assert.equal(error.reason, "model-unavailable");
      assert.equal(error.detail, undefined);
      assert.equal(Object.hasOwn(error, "detail"), true);
      assert.equal(Object.hasOwn(error, "cause"), false);
      return true;
    });
    assert.deepEqual(g.state.trace, ["lookup"]);
  });
for (const field of ["modelId", "providerId", "options"])
  test(`lookup selection getter failure stays unwrapped ${field}`, async () => {
    const failure = new Error(`owned ${field} getter`),
      g = f.generator();
    Object.defineProperty(g.state.selection, field, {
      get: () => {
        throw failure;
      },
    });
    await assert.rejects(g.api.generate(input()), exact(failure));
    assert.deepEqual(g.state.trace, ["lookup"]);
  });
for (const mode of ["throw", "reject"])
  test(`model lookup ${mode} stays unwrapped`, async () => {
    const g = f.generator(),
      failure = new Error(`owned lookup ${mode}`);
    g.state.read = () => {
      if (mode === "throw") throw failure;
      return Promise.reject(failure);
    };
    await assert.rejects(g.api.generate(input()), exact(failure));
    assert.deepEqual(g.state.trace, ["lookup"]);
  });
for (const failure of [
  new Error("owned request failure", { cause: new Error("owned cause") }),
  "owned thrown string",
  7,
  { toString: () => "owned thrown object" },
])
  for (const mode of ["throw", "reject"])
    test(`text ${mode} wraps ${String(failure)}`, async () => {
      const g = f.generator();
      g.state.text = () => {
        if (mode === "throw") throw failure;
        return Promise.reject(failure);
      };
      await assert.rejects(g.api.generate(input()), (error) =>
        requestError(error, failure instanceof Error ? failure.message : String(failure)),
      );
      assert.deepEqual(g.state.trace, ["lookup", "info", "text"]);
      assert.equal(g.state.requests.length, 1);
    });
test("response text getter failure is wrapped, returned selection getter ignored", async () => {
  const g = f.generator();
  g.state.response = {
    get text() {
      throw new Error("owned text getter");
    },
    get selection() {
      assert.fail("ignored response selection");
    },
  };
  await assert.rejects(g.api.generate(input()), (error) =>
    requestError(error, "owned text getter"),
  );
});
test("throwing request error stringification retains its replacement failure", async () => {
  const g = f.generator(),
    failure = new Error("owned stringification");
  g.state.text = () => {
    throw {
      toString: () => {
        throw failure;
      },
    };
  };
  await assert.rejects(g.api.generate(input()), exact(failure));
});
test("existing generation-error instance propagates unchanged through request catch", async () => {
  const first = f.generator();
  first.state.response.text = "owned invalid output";
  const failure = await first.api.generate(input()).catch((error: unknown) => error);
  const g = f.generator();
  g.state.text = () => {
    throw failure;
  };
  await assert.rejects(g.api.generate(input()), exact(failure));
  assert.deepEqual(g.state.trace, ["lookup", "info", "text"]);
});
test("start logger throw prevents request; debug logger throw wins invalid-output error", async () => {
  const failure = new Error("owned logger failure"),
    first = f.generator();
  first.state.info = () => {
    throw failure;
  };
  await assert.rejects(first.api.generate(input()), exact(failure));
  assert.deepEqual(first.state.trace, ["lookup", "info"]);
  const g = f.generator();
  g.state.response.text = "owned invalid";
  g.state.debug = () => {
    throw failure;
  };
  await assert.rejects(g.api.generate(input()), exact(failure));
  assert.deepEqual(g.state.trace, ["lookup", "info", "text", "debug"]);
});
test("logger is not awaited and absent logger does not evaluate count getters", async () => {
  const g = f.generator(),
    gate = deferred<void>();
  g.state.info = () => gate.promise;
  assert.equal((await g.api.generate(input())).message, "fix: owned synthetic change");
  gate.resolve();
  const second = f.generator();
  second.options.logger = undefined as any;
  const params = input(),
    files = params.files;
  let reads = 0;
  Object.defineProperty(params, "files", {
    get: () => {
      reads++;
      return files;
    },
  });
  await second.api.generate(params);
  assert.equal(reads, 1);
  assert.deepEqual(second.state.trace, ["lookup", "text"]);
});
test("delayed lookup precedes prompt and logger; delayed text precedes validation/result", async () => {
  const g = f.generator(),
    model = deferred<any>(),
    text = deferred<any>(),
    params = input();
  g.state.read = () => model.promise;
  g.state.text = () => text.promise;
  const files = params.files;
  let promptRead = false,
    settled = false;
  Object.defineProperty(params, "files", {
    get: () => {
      promptRead = true;
      return files;
    },
  });
  const pending = g.api.generate(params).then((result: any) => {
    settled = true;
    return result;
  });
  assert.deepEqual(g.state.trace, ["lookup"]);
  assert.equal(promptRead, false);
  model.resolve(g.state.selection);
  for (let i = 0; i < 4; i++) await Promise.resolve();
  assert.deepEqual(g.state.trace, ["lookup", "info", "text"]);
  assert.equal(promptRead, true);
  assert.equal(settled, false);
  text.resolve(g.state.response);
  await pending;
  assert.equal(settled, true);
});
test("thenable port receivers and await order remain exact", async () => {
  const g = f.generator();
  const model = {
    then(resolve: (v: any) => void) {
      assert.equal(this, model);
      g.state.trace.push("model then");
      resolve(g.state.selection);
    },
  };
  const text = {
    then(resolve: (v: any) => void) {
      assert.equal(this, text);
      g.state.trace.push("text then");
      resolve(g.state.response);
    },
  };
  g.state.read = () => model;
  g.state.text = () => text;
  await g.api.generate(input());
  assert.deepEqual(g.state.trace, ["lookup", "model then", "info", "text", "text then"]);
});
test("concurrent invocations have no cache, retry or result-selection exchange", async () => {
  const g = f.generator(),
    texts = [deferred<any>(), deferred<any>()];
  g.state.text = () => texts[g.state.requests.length - 1]!.promise;
  const a = g.api.generate({ ...input(), workspaceIdentity: "owned-a" }),
    b = g.api.generate({ ...input(), workspaceIdentity: "owned-b" });
  for (let i = 0; i < 4; i++) await Promise.resolve();
  assert.equal(g.state.lookups.length, 2);
  assert.equal(g.state.requests.length, 2);
  texts[1]!.resolve({ text: "fix: owned b" });
  assert.equal((await b).message, "fix: owned b");
  texts[0]!.resolve({ text: "fix: owned a" });
  assert.equal((await a).message, "fix: owned a");
});
for (const kind of ["branch", "locale", "file", "diff", "conversation"])
  test(`prompt preflight failure ${kind} stays unwrapped before logger/text`, async () => {
    const g = f.generator(),
      failure = new Error(`owned ${kind} prompt`),
      params: any = input();
    if (kind === "branch")
      params.branchName = {
        trim: () => {
          throw failure;
        },
      };
    if (kind === "locale")
      params.locale = {
        toLowerCase: () => {
          throw failure;
        },
      };
    if (kind === "file")
      Object.defineProperty(params.files[0], "kind", {
        get: () => {
          throw failure;
        },
      });
    if (kind === "diff")
      Object.defineProperty(params.diffs[0], "patch", {
        get: () => {
          throw failure;
        },
      });
    if (kind === "conversation")
      params.conversationContext = {
        messages: [
          {
            content: {
              replace: () => {
                throw failure;
              },
            },
          },
        ],
      };
    await assert.rejects(g.api.generate(params), exact(failure));
    assert.deepEqual(g.state.trace, ["lookup"]);
  });
test("ignored file/diff overflow is never inspected; empty conversation does not read omitted getter", async () => {
  const g = f.generator(),
    files = Array.from({ length: 20 }, (_, i) => ownedFile(i)),
    diffs = Array.from({ length: 8 }, (_, i) => ownedDiff(i));
  files.push(new Proxy(ownedFile(21), { get: () => assert.fail("overflow file") }));
  diffs.push(new Proxy(ownedDiff(9), { get: () => assert.fail("overflow diff") }));
  g.options.logger = undefined as any;
  const context = {
    messages: [],
    get omittedMessageCount(): number {
      assert.fail("empty conversation omitted getter");
    },
  };
  await g.api.generate({ ...input(), files, diffs, conversationContext: context });
  assert.equal(g.state.requests.length, 1);
});
test("original request getters keep their exact lookup/prompt/log/request order", async () => {
  const g = f.generator(),
    reads: string[] = [];
  const params = new Proxy(input(), {
    get(target, key, receiver) {
      reads.push(String(key));
      return Reflect.get(target, key, receiver);
    },
  });
  await g.api.generate(params);
  assert.deepEqual(reads, [
    "workspacePath",
    "workspaceIdentity",
    "branchName",
    "locale",
    "files",
    "diffs",
    "conversationContext",
    "workspacePath",
    "workspaceIdentity",
    "files",
    "diffs",
    "conversationContext",
    "conversationContext",
    "workspacePath",
    "workspaceIdentity",
  ]);
});
test("exhausted diff budget still preflights the next row before breaking", async () => {
  const g = f.generator(),
    failure = new Error("owned post-budget diff"),
    diffs = [{ ...ownedDiff(), path: "h".repeat(13000) }, ownedDiff(1)];
  Object.defineProperty(diffs[1], "patch", {
    get: () => {
      throw failure;
    },
  });
  await assert.rejects(g.api.generate({ ...input(), diffs }), exact(failure));
  assert.deepEqual(g.state.trace, ["lookup"]);
});
test("exhausted conversation budget normalizes and clips next row before breaking", async () => {
  const g = f.generator(),
    failure = new Error("owned post-budget conversation"),
    messages = Array.from({ length: 12 }, () => ({ role: "user", content: "x".repeat(900) }));
  Object.defineProperty(messages[7], "content", {
    get: () => {
      throw failure;
    },
  });
  await assert.rejects(
    g.api.generate({ ...input(), conversationContext: { messages } }),
    exact(failure),
  );
  assert.deepEqual(g.state.trace, ["lookup"]);
});
