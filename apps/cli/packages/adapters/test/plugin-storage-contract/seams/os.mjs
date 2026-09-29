// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { getWorld, record } from "./state.mjs";

export function tmpdir() {
  const value = `${getWorld().runRoot}/tmp`;
  record("os.tmpdir", { value });
  return value;
}

export function homedir() {
  const value = `${getWorld().runRoot}/home`;
  record("os.homedir", { value });
  return value;
}

export default { tmpdir, homedir };
