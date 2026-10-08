/** 冻结的本地图片；内容不引用可变文件路径。 */
export interface StudioImageRef {
  id: string;
  filename: string;
  mimeType: "image/png" | "image/jpeg";
  sizeBytes: number;
  width: number;
  height: number;
  sha256: string;
}
export interface StudioImageInput extends StudioImageRef {
  dataBase64: string;
}
export interface StudioImageReadResult {
  input?: StudioImageInput;
  error?: string;
}
export const STUDIO_IMAGE_LIMITS = Object.freeze({
  count: 4,
  perImageBytes: 2 * 1024 * 1024,
  totalBytes: 4 * 1024 * 1024,
  edge: 8192,
  pixels: 16 * 1024 * 1024,
});
