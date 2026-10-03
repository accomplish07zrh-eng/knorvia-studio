import { type MessagePart } from "@knorvia/contracts";
export declare function formatPartForContext(part: MessagePart): string | null;
export declare function dedupeParts(parts: MessagePart[]): MessagePart[];
