// SPDX-License-Identifier: Apache-2.0

// Knorvia 动态工作流：用户面产物（Artifact）配额限制与标识符正则

export const ARTIFACT_CAPS = {
  maxArtifactsPerRun: 32,
  maxVersionsPerArtifact: 16,
  maxFileBytes: 20971520,
  maxMarkdownBytes: 262144,
  maxTitleLength: 120,
  maxDescriptionLength: 500,
  maxSpecSerializedBytes: 8192,
  maxIdLength: 64,
} as const;

export const ARTIFACT_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;
