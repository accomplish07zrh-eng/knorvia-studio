// Existing context collaborators only; import actual symbols at these paths.
import type { ContextSection, EnvInfo, ContextBuilderConfig, OutputStylePromptConfig, WorkflowActorContext } from './types.js';
import type { Model, ResolvedUserInstructions, SkillLoadOutcome } from '@knorvia/contracts';
// ./utils.js:
export declare function estimateTokens(text:string):number;
// ./sections/cli-prefix.js:
export declare function buildCliPrefixSection():ContextSection;
// ./sections/identity.js:
export declare function buildIdentitySection(outputStyle?:OutputStylePromptConfig):ContextSection;
// ./sections/workflow-actor.js:
export declare function buildWorkflowActorIdentitySection(actor:WorkflowActorContext):ContextSection;
// ./sections/env-info.js:
export declare function buildEnvInfoSection(envInfo:EnvInfo,model?:Model):ContextSection;
export declare function buildGitSystemContextSection(envInfo:EnvInfo):ContextSection|null;
// ./sections/skills.js:
export declare function buildSkillsSection(options:{outcome:SkillLoadOutcome;metadataBudget?:number}):ContextSection|null;
// ./sections/request-user-context.js:
export declare function buildRequestUserContextSection(input:{userInstructions?:ResolvedUserInstructions;memoryIndexContent?:string;memoryRoot?:string}):ContextSection|null;
// ./sections/current-date.js:
export declare function buildCurrentDateSection(currentDate:string|undefined):ContextSection|null;
// ./sections/memory.js:
export declare function buildMemorySection(memoryRoot:string|undefined):ContextSection|null;
// ./sections/desktop.js:
export declare function buildDesktopContextSection():ContextSection;
// ./dynamic-sections.js:
export declare function buildSessionGuidanceSection(toolNames:readonly string[],hasSkills?:boolean):ContextSection|null;
export declare function buildDynamicBehaviorSection():ContextSection;
export declare function buildOutputStyleSection(outputStyle:ContextBuilderConfig['outputStyle']):ContextSection|null;
export declare function buildContextManagementSection():ContextSection;
// ../tool/registry.js: ToolRegistry is a public interface; setToolRegistry ignores it.
// SkillLoadOutcome public shape: skills:SkillMetadata[];diagnostics:SkillDiagnostic[];totalDiscovered:number.
// Section payloads and Model/EnvInfo metadata are opaque; delegate without inspecting/reconstructing them.
