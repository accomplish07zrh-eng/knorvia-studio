import { useEffect, useState, type CSSProperties } from "react";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useAppearancePreference } from "@/store/appearancePreferenceStore.js";
import "./appearance.css";

export function AppearanceLayer() {
  const platform = usePlatform();
  const { preferences, imageUrl, reload, nativeGlassSupported, setNativeGlassSupported } =
    useAppearancePreference((state) => state);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(
      "(prefers-reduced-transparency: reduce), (forced-colors: active)",
    );
    const refresh = () => setReduced(media.matches);
    refresh();
    media.addEventListener("change", refresh);
    return () => media.removeEventListener("change", refresh);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  const glass = preferences.glassEnabled && !reduced;
  const background = preferences.backgroundEnabled && Boolean(imageUrl) && !reduced;
  useEffect(() => {
    let active = true;
    void (platform.setWindowGlass?.(glass) ?? Promise.resolve(false))
      .then((supported) => {
        if (active) setNativeGlassSupported(supported);
      })
      .catch(() => {
        if (active) setNativeGlassSupported(false);
      });
    return () => {
      active = false;
    };
  }, [glass, platform, setNativeGlassSupported]);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("knorvia-materials", glass || background);
    root.classList.toggle("knorvia-glass", glass);
    root.style.setProperty(
      "--knorvia-shell-opacity",
      `${glass ? 100 - preferences.transparency : 32}%`,
    );
    root.style.setProperty(
      "--knorvia-reading-opacity",
      `${glass ? preferences.readingOpacity : 90}%`,
    );
    return () => {
      root.classList.remove("knorvia-materials", "knorvia-glass");
      root.style.removeProperty("--knorvia-shell-opacity");
      root.style.removeProperty("--knorvia-reading-opacity");
    };
  }, [glass, background, preferences.transparency, preferences.readingOpacity]);
  if (!glass && !background) return null;
  const style = background ? { backgroundImage: `url(${JSON.stringify(imageUrl)})` } : undefined;
  return (
    <div
      className="knorvia-appearance-layer"
      aria-hidden="true"
      data-testid="appearance-background"
      style={
        !background && nativeGlassSupported !== true
          ? { background: "var(--knorvia-window-base)" }
          : undefined
      }
    >
      {background ? (
        <div className="knorvia-appearance-image" style={style as CSSProperties} />
      ) : null}
      <div className="knorvia-appearance-tint" />
    </div>
  );
}
