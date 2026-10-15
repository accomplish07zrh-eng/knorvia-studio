// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// context 区的公开桶：类型、builder 与估算工具整体转出，各 section builder 逐条列名转出。
export * from "./types.js";
export * from "./builder.js";
export * from "./utils.js";

export { buildCliPrefixSection } from "./sections/cli-prefix.js";
export { buildIdentitySection } from "./sections/identity.js";
export { buildWorkflowActorIdentitySection } from "./sections/workflow-actor.js";
export { buildEnvInfoSection, buildGitSystemContextSection } from "./sections/env-info.js";
export { buildSkillsSection } from "./sections/skills.js";
export { buildCurrentDateSection } from "./sections/current-date.js";
export { buildMemorySection } from "./sections/memory.js";
export { buildDesktopContextSection } from "./sections/desktop.js";
