import {
  assert,
  test,
  json,
  load,
  pageFixture,
  executorPorts,
} from "./playwrightOwners.fixture.mjs";

test("executor: evaluate abort listener identity, preabort and URL commit/readiness semantics", async () => {
  const fixture = pageFixture();
  const controller = new AbortController();
  const payload = {};
  let settle;
  let evaluateEntered;
  const entered = new Promise((resolve) => {
    evaluateEntered = resolve;
  });
  const calls = [];
  fixture.view.cdp.send = async (method, params) => {
    calls.push({ method, params });
    if (method === "Runtime.evaluate") {
      evaluateEntered();
      return new Promise((resolve) => {
        settle = resolve;
      });
    }
    return {};
  };
  const { handlePlaywrightAction } = load("browserPlaywrightExecutor", executorPorts());
  const pending = handlePlaywrightAction(
    fixture.view,
    { name: "evaluate", expressionKind: "function", expression: "arg => arg", arg: "synthetic" },
    (value) => value,
    controller.signal,
  );
  await entered;
  controller.abort();
  settle({ result: { value: payload } });
  assert.equal((await pending).value, payload);
  assert.equal(calls.filter((call) => call.method === "Runtime.terminateExecution").length, 1);
  const count = calls.length;
  await assert.rejects(
    handlePlaywrightAction(
      fixture.view,
      { name: "evaluate", expression: "1", expressionKind: "string" },
      (value) => value,
      controller.signal,
    ),
    (error) => error.name === "AbortError" && error.message === "aborted",
  );
  assert.equal(calls.length, count);
  let scriptReads = 0;
  fixture.view.webContents.executeJavaScript = async () => {
    scriptReads++;
    return {};
  };
  assert.deepEqual(
    json(
      await handlePlaywrightAction(
        fixture.view,
        { name: "waitForURL", url: "https://*.invalid/", waitUntil: "commit" },
        (value) => value,
      ),
    ),
    { ok: true, value: "https://synthetic.invalid/" },
  );
  assert.equal(scriptReads, 0);
  assert.deepEqual(
    json(
      await handlePlaywrightAction(
        fixture.view,
        { name: "waitForLoadState", state: "domcontentloaded" },
        (value) => value,
      ),
    ),
    { ok: true },
  );
  assert.equal(scriptReads, 1);
  await assert.rejects(
    handlePlaywrightAction(
      fixture.view,
      { name: "waitForLoadState", state: "networkidle" },
      (value) => value,
    ),
    /does not support networkidle/,
  );
});
