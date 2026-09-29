// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getWorld, makeError, record, takeScript } from "./state.mjs";
import { ownedPath } from "./fs-policy.mjs";

function gitRepositoryPath(args) {
  if (args[0] === "clone") return args.at(-1);
  const repositoryIndex = args.indexOf("-C");
  if (repositoryIndex >= 0) return args[repositoryIndex + 1];
  return undefined;
}

async function applyEffects(script, repository, options) {
  for (const effect of script.files ?? []) {
    const substituted = String(effect.path)
      .replaceAll("$DEST", repository ?? "")
      .replaceAll("$CWD", options.cwd ?? "");
    const path = ownedPath(resolve(options.cwd ?? getWorld().runRoot, substituted));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, effect.text ?? "");
  }
}

async function invoke(file, args = [], options = {}) {
  record("process.execFile", {
    file,
    args,
    cwd: options.cwd,
    timeout: options.timeout,
    killSignal: options.killSignal,
    maxBuffer: options.maxBuffer,
    envKeys: Object.keys(options.env ?? {}).sort(),
    signalAborted: options.signal?.aborted === true,
  });
  if (options.signal?.aborted) {
    return Promise.reject(
      makeError({ name: "AbortError", code: "ABORT_ERR", message: "Synthetic Git cancellation" }),
    );
  }
  const script = takeScript("git");
  if (script.error) {
    const error = makeError(script.error, "Synthetic Git failure");
    error.stdout = script.stdout ?? "";
    error.stderr = script.stderr ?? "";
    throw error;
  }
  const repository = gitRepositoryPath(args);
  if (args[0] === "clone" && repository !== undefined) {
    const path = ownedPath(resolve(options.cwd ?? getWorld().runRoot, repository));
    await mkdir(path, { recursive: true });
  }
  await applyEffects(script, repository, options);
  return { stdout: script.stdout ?? "", stderr: script.stderr ?? "" };
}

export function execFile(file, args, options, callback) {
  if (typeof args === "function") {
    callback = args;
    args = [];
    options = {};
  } else if (typeof options === "function") {
    callback = options;
    options = {};
  }
  const promise = invoke(file, args ?? [], options ?? {});
  if (typeof callback === "function") {
    promise.then(
      ({ stdout, stderr }) => callback(null, stdout, stderr),
      (error) => callback(error, error.stdout ?? "", error.stderr ?? ""),
    );
  }
  return {
    kill() {
      record("process.child.kill", { file });
      return true;
    },
  };
}

Object.defineProperty(execFile, promisify.custom, {
  value: invoke,
});

export default { execFile };
