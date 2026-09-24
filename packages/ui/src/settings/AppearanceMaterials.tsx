import { useId, useRef, useState } from "react";
import { ArrowUp, ImageIcon, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Switch } from "@/components/ui/switch.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useAppearancePreference } from "@/store/appearancePreferenceStore.js";

function AppearanceRange({
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange(value: number): void;
}) {
  const id = useId();
  return (
    <div className={disabled ? "opacity-45" : ""}>
      <div className="mb-3 flex items-center justify-between gap-3 text-ui-base">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="text-foreground-subtle tabular-nums">
          {value}%
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        aria-valuetext={`${value}%`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-5 w-full cursor-pointer accent-foreground disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-input-border-focused"
      />
      <p id={`${id}-hint`} className="mt-2 text-ui-sm text-foreground-subtle">
        {hint}
      </p>
    </div>
  );
}
export function AppearanceMaterials() {
  const { intl } = useKnorviaIntl();
  const t = (id: string) => intl.formatMessage({ id: `settings.materials.${id}` });
  const {
    preferences: p,
    imageUrl,
    imageBusy,
    error,
    nativeGlassSupported,
    update,
    resetGlass,
    replaceImage,
    removeImage,
  } = useAppearancePreference((state) => state);
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const glassId = useId();
  const backgroundId = useId();
  const panel = "rounded-2xl border border-border bg-card p-5 space-y-5";
  const choose = (file?: File) => {
    if (file) void replaceImage(file);
  };
  return (
    <div className="@container space-y-4" data-testid="appearance-materials">
      <section className={panel} aria-labelledby={glassId}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 id={glassId} className="text-ui-lg font-semibold">
              {t("glass")}
            </h3>
            <p className="mt-1 text-ui-base text-foreground-subtle">{t("glassDescription")}</p>
          </div>
          <Switch
            checked={p.glassEnabled}
            onCheckedChange={(glassEnabled) => update({ glassEnabled })}
            aria-labelledby={glassId}
          />
        </div>
        <div className="grid items-center gap-6 @min-[720px]:grid-cols-2">
          <div
            className="knorvia-appearance-preview flex min-h-60 items-center justify-center overflow-hidden rounded-xl p-6"
            aria-label={t("preview")}
          >
            <div
              className="knorvia-appearance-preview-window w-full max-w-80 rounded-2xl border border-border p-4 shadow-lg"
              style={{
                background: `color-mix(in srgb, var(--knorvia-reading-base) ${p.glassEnabled ? 100 - p.transparency : 100}%, transparent)`,
                backdropFilter: p.glassEnabled ? "blur(20px)" : undefined,
              }}
            >
              <div className="mb-6 flex items-center gap-2 text-ui-sm">
                <span aria-hidden="true" className="flex gap-1">
                  {[0, 1, 2].map((n) => (
                    <i key={n} className="size-1.5 rounded-full bg-foreground-subtlest/60" />
                  ))}
                </span>
                <span>Knorvia</span>
              </div>
              <p className="text-ui-lg font-medium">{t("previewTitle")}</p>
              <p className="mt-1 text-ui-sm text-foreground-subtle">{t("previewDescription")}</p>
              <div
                className="mt-5 flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-ui-sm text-foreground-subtle"
                style={{
                  background: `color-mix(in srgb, var(--knorvia-reading-base) ${p.glassEnabled ? p.readingOpacity : 100}%, transparent)`,
                }}
              >
                {t("previewInput")}
                <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-white dark:text-black">
                  <ArrowUp className="size-3.5" />
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <AppearanceRange
              label={t("transparency")}
              hint={t("transparencyHint")}
              value={p.transparency}
              min={0}
              max={85}
              disabled={!p.glassEnabled}
              onChange={(transparency) => update({ transparency })}
            />
            <AppearanceRange
              label={t("reading")}
              hint={t("readingHint")}
              value={p.readingOpacity}
              min={65}
              max={100}
              disabled={!p.glassEnabled}
              onChange={(readingOpacity) => update({ readingOpacity })}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="max-w-lg text-ui-sm text-foreground-subtle">
            {t(nativeGlassSupported === false ? "fallback" : "retained")}
          </p>
          <Button variant="secondary" size="sm" onClick={resetGlass}>
            <RotateCcw className="size-3.5" />
            {t("reset")}
          </Button>
        </div>
      </section>
      <section
        className={`${panel} ${dragging ? "ring-2 ring-input-border-focused" : ""}`}
        aria-labelledby={backgroundId}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
          choose(event.dataTransfer.files[0]);
        }}
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 id={backgroundId} className="text-ui-lg font-semibold">
              {t("background")}
            </h3>
            <p className="mt-1 text-ui-base text-foreground-subtle">{t("backgroundDescription")}</p>
          </div>
          <Switch
            checked={p.backgroundEnabled}
            disabled={!p.imageId}
            onCheckedChange={(backgroundEnabled) => update({ backgroundEnabled })}
            aria-labelledby={backgroundId}
          />
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex h-28 w-36 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface">
            {imageUrl ? (
              <img src={imageUrl} alt={t("preview")} className="size-full object-cover" />
            ) : (
              <ImageIcon className="size-8 text-foreground-subtle" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="break-all text-ui-base font-medium">{p.imageName || t("choose")}</p>
            <p className="text-ui-sm text-foreground-subtle">{t("formats")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
                {imageBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {t(p.imageId ? "replace" : "upload")}
              </Button>
              {p.imageId || imageBusy ? (
                <Button variant="ghost" size="sm" onClick={removeImage}>
                  <X className="size-3.5" />
                  {t("remove")}
                </Button>
              ) : null}
            </div>
            <input
              ref={input}
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={t("upload")}
              onChange={(event) => {
                choose(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </div>
        </div>
        <p className="text-ui-sm text-foreground-subtle">{t("local")}</p>
      </section>
      {error ? (
        <p role="alert" className="text-ui-sm text-destructive">
          {t(`error.${error}`)}
        </p>
      ) : null}
    </div>
  );
}
