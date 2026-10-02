// Actual @knorvia/contracts runtime collaborator:
import type { ModelMessageContent } from '@knorvia/contracts';
export declare function modelMessageContentToText(content: ModelMessageContent): string;
// Existing ../system-reminder/source.js public data, import actual symbol/type:
export type SystemReminderSource =
 "context_prefix"|"skills_listing"|"todo_reminder"|"task_status"|"tool_result_warning"|
 "resume_referenced_session_context"|"plan_file_reference"|"resume_goal_state"|"goal_state_change"|
 "plugin_reference"|"target_continuation"|"goal_completion_verification"|"rewind_notice"|
 "conversation_fork"|"selection_side_chat"|"queued_system_notification"|"shell_environment_change"|
 "incoming_message"|"hook_context"|"runtime_mode"|"plan_mode_exit"|"output_style"|"date_change"|
 "referenced_session_context"|"model_anomaly"|"prompt_attachment"|"diagnostics";
export declare const SYSTEM_REMINDER_SOURCES: readonly SystemReminderSource[];
// Ordered runtime values follow the union listing above; import the real constant.
