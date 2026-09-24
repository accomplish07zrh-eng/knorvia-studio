import assert from "node:assert/strict";
import test from "node:test";
import {
  artifactUriBelongsToSession,
  createArtifactUri,
  isArtifactUri,
} from "../src/artifact-uri.js";
import {
  decodeMarkdownArtifactImageSource,
  rewriteMarkdownArtifactImageSources,
} from "../src/markdown-artifact-images.js";

test("new artifacts use a Knorvia URI while old saved references remain readable", () => {
  const newUri = createArtifactUri("session 1", "image 2");
  const oldUri = "zcode-artifact://session%201/image%202";
  assert.equal(newUri, "knorvia-artifact://session%201/image%202");
  assert.equal(isArtifactUri(newUri), true);
  assert.equal(isArtifactUri(oldUri), true);
  assert.equal(artifactUriBelongsToSession(newUri, "session 1"), true);
  assert.equal(artifactUriBelongsToSession(oldUri, "session 1"), true);
  assert.equal(artifactUriBelongsToSession(oldUri, "session 2"), false);
});

test("markdown image links use the Knorvia render path and can decode old paths", () => {
  const newUri = createArtifactUri("one", "two");
  const rewritten = rewriteMarkdownArtifactImageSources(`![a](${newUri})`);
  const renderedSource = /\(([^)]+)\)/u.exec(rewritten)?.[1];
  assert.ok(renderedSource?.startsWith("/__knorvia_artifact_image__/"));
  assert.equal(decodeMarkdownArtifactImageSource(renderedSource), newUri);
  assert.equal(
    decodeMarkdownArtifactImageSource(
      `/__knorvia_artifact_image__/${encodeURIComponent("zcode-artifact://one/two")}`,
    ),
    "zcode-artifact://one/two",
  );
});
