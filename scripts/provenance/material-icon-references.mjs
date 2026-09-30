// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { basename } from "node:path";

export function matchesIconReference(path, reference) {
  const name = basename(path);
  switch (reference.match) {
    case "all":
      return true;
    case "open-folders":
      return /^folder-.+-open(?:_light)?\.svg$/.test(name);
    case "agent":
      return name === "agent.svg";
    default:
      throw new Error("Material icon asset reference has an unknown scope");
  }
}

export function materialIconReferences(component) {
  const primary = {
    commit: component.referenceRevision,
    match: "all",
    license: "MIT",
    retainedLicense: component.file,
    licenseSha256: component.sha256,
  };
  const references = [primary, ...(component.referenceSources ?? [])];
  const commits = new Set();
  for (const reference of references) {
    if (!/^[a-f0-9]{40}$/.test(reference.commit ?? "") || commits.has(reference.commit))
      throw new Error("Material icon asset reference requires distinct full commits");
    commits.add(reference.commit);
    matchesIconReference("fixture.svg", reference);
    if (
      reference.license !== "MIT" ||
      reference.retainedLicense !== component.file ||
      reference.licenseSha256 !== component.sha256
    )
      throw new Error("Material icon asset reference license binding differs");
  }
  return references;
}
