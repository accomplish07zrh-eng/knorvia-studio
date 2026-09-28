// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import { maybeThrowStorageFsFault } from "../fs-fault-injection.js";

export function getDefaultSessionDbPath(): string {
  return join(resolveKnorviaDataRoot(), "cli", "db", "db.sqlite");
}

export function ensureParentDir(filePath: string): void {
  const parent = dirname(filePath);
  if (existsSync(parent)) return;
  maybeThrowStorageFsFault({ operation: "mkdir", path: parent });
  mkdirSync(parent, { recursive: true });
}
