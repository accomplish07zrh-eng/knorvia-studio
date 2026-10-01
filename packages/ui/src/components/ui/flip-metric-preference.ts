// SPDX-License-Identifier: Apache-2.0
// Source-exposed B5 replacement candidate; authorship/license review remains pending.

/** A mounted metric owns its preference subscription; no application preference is written. */
export function observeMetricMotion(deliver: (reduced: boolean) => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const changed = () => deliver(media.matches);
  changed();
  const modern = typeof media.addEventListener === "function";
  if (modern) media.addEventListener("change", changed);
  else media.addListener(changed);
  return () => {
    if (modern) media.removeEventListener("change", changed);
    else media.removeListener(changed);
  };
}
