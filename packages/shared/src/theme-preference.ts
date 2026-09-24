export type ThemePreference = "light" | "dark" | "knorvia-light" | "knorvia-dark" | "system";
export type CanonicalThemePreference = "knorvia-light" | "knorvia-dark" | "system";

/** 旧值只在持久化读取边界接受；返回值可以安全写回当前产品偏好。 */
export function normalizeStoredThemePreference(value: unknown): CanonicalThemePreference | null {
  if (value === "system") return "system";
  if (value === "light" || value === "knorvia-light" || value === "zai-light")
    return "knorvia-light";
  if (value === "dark" || value === "knorvia-dark" || value === "zai-dark")
    return "knorvia-dark";
  return null;
}
