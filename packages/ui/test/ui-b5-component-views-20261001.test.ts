import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { pathToFileURL, fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { views } from "./ui-b5-view-cases-20261001.js";
const directory =
  process.env.KNORVIA_UI_B5_DIR ?? fileURLToPath(new URL("../src/", import.meta.url));
const extension = process.env.KNORVIA_UI_B5_EXT ?? "tsx";
const metric = await import(
  pathToFileURL(`${directory}/components/ui/flip-metric-value.${extension}`).href
);
const toast = await import(pathToFileURL(`${directory}/components/ui/toast.${extension}`).href);
const expected = JSON.parse(
  await readFile(new URL("./ui-b5-view-hashes-20261001.json", import.meta.url), "utf8"),
);
for (const [index, view] of views({ ...metric, ...toast }).entries()) {
  test(`B5 frozen SSR markup ${index}: metric/toast presentation and ARIA`, () => {
    const html = renderToStaticMarkup(view);
    assert.equal(createHash("sha256").update(html).digest("hex"), expected[index]);
  });
}

test("B5 toast pure boundary: global truthy-key dedupe, tail order and stable references", () => {
  const a = { id: 0, message: "A", durationMs: 0, position: "top-center", dedupeKey: "key" };
  const b = { ...a, id: 1, message: "B", dedupeKey: "other" };
  const c = { ...a, id: 2, message: "C", position: "bottom-center" };
  const source = [a, b];
  const result = toast.upsertToastItem(source, c);
  assert.deepEqual(result, [b, c]);
  const sparse = [a, a, b];
  delete sparse[1];
  assert.deepEqual(toast.upsertToastItem(sparse, c), [b, c]);
  assert.deepEqual(toast.upsertToastItem(sparse, { ...c, dedupeKey: "" }), [
    a,
    undefined,
    b,
    { ...c, dedupeKey: "" },
  ]);
  assert.equal(result[0], b);
  assert.equal(result[1], c);
  assert.deepEqual(source, [a, b]);
  const noKey = { ...c, dedupeKey: "" };
  assert.deepEqual(toast.upsertToastItem(source, noKey), [a, b, noKey]);
  assert.equal(toast.resolveToastAnchorLeft({ left: -10, width: 31 }), 5.5);
});
