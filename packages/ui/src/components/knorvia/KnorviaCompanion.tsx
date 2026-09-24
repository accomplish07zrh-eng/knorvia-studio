import { useRef } from "react";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useMascotPreference } from "@/store/mascotPreferenceStore.js";
import { KnorviaMark } from "./KnorviaMark.js";
import { useKnorviaMotion } from "./useKnorviaMotion.js";

function Companion({ mode }: { mode: "animated" | "still" }) {
  const { intl } = useKnorviaIntl();
  const ref = useRef<HTMLButtonElement>(null);
  const rig = useKnorviaMotion(ref, mode);
  const label = intl.formatMessage({ id: "studio.mascot.greet" });
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      data-testid="knorvia-companion"
      className="pointer-events-auto w-18 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused sm:w-20"
      // 鼠标逗小助手不应让编辑器丢失焦点；键盘 Tab/Enter 仍可操作。
      onPointerDown={(event) => event.preventDefault()}
    >
      <KnorviaMark companion rig={rig} className="pointer-events-none block w-full select-none" />
    </button>
  );
}

export function KnorviaCompanion() {
  const mode = useMascotPreference((state) => state.mode);
  return mode === "hidden" ? null : (
    <div
      data-testid="knorvia-companion-dock"
      className="pointer-events-none relative flex h-20 shrink-0 items-end justify-end px-4 pb-1"
    >
      <Companion mode={mode} />
    </div>
  );
}
