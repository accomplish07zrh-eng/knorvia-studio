// Optional bounded old/new differential review; old dist is supplied by the reviewer.
// Apache-2.0 remains applicable. This does not establish independent provenance.
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

const baselineArgument = process.argv.indexOf("--baseline");
assert.ok(
  baselineArgument >= 0 && process.argv[baselineArgument + 1],
  "Supply --baseline <old-shared-dist>",
);
const oldRoot = pathToFileURL(`${process.argv[baselineArgument + 1].replace(/[\\/]$/, "")}/`);
const newRoot = new URL("../dist/", import.meta.url);
const modules = ["remote-workspace-identity.js", "remoteSshHostKey.js", "wslUserValidation.js"];
async function load(root) {
  return Object.assign(
    {},
    ...(await Promise.all(modules.map((name) => import(new URL(name, root))))),
  );
}
const [oldApi, newApi] = await Promise.all([load(oldRoot), load(newRoot)]);
const json = (value) => JSON.parse(JSON.stringify(value));
let comparisons = 0;
function same(observe, label) {
  assert.deepEqual(json(observe(newApi)), json(observe(oldApi)), label);
  comparisons++;
}
let seed = 0x72656d6f;
function pick(values) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return values[seed % values.length];
}
const targets = [
  { kind: "ssh", host: " FIXTURE.INVALID ", username: " user " },
  { kind: "wsl", distro: " Fixture ", user: " user " },
  { kind: "docker", container: "fixture-container" },
];
const prefixes = ["", "/", "//", "//server/share/", "C:/", "c:", "~/", "\\", "\\\\", "a/"];
const parts = ["", "a", "b", ".", "..", "user", "user:key", "a\nb", "a\u2028b"];
const authority = ["", "h", "u", "/path", "a/b", " a ", "a\nb", "[::1]"];
const userCharacters = [
  "a",
  ":",
  "/",
  "\\",
  "\u0000",
  "\u007f",
  "\u0085",
  "\u2028",
  "😀",
  "\ud800",
  " ",
];
for (let sample = 0; sample < 1200; sample++) {
  const path =
    pick(prefixes) +
    [pick(parts), pick(parts), pick(parts), pick(parts)].join(pick(["/", "//", "\\"])) +
    pick(["", " ", "\n"]);
  same(
    (api) => api.buildSshRemoteHostKey({ ...targets[0], privateKeyPath: path }),
    `key-${sample}`,
  );
  for (const target of targets) {
    same((api) => {
      const identity = api.buildRemoteWorkspaceIdentity(path, target);
      return {
        identity,
        parsed: api.parseRemoteWorkspaceIdentity(identity),
        remote: api.isRemoteWorkspaceIdentity(identity),
      };
    }, `workspace-${sample}-${target.kind}`);
  }
  const identity = `remote:${pick(["ssh", "wsl", "docker", "unknown"])}:${[pick(authority), pick(authority), pick(authority)].join(":")}:${pick(["/", "", "u:/"])}${path}`;
  same(
    (api) => ({
      parsed: api.parseRemoteWorkspaceIdentity(identity),
      remote: api.isRemoteWorkspaceIdentity(identity),
    }),
    `parse-${sample}`,
  );
  const user = Array.from({ length: sample % 81 }, () => pick(userCharacters)).join("");
  same((api) => {
    const result = api.wslUserSchema.safeParse(user);
    return {
      valid: api.isValidWslUser(user),
      schema: result.success ? { data: result.data } : { issues: result.error.issues },
    };
  }, `user-${sample}`);
}

async function browserApi(root) {
  const bundled = await build({
    stdin: {
      contents: modules
        .map((name) => `export * from ${JSON.stringify(fileURLToPath(new URL(name, root)))};`)
        .join("\n"),
      resolveDir: fileURLToPath(root),
      loader: "js",
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "remoteHelpers",
    write: false,
  });
  const context = {};
  runInNewContext(bundled.outputFiles[0].text, context);
  assert.equal(
    runInNewContext("typeof Buffer + ':' + typeof process", context),
    "undefined:undefined",
  );
  return context.remoteHelpers;
}
const [oldBrowser, newBrowser] = await Promise.all([browserApi(oldRoot), browserApi(newRoot)]);
const browserCases = [
  (api) => api.buildRemoteWorkspaceIdentity("\\fixture\\a\\..\\b", targets[1]),
  (api) => api.parseRemoteWorkspaceIdentity("remote:wsl:d:/fixture:user:\nnext"),
  (api) =>
    api.buildSshRemoteHostKey({ ...targets[0], privateKeyPath: "//server/share/../../../id" }),
  (api) => api.buildSshRemoteHostKey({ ...targets[0], privateKeyPath: "c:/../a\nb" }),
  (api) => {
    const result = api.wslUserSchema.safeParse("a".repeat(65) + ":");
    return result.success ? result.data : result.error.issues;
  },
  (api) => api.wslUserSchema.parse("😀".repeat(32)),
];
for (const [index, observe] of browserCases.entries()) {
  assert.deepEqual(json(observe(newBrowser)), json(observe(oldBrowser)), `browser-${index}`);
  assert.deepEqual(json(observe(newBrowser)), json(observe(newApi)), `browser-node-${index}`);
}
console.log(
  JSON.stringify({
    seededOldNewComparisons: comparisons,
    browserBoundaryCases: browserCases.length,
    nodeGlobalsAbsent: true,
  }),
);
