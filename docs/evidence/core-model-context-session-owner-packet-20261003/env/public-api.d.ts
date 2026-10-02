import type { ContextSection, EnvInfo } from "../types.js";
import type { Model } from "@knorvia/contracts";
export declare function buildEnvInfoSection(envInfo: EnvInfo, model?: Model): ContextSection;
export declare function buildGitSystemContextSection(envInfo: EnvInfo): ContextSection | null;
export declare function isEnvInfoGitRepository(info: EnvInfo): boolean;
