export const APPEARANCE_KEY = "knorvia-studio:appearance:v1";
export const DEFAULT_GLASS = { transparency: 62, readingOpacity: 86 } as const;
export interface AppearancePreferences {
  glassEnabled: boolean;
  transparency: number;
  readingOpacity: number;
  backgroundEnabled: boolean;
  imageId: string | null;
  imageName: string;
}
export const DEFAULT_APPEARANCE: AppearancePreferences = {
  glassEnabled: false,
  ...DEFAULT_GLASS,
  backgroundEnabled: false,
  imageId: null,
  imageName: "",
};
function percent(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}
export function normalizeAppearance(value: unknown): AppearancePreferences {
  const input = (value && typeof value === "object" ? value : {}) as Partial<AppearancePreferences>;
  const imageId =
    typeof input.imageId === "string" && /^[a-z0-9-]{1,80}$/i.test(input.imageId)
      ? input.imageId
      : null;
  return {
    glassEnabled: input.glassEnabled === true,
    transparency: percent(input.transparency, 62, 0, 85),
    readingOpacity: percent(input.readingOpacity, 86, 65, 100),
    backgroundEnabled: input.backgroundEnabled === true && Boolean(imageId),
    imageId,
    imageName: imageId && typeof input.imageName === "string" ? input.imageName.slice(0, 180) : "",
  };
}
export const MAX_BACKGROUND_BYTES = 20 * 1024 * 1024;
export function backgroundFileError(size: number, bytes: Uint8Array): string | null {
  if (size > MAX_BACKGROUND_BYTES) return "tooLarge";
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return png || jpeg || webp ? null : "invalidImage";
}
