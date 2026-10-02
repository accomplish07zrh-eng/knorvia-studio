import type { FilePartSource, TurnAttachment } from "../../deps.js";
import type {
  resolveInlineMediaAttachment,
  resolveLocalMediaAttachment,
} from "../attachment-media-resolver.js";

export type InlineOptions = Parameters<typeof resolveInlineMediaAttachment>[3];
export type LocalOptions = Parameters<typeof resolveLocalMediaAttachment>[2];

export interface LocalMediaContext {
  absolutePath: string;
  attachment: TurnAttachment;
  filename: string;
  index: number;
  mime: string;
  options: LocalOptions;
  source: FilePartSource;
  stat: Awaited<ReturnType<LocalOptions["fileSystemPort"]["stat"]>>;
}
