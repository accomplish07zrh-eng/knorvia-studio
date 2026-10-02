import type { ContextSection, ContextBuildResult, ContextBuilderConfig, EnvInfo } from "./types.js";
import type { ToolRegistry } from "../tool/registry.js";
export declare class ContextBuilder {
    constructor(config: ContextBuilderConfig);
    setToolRegistry(_registry: ToolRegistry): this;
    setEnvInfo(envInfo: EnvInfo): this;
    addSection(section: Omit<ContextSection, "chars" | "tokens" | "injectionTarget" | "cacheHint"> & Partial<Pick<ContextSection, "injectionTarget" | "cacheHint">>): this;
    build(): ContextBuildResult;
}
export declare function buildContextMetaUserBody(sections: ContextSection[]): string | null;
export declare function buildSkillsMetaUserBody(sections: ContextSection[]): string | null;
export declare function createContextBuilder(config: ContextBuilderConfig): ContextBuilder;
