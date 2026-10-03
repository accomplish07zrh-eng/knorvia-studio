export interface RendererAppearance {
  dark: boolean;
  theme: string;
}

/** Keep persisted tokens, including unrecognized values, without rewriting data. */
export function resolveRendererAppearance(
  savedTheme: string,
  prefersDark: () => boolean,
): RendererAppearance {
  switch (savedTheme) {
    case "system": {
      const dark = prefersDark();
      return { dark, theme: dark ? "knorvia-dark" : "knorvia-light" };
    }
    case "dark":
    case "knorvia-dark":
      return { dark: true, theme: "knorvia-dark" };
    case "light":
    case "knorvia-light":
      return { dark: false, theme: "knorvia-light" };
    default:
      return { dark: false, theme: savedTheme };
  }
}
