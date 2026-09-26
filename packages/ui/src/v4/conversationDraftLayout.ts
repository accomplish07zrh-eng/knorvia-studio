/** 与原会话时间线共享草稿布局，避免换内核时问候语和输入框跳动。 */
export const CONVERSATION_DRAFT_LAYOUT =
  "flex min-h-full flex-col items-center px-4 before:block before:min-h-[52px] before:w-full before:shrink before:basis-[29dvh] before:content-[''] after:block after:min-h-4 after:w-full after:flex-1 after:content-['']";
export const CONVERSATION_DRAFT_COMPACT_LAYOUT =
  "flex min-h-full flex-col items-center justify-center gap-4 px-4";

/** 输入区与问候语的间距同属草稿布局，所有内核共用。 */
export const CONVERSATION_DRAFT_COMPOSER_LAYOUT = "mt-3 shrink-0";
