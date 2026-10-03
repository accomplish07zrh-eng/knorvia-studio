import { activeSessionMessages, modelMessageContentToText } from "../deps.js";
import { buildPromptAttachmentBlocks, buildPromptAttachmentReminderBodies, type PromptAttachmentReminderInput, } from "../../system-reminder/prompt-attachment.js";
import { realUserRuntimeMetadata, systemReminderAttachmentEntry, type RuntimeMessageEntry, } from "../../agent/message-history.js";
import type { MessageId, MessageWithParts, ModelMessageContent, ModelMessageContentBlock, } from "../deps.js";
import type { ResolvedTurnAttachment, RunModelTextRequestOptions } from "../types.js";
