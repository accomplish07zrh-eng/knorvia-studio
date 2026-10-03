// Original public type owner: apps/cli/packages/core/src/tool/handlers/read-text.ts
import { type FileSystemPort, type FileSystemReadTextRangeResult, type ReadTextOutput, type TraceContext } from "@knorvia/contracts";
export declare function formatReadTextOutput(output: ReadTextOutput): string;

// Original source-wrapper public declarations (no descriptor implementation table).
type SystemReminderDeliveryChannel = "request_prefix" | "current_turn" | "tool_result" | "history_continuity" | "mid_turn_event" | "real_user";
type SystemReminderLifecycle = "request_prefix" | "per_current_turn" | "runtime_local" | "tool_result" | "resume_history" | "mid_turn_event" | "real_user";
type SystemReminderProviderVisibility = "provider_visible" | "provider_hidden";
export declare const SYSTEM_REMINDER_PREFIX_SOURCES: readonly ["context_prefix", "skills_listing"];
export declare const SYSTEM_REMINDER_PERSISTED_SOURCES: readonly ["todo_reminder", "task_status", "tool_result_warning", "resume_referenced_session_context", "plan_file_reference", "resume_goal_state", "goal_state_change", "plugin_reference", "target_continuation", "goal_completion_verification", "rewind_notice", "conversation_fork", "selection_side_chat", "queued_system_notification", "shell_environment_change"];
export declare const SYSTEM_REMINDER_PER_REQUEST_SOURCES: readonly ["incoming_message", "hook_context", "runtime_mode", "plan_mode_exit", "output_style", "date_change", "referenced_session_context", "model_anomaly", "prompt_attachment", "diagnostics"];
export type SystemReminderPrefixSource = (typeof SYSTEM_REMINDER_PREFIX_SOURCES)[number];
export type SystemReminderPersistedSource = (typeof SYSTEM_REMINDER_PERSISTED_SOURCES)[number];
export type SystemReminderPerRequestSource = (typeof SYSTEM_REMINDER_PER_REQUEST_SOURCES)[number];
export type SystemReminderSource = SystemReminderPrefixSource | SystemReminderPersistedSource | SystemReminderPerRequestSource;
interface SystemReminderSourceDescriptor {
    source: SystemReminderSource;
    channel: SystemReminderDeliveryChannel;
    lifecycle: SystemReminderLifecycle;
    isMeta: boolean;
    providerVisibility: SystemReminderProviderVisibility;
    evidenceLabel: string;
}
export declare const SYSTEM_REMINDER_SOURCES: any;
export declare function getSystemReminderDescriptor(source: SystemReminderSource): SystemReminderSourceDescriptor;
export declare function isMidConversationSystemSource(source: SystemReminderSource): boolean;
export declare function wrapSystemReminderForSource(source: SystemReminderSource, body: string | readonly string[]): string;
export declare function wrapSystemReminder(body: string | readonly string[]): string;
export declare function sanitizeSystemReminderBody(body: string | readonly string[]): string;
export {};
