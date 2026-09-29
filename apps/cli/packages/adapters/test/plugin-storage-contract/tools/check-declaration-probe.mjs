// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { contractRoot, contractSchema, defaultRepoRoot } from "../harness/build-world.mjs";
import { parseArguments } from "../harness/arguments.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isInside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export async function runDeclarationProbe({ outputRoot, repoRoot = defaultRepoRoot } = {}) {
  if (process.version !== contractSchema.nodeVersion) {
    throw new Error(
      `Declaration probe requires ${contractSchema.nodeVersion}; received ${process.version}`,
    );
  }

  const repoAnchor = resolve(repoRoot, "package.json");
  const requireFromRepo = createRequire(repoAnchor);
  const packagePath = await realpath(requireFromRepo.resolve("typescript/package.json"));
  const packageBytes = await readFile(packagePath);
  const metadata = JSON.parse(packageBytes.toString("utf8"));
  if (
    metadata.name !== "typescript" ||
    metadata.version !== contractSchema.packageVersions.typescript
  ) {
    throw new Error(
      `Contract requires typescript@${contractSchema.packageVersions.typescript}; resolved ${metadata.name}@${metadata.version}`,
    );
  }
  const binPath = await realpath(resolve(dirname(packagePath), metadata.bin.tsc));
  const configPath = resolve(contractRoot, "tsconfig.declarations.json");
  const compiled = spawnSync(
    process.execPath,
    [binPath, "--project", configPath, "--pretty", "false", "--listFiles"],
    {
      cwd: contractRoot,
      encoding: "utf8",
      env: {
        NODE_PATH: "",
        PATH: dirname(process.execPath),
        SystemRoot: process.env.SystemRoot ?? "",
      },
      shell: false,
      windowsHide: true,
    },
  );
  if (compiled.status !== 0) {
    throw new Error(`Public declaration probe failed:\n${compiled.stdout}${compiled.stderr}`);
  }

  const canonicalContractRoot = await realpath(contractRoot);
  const typescriptLib = await realpath(resolve(dirname(packagePath), "lib"));
  const graph = [];
  for (const listedPath of compiled.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)) {
    if (!isAbsolute(listedPath)) throw new Error(`Unexpected tsc listFiles output: ${listedPath}`);
    const path = await realpath(listedPath);
    let kind;
    if (isInside(canonicalContractRoot, path)) kind = "owned-contract-declaration";
    else if (isInside(typescriptLib, path) && path.endsWith(".d.ts"))
      kind = "typescript-standard-lib";
    else throw new Error(`Declaration probe resolved an unapproved input: ${path}`);
    const bytes = await readFile(path);
    graph.push({ path, kind, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  graph.sort((left, right) => left.path.localeCompare(right.path));

  const publicRoot = resolve(contractRoot, "fixtures/public-declarations");
  const loadedPublic = graph
    .filter((entry) => isInside(publicRoot, entry.path))
    .map((entry) => basename(entry.path, ".d.ts"))
    .sort();
  const expectedPublic = [
    ...contractSchema.publicDeclarationFacades,
    ...contractSchema.supportDeclarations,
  ].sort();
  if (JSON.stringify(loadedPublic) !== JSON.stringify(expectedPublic)) {
    throw new Error(
      `Declaration input set mismatch: expected=${JSON.stringify(expectedPublic)} actual=${JSON.stringify(loadedPublic)}`,
    );
  }

  const ledger = {
    version: 1,
    status: "ok",
    compiler: {
      name: metadata.name,
      version: metadata.version,
      packagePath,
      packageSha256: sha256(packageBytes),
      binPath,
    },
    compilerOptions: {
      noEmit: true,
      noImplicitAny: true,
      skipLibCheck: false,
      strict: true,
    },
    publicDeclarations: loadedPublic,
    inputs: graph,
  };
  if (outputRoot) {
    await mkdir(resolve(outputRoot), { recursive: true });
    await writeFile(
      resolve(outputRoot, "declaration-graph-ledger.json"),
      `${JSON.stringify(ledger, null, 2)}\n`,
    );
  }
  return ledger;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = parseArguments(process.argv.slice(2));
  const result = await runDeclarationProbe({
    outputRoot: typeof args["output-root"] === "string" ? args["output-root"] : undefined,
    repoRoot: typeof args["repo-root"] === "string" ? args["repo-root"] : defaultRepoRoot,
  });
  console.log(
    JSON.stringify({
      compiler: `${result.compiler.name}@${result.compiler.version}`,
      files: result.inputs.length,
      publicDeclarations: result.publicDeclarations.length,
      status: result.status,
    }),
  );
}
