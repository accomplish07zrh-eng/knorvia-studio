import { createElement } from "react";

export const metricCases = [
  { value: "" },
  { value: "0123456789: .KM-+" },
  { value: "１２٣💡é" },
  { value: "12:34", animateInitial: true, className: "font-mono text-ui-caption" },
  { value: "9", className: "overflow-visible leading-5" },
];
type ToastViewProps = Parameters<
  typeof import("../src/components/ui/toast.js").ToastMessageView
>[0];
export function toastCases(): ToastViewProps[] {
  const cases: ToastViewProps[] = [];
  for (const position of ["top-center", "top-right", "bottom-left", "bottom-center"] as const) {
    for (const variant of ["default", "update", "info", "warning"] as const) {
      for (const visible of [false, true]) {
        cases.push({
          item: {
            id: 0,
            message: "Title\n  Body\nsecond line  ",
            durationMs: 0,
            position,
            variant,
            actionLabel: "A long team label 汉字",
            dismissible: true,
            dismissLabel: "Dismiss notice",
          },
          visible,
          isBottom: position.startsWith("bottom"),
        });
      }
    }
  }
  cases.push({
    item: {
      id: 1,
      message: "Title",
      durationMs: 3000,
      position: "top-center" as const,
      variant: "info" as const,
    },
    visible: true,
    isBottom: false,
  });
  return cases;
}
export const anchorCase = {
  anchorId: "absent",
  items: [
    {
      id: 3,
      message: "anchored",
      durationMs: 0,
      position: "top-center" as const,
    },
  ],
  onDone: () => {},
};
export function views(
  ui: Pick<
    typeof import("../src/components/ui/toast.js"),
    "ToastMessageView" | "AnchoredToastStack"
  > &
    Pick<typeof import("../src/components/ui/flip-metric-value.js"), "FlipMetricValue">,
) {
  return [
    ...metricCases.map((props) => createElement(ui.FlipMetricValue, props)),
    ...toastCases().map((props) => createElement(ui.ToastMessageView, props)),
    createElement(ui.AnchoredToastStack, anchorCase),
    createElement(ui.ToastMessageView, {
      ...toastCases()[6]!,
      title: "",
      body: "",
      onAction: () => {},
      onDismiss: () => {},
    }),
  ];
}
