// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { coerce, gt, valid } from "semver";

export type PluginUpdateStatus = "none" | "update-available" | "version-changed";

export function comparePluginVersions(input: {
  installed: string | undefined;
  latest: string | undefined;
}): PluginUpdateStatus {
  const { installed, latest } = input;
  if (!installed || !latest) return "none";

  const installedVersion = valid(coerce(installed) ?? installed);
  const latestVersion = valid(coerce(latest) ?? latest);
  if (installedVersion && latestVersion) {
    return gt(latestVersion, installedVersion) ? "update-available" : "none";
  }
  return installed === latest ? "none" : "version-changed";
}

export function comparePluginUpdate(input: {
  installedVersion: string | undefined;
  installedSha: string | undefined;
  latestVersion: string | undefined;
  latestSha: string | undefined;
}): PluginUpdateStatus {
  if (input.latestVersion) {
    return comparePluginVersions({
      installed: input.installedVersion,
      latest: input.latestVersion,
    });
  }
  if (!input.latestSha) return "none";
  if (!input.installedSha) return "version-changed";
  return input.installedSha === input.latestSha ? "none" : "update-available";
}
