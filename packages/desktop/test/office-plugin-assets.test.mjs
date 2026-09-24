import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

test("office plugin inspectors preserve inputs and reject malformed packages offline", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const result = spawnSync(
    process.platform === "win32" ? "python" : "python3",
    ["-B", resolve(root, "scripts/office-plugin-assets.test.py")],
    { encoding: "utf8", cwd: root, timeout: 30_000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
