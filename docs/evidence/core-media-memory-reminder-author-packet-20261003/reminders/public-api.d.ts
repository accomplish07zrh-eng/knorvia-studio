import { type RuntimeMessageEntry, type RuntimeMessageMetadata } from "../../agent/message-history.js";
import type { CollaborationMode, OutputStylePromptConfig, SyntheticUserMessageSource, TodoItem } from "../deps.js";
export declare function buildDateChangeReminderBody(_previousDate: string, currentDate: string): string;
export declare function runtimeMetadataForSyntheticUserMessageSource(source: SyntheticUserMessageSource): RuntimeMessageMetadata;
export declare function shouldBuildTodoReminder(entries: readonly RuntimeMessageEntry[]): boolean;
export declare function buildTodoReminderBody(todos: readonly TodoItem[]): string;
export declare function buildRuntimeModeReminderBody(entries: readonly RuntimeMessageEntry[], mode: CollaborationMode, planEnabled?: boolean): string | null;
export declare function buildPlanModeExitReminderBody(): string;
export declare function buildRuntimeOutputStyleReminderBody(outputStyle: OutputStylePromptConfig | undefined): string | null;
