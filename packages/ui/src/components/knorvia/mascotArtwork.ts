/** Knorvia's own geometry, shared by the small mark and its animated companion. */
export const KNORVIA_HEAD =
  "M60 12C80 11 96 20 102 36C107 49 108 68 102 82C96 95 81 99 61 99C40 99 24 94 18 81C12 68 13 49 18 35C23 20 39 13 60 12Z";

/** Four continuous cubic segments morph a soft oval into a curved smiling eyelid. */
export function knorviaEyePath(cx: number, openness = 1, smile = 0) {
  const cy = 57;
  const radius = 11.6;
  const height = 13 * Math.max(0.045, Math.min(1.2, openness));
  const curved = Math.max(0, Math.min(1, smile));
  const k = 0.55228475;
  const lower = height * (1 - curved * 1.48);
  const lowerControl = height * k * (1 - curved * 1.72);
  const n = (value: number) => Number(value.toFixed(3));
  return `M${n(cx - radius)} ${cy}C${n(cx - radius)} ${n(cy - height * k)} ${n(cx - radius * k)} ${n(cy - height)} ${cx} ${n(cy - height)}C${n(cx + radius * k)} ${n(cy - height)} ${n(cx + radius)} ${n(cy - height * k)} ${n(cx + radius)} ${cy}C${n(cx + radius)} ${n(cy + lowerControl)} ${n(cx + radius * k)} ${n(cy + lower)} ${cx} ${n(cy + lower)}C${n(cx - radius * k)} ${n(cy + lower)} ${n(cx - radius)} ${n(cy + lowerControl)} ${n(cx - radius)} ${cy}Z`;
}
