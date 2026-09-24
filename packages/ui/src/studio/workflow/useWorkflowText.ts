import { useCallback } from "react";
import { useKnorviaIntl } from "../../i18n/IntlProvider.js";

export function useWorkflowText() {
  const { intl } = useKnorviaIntl();
  return useCallback(
    (key: string, values?: Record<string, string | number>) =>
      intl.formatMessage({ id: `studio.workflow.${key}` }, values),
    [intl],
  );
}
