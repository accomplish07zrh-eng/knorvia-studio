// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
export function isOpenCodeGoBaseUrl(baseURL: string | undefined): boolean {
  if (!baseURL) return false;
  try {
    const url = new URL(baseURL);
    return url.origin === "https://opencode.ai" && /^\/zen\/go\/v1\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}
