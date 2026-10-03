import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("synthetic permission injection remains isolated, bounded and cached", () => {
  const env: Record<string, string | undefined> = {};
  const exports = {} as typeof import("../src/fs/fsFaultInjection.js");
  const source = readFileSync(new URL("../src/fs/fsFaultInjection.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS },
  }).outputText;
  // Only repository source is read. The owner's process environment is wholly synthetic.
  vm.runInNewContext(code, { exports, process: { env } });
  env.KNORVIA_E2E_FS_FAULTS = "malformed synthetic payload";
  assert.equal(exports.getProcessFsFaultInjector().isEnabled(), false);
  env.KNORVIA_ENV = "test";
  assert.equal(exports.getProcessFsFaultInjector().isEnabled(), false);
  exports.resetProcessFsFaultInjectorForTests();
  assert.throws(() => exports.getProcessFsFaultInjector(), /Invalid KNORVIA_E2E_FS_FAULTS:/);
  env.KNORVIA_E2E_FS_FAULTS = JSON.stringify([
    {
      id: " guarded ",
      code: " EACCES ",
      operations: ["rm"],
      pathIncludes: "scratch\\",
      maxMatches: 1,
    },
    {
      id: "second",
      code: "EPERM",
      operations: ["rm"],
      pathEndsWith: ".tmp",
      maxMatches: 0,
      message: "",
    },
  ]);
  const injector = exports.getProcessFsFaultInjector();
  let deletions = 0;
  const deleteFake = (path: string) => {
    exports.maybeThrowInjectedFsFault({ operation: "rm", path });
    deletions += 1;
  };
  assert.throws(
    () => deleteFake("scratch\\protected.tmp"),
    (error: unknown) => {
      assert.equal(exports.isInjectedFsFaultError(error), true);
      const fault = error as {
        code: string;
        path: string;
        syscall: string;
        knorviaFsFaultId: string;
      };
      assert.equal(fault.code, "EACCES");
      assert.equal(fault.path, "scratch\\protected.tmp");
      assert.equal(fault.syscall, "rm");
      assert.equal(fault.knorviaFsFaultId, "guarded");
      return true;
    },
  );
  assert.equal(deletions, 0);
  assert.throws(
    () => deleteFake("scratch/protected.tmp"),
    (error: unknown) => {
      assert.equal((error as Error).message, "");
      return true;
    },
  );
  deleteFake("scratch/admitted.txt");
  assert.equal(deletions, 1);
  const hits = injector.getHits();
  assert.equal(hits.length, 2);
  assert.notEqual(hits, injector.getHits());
  assert.equal(hits[0], injector.getHits()[0]);
  assert.equal(hits[0].matchIndex, 1);
  assert.equal(hits[0].id, "guarded");
  assert.equal(injector.isEnabled(), true);
  const override = exports.createFsFaultInjector();
  exports.setFsFaultInjectorForTests(override);
  assert.equal(exports.getProcessFsFaultInjector(), override);
  exports.setFsFaultInjectorForTests(null);
  assert.equal(exports.getProcessFsFaultInjector(), injector);
  injector.reset();
  assert.equal(injector.getHits().length, 0);
  assert.throws(() => deleteFake("scratch/protected.tmp"), /Injected fs fault EACCES/);
  assert.throws(
    () => exports.createFsFaultInjector([{ id: "bad", code: "EPERM", maxMatches: -1 }]),
    /maxMatches/,
  );
  assert.equal(exports.parseFsFaultRulesFromEnvValue('[{"id":"not validated here"}]').length, 1);
  assert.throws(() => exports.parseFsFaultRulesFromEnvValue("[[]]"), /rule must be an object/);
  assert.equal(
    exports.isInjectedFsFaultError(Object.create({ knorviaFsFaultId: "inherited" })),
    true,
  );
  assert.equal(
    exports.isInjectedFsFaultError(
      new Proxy(
        {},
        {
          has: () => false,
          get: () => assert.fail("absent injection marker was read"),
        },
      ),
    ),
    false,
  );
  exports.resetProcessFsFaultInjectorForTests();
  env.KNORVIA_E2E_FS_FAULTS = " ";
  Object.defineProperty(env, "KNORVIA_ENV", {
    configurable: true,
    get: () => assert.fail("blank payload read gate"),
  });
  assert.equal(exports.getProcessFsFaultInjector().isEnabled(), false);
  exports.resetProcessFsFaultInjectorForTests();
});
