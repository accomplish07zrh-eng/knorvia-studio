import assert from "node:assert/strict";
import test from "node:test";
import {
  extractKnorviaFileCitations,
  projectKnorviaFileCitations,
} from "../src/lib/fileCitation.js";

test("new and saved file citations render in source order", () => {
  const input =
    'New ::knorvia-file-citation{path="/tmp/new.pdf" purpose="output"} ' +
    'old ::zcode-file-citation{path="/tmp/old.pdf" purpose="source"}';
  assert.deepEqual(
    extractKnorviaFileCitations(input).map(({ path, purpose }) => ({ path, purpose })),
    [
      { path: "/tmp/new.pdf", purpose: "output" },
      { path: "/tmp/old.pdf", purpose: "source" },
    ],
  );
});

test("streaming hides incomplete Knorvia and legacy citation directives", () => {
  for (const prefix of ["::knorvia-file-citation{path=", "::zcode-file-citation{path="]) {
    assert.deepEqual(projectKnorviaFileCitations(`Result ${prefix}`, { streaming: true }), {
      visibleText: "Result ",
    });
  }
});
