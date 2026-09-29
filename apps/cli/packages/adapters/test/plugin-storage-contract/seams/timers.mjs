// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export function setTimeout(callback, delay = 0, ...args) {
  return globalThis.setTimeout(callback, delay, ...args);
}

export function clearTimeout(handle) {
  return globalThis.clearTimeout(handle);
}

export default { clearTimeout, setTimeout };
