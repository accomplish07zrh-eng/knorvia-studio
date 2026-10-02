import type { SkillLoadOutcome } from "@knorvia/contracts";
import type { ContextSection } from "../types.js";
interface SkillsSectionOptions {
    outcome: SkillLoadOutcome;
    metadataBudget?: number;
}
export declare function buildSkillsSection(options: SkillsSectionOptions): ContextSection | null;
export {};
