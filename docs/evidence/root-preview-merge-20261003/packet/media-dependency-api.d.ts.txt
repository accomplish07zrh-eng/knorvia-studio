export type MediaPreviewKind = "audio" | "video";
export interface MediaPreviewFormat {
    extension: string;
    kind: MediaPreviewKind;
    mediaType: string;
}
export declare const MEDIA_PREVIEW_FORMATS: readonly MediaPreviewFormat[];
