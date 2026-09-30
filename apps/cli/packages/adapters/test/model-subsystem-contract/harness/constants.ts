// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import path from "node:path";

export { TARGET_MODULES } from "./target-modules.js";
export type { TargetModuleName } from "./target-modules.js";

export const SUITE_ROOT_ENV = "KNORVIA_MODEL_CONTRACT_SUITE_ROOT";
export const PACKAGE_ANCHOR_ENV = "KNORVIA_MODEL_CONTRACT_PACKAGE_ANCHOR";
export const EVIDENCE_ROOT_ENV = "KNORVIA_MODEL_CONTRACT_EVIDENCE_ROOT";
export const METAFILE_EVIDENCE_ENV = "KNORVIA_MODEL_CONTRACT_METAFILE_EVIDENCE";
export const TARGET_ENV = "KNORVIA_MODEL_CONTRACT_TARGET";
export const TARGET_KIND_ENV = "KNORVIA_MODEL_CONTRACT_TARGET_KIND";
export const SEAM_SYMBOL_KEY = "knorvia.model.contract.seams";

function requiredAbsoluteDirectoryEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || !path.isAbsolute(value)) {
    throw new Error(`${name} must name one explicit absolute directory`);
  }
  return path.resolve(value);
}

export const SUITE_ROOT = requiredAbsoluteDirectoryEnv(SUITE_ROOT_ENV);
export const EVIDENCE_ROOT = requiredAbsoluteDirectoryEnv(EVIDENCE_ROOT_ENV);
export const REPO_PACKAGE_JSON = (() => {
  const value = process.env[PACKAGE_ANCHOR_ENV];
  if (value === undefined || !path.isAbsolute(value) || path.basename(value) !== "package.json") {
    throw new Error(`${PACKAGE_ANCHOR_ENV} must name one explicit absolute package.json`);
  }
  return path.resolve(value);
})();

export type TargetKind = "source" | "dist";

export const TARGET_KIND = (() => {
  const value = process.env[TARGET_KIND_ENV];
  if (value !== "source" && value !== "dist") {
    throw new Error(`${TARGET_KIND_ENV} must be source or dist`);
  }
  return value;
})();
