// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { invocation } from "./tool-invocation-fixture.js";

export function tool(name: string, aliases: string[] = []) {
  const entry = invocation().entry;
  entry.metadata.name = name;
  entry.aliases = aliases;
  return entry;
}
