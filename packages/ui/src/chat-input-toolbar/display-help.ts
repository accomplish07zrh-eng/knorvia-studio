import type { KnorviaProvider } from "@knorvia/shared";

export const KNORVIA_MODE_OPTION_LABEL_IDS: Record<KnorviaProvider, Record<string, string>> = {
  knorvia: {
    build: "mode.label.knorvia.build",
    edit: "mode.label.knorvia.edit",
    plan: "mode.label.knorvia.plan",
    yolo: "mode.label.knorvia.yolo",
  },
};

export const KNORVIA_MODE_OPTION_DESCRIPTION_IDS: Record<
  KnorviaProvider,
  Record<string, string>
> = {
  knorvia: {
    build: "mode.description.knorvia.build",
    edit: "mode.description.knorvia.edit",
    plan: "mode.description.knorvia.plan",
    yolo: "mode.description.knorvia.yolo",
  },
};
