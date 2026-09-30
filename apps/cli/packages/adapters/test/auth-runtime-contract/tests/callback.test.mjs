// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { getHttpState, latestServer, resetHttpState } from "../harness/seam-controls.mjs";
import { authModule, publicFacts } from "../harness/test-context.mjs";

async function create(input = { callbackPath: "/owned/callback", state: "state-1" }) {
  resetHttpState();
  const { createLocalhostOAuthCallbackServer } = await authModule();
  const api = await createLocalhostOAuthCallbackServer(input);
  return { api, server: latestServer() };
}

async function assertPending(promise) {
  const marker = Symbol("pending");
  const observed = await Promise.race([
    promise.then(
      () => "resolved",
      () => "rejected",
    ),
    Promise.resolve(marker),
  ]);
  assert.equal(observed, marker);
}

async function assertWire(response, statusCode, body) {
  const facts = await publicFacts();
  assert.equal(response.statusCode, statusCode);
  assert.equal(response.body, body);
  assert.equal(response.body.endsWith("\n"), false);
  assert.equal(response.headers["content-type"], facts.callback.contentType);
}

test(
  "A-CBK-01 creation binds only loopback and reports exact endpoint",
  { timeout: 5000 },
  async () => {
    const { api, server } = await create({ callbackPath: "/exact/path", state: "s" });
    assert.equal(api.callbackPath, "/exact/path");
    assert.equal(api.callbackUrl, "http://127.0.0.1:43100/exact/path");
    assert.deepEqual(server.listenCalls, [{ host: "127.0.0.1", port: 0 }]);
    await api.close();

    resetHttpState();
    const { createLocalhostOAuthCallbackServer } = await authModule();
    const listenFailure = new Error("owned listen failure");
    getHttpState().listenError = listenFailure;
    await assert.rejects(
      createLocalhostOAuthCallbackServer({ callbackPath: "/cb", state: "s" }),
      (error) => error === listenFailure,
    );

    resetHttpState();
    getHttpState().addressValue = null;
    await assert.rejects(createLocalhostOAuthCallbackServer({ callbackPath: "/cb", state: "s" }), {
      message: "Unable to resolve localhost callback server address.",
    });
    assert.equal(latestServer().closeCalls, 1);
  },
);

test(
  "A-CBK-02 wrong route and state preserve the pending callback",
  { timeout: 5000 },
  async () => {
    const facts = await publicFacts();
    const { api, server } = await create();
    const waiting = api.waitForCallback();
    await assertWire(
      await server.dispatch("/wrong?state=state-1&code=ignored"),
      404,
      facts.callback.failureBody,
    );
    await assertPending(waiting);
    await assertWire(
      await server.dispatch("/owned/callback?state=wrong&code=ignored"),
      400,
      facts.callback.failureBody,
    );
    await assertPending(waiting);
    await assertWire(
      await server.dispatch("/owned/callback?code=ignored"),
      400,
      facts.callback.failureBody,
    );
    await assertPending(waiting);
    await server.dispatch("/owned/callback?state=state-1&code=accepted");
    assert.equal((await waiting).code, "accepted");
    await api.close();
  },
);

test(
  "A-CBK-03 success uses nullish code precedence, URL semantics, and first settlement",
  { timeout: 5000 },
  async () => {
    const facts = await publicFacts();
    {
      const { api, server } = await create();
      const waiting = api.waitForCallback();
      const request = "/owned/callback?state=state-1&authCode=preferred&code=fallback";
      await assertWire(await server.dispatch(request), 200, facts.callback.successBody);
      assert.deepEqual(await waiting, {
        code: "preferred",
        url: `http://127.0.0.1${request}`,
      });
      await assertWire(
        await server.dispatch("/owned/callback?state=state-1&code=late"),
        200,
        facts.callback.successBody,
      );
      assert.equal((await api.waitForCallback()).code, "preferred");
      await api.close();
    }
    {
      const { api, server } = await create();
      const absolute = "https://owned.invalid/owned/callback?state=state-1&code=absolute";
      const waiting = api.waitForCallback();
      await server.dispatch(absolute);
      assert.deepEqual(await waiting, { code: "absolute", url: absolute });
      await api.close();
    }
    {
      const { api, server } = await create({ callbackPath: "/cb", state: "" });
      const waiting = api.waitForCallback();
      await server.dispatch("/cb?code=empty-state-match");
      assert.equal((await waiting).code, "empty-state-match");
      await api.close();
    }
  },
);

test("A-CBK-04 denial rejects with exact stable error shape", { timeout: 5000 }, async () => {
  const facts = await publicFacts();
  for (const description of ["human readable", ""]) {
    const { api, server } = await create();
    const waiting = api.waitForCallback();
    const suffix =
      description === ""
        ? "&error_description="
        : `&error_description=${encodeURIComponent(description)}`;
    // 先挂接拒绝处理，再触发回调，避免测试时序制造未处理 rejection。
    await Promise.all([
      assert.rejects(waiting, (error) => {
        assert.equal(error.message, `${facts.callback.deniedMessagePrefix}access_denied`);
        assert.equal(error.code, facts.callback.deniedCode);
        assert.equal(error.oauthError, "access_denied");
        if (description === "") assert.equal(Object.hasOwn(error, "oauthErrorDescription"), false);
        else assert.equal(error.oauthErrorDescription, description);
        return true;
      }),
      server
        .dispatch(`/owned/callback?state=state-1&error=access_denied${suffix}`)
        .then((wire) => assertWire(wire, 400, facts.callback.failureBody)),
    ]);
    await api.close();
  }
});

test(
  "A-CBK-05 malformed matching callbacks reject once and return failure wire text",
  { timeout: 5000 },
  async () => {
    const facts = await publicFacts();
    {
      const { api, server } = await create();
      const waiting = api.waitForCallback();
      await Promise.all([
        assert.rejects(waiting, { message: facts.callback.missingCode }),
        server
          .dispatch("/owned/callback?state=state-1&authCode=&code=blocked")
          .then((wire) => assertWire(wire, 400, facts.callback.failureBody)),
      ]);
      await api.close();
    }
    {
      const { api, server } = await create();
      const parsingFailure = new Error("owned URL getter failure");
      const waiting = api.waitForCallback();
      const request = {};
      Object.defineProperty(request, "url", {
        get: () => {
          throw parsingFailure;
        },
      });
      await Promise.all([
        assert.rejects(waiting, (error) => error === parsingFailure),
        server
          .dispatchRaw(request)
          .then((wire) => assertWire(wire, 500, facts.callback.failureBody)),
      ]);
      await api.close();
    }
  },
);

test(
  "A-CBK-06 close awaits shutdown, preserves errors, and is idempotent when stopped",
  { timeout: 5000 },
  async () => {
    {
      const { api, server } = await create();
      assert.equal(server.listening, true);
      await api.close();
      assert.equal(server.listening, false);
      assert.equal(server.closeCalls, 1);
      await api.close();
      assert.equal(server.closeCalls, 1);
    }
    {
      const { api } = await create();
      const closeFailure = new Error("owned close failure");
      getHttpState().closeError = closeFailure;
      await assert.rejects(api.close(), (error) => error === closeFailure);
    }
  },
);
